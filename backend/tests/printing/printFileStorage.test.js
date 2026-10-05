// Premiere commande REELLE en echec (2026-10-05) : "The object exceeded the
// maximum allowed size" — le bucket print-files est plafonne a 50 Mo PAR LE
// PROJET Supabase (pas juste par le bucket, verifie manuellement : la
// limite elle-meme refuse d'etre relevee au-dela via l'API). Un livre de 36
// pages a produit un PDF de 62,7 Mo. compressPdfIfTooLarge (ghostscript,
// preset /printer) est le filet de securite : jamais declenche pour la
// grande majorite des livres, seulement pour un fichier qui depasserait la
// limite.

const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const mockExecFile = jest.fn();
jest.mock('child_process', () => ({
  execFile: (...args) => {
    const cb = args[args.length - 1];
    mockExecFile(...args).then((result) => cb(null, result)).catch((err) => cb(err));
  }
}));

const uploadCalls = [];
jest.mock('../../config/supabase', () => ({
  storage: {
    from: (bucket) => ({
      upload: jest.fn(async (uploadPath, buffer, options) => {
        uploadCalls.push({ bucket, uploadPath, size: buffer.length, contentType: options?.contentType });
        return { data: { path: uploadPath }, error: null };
      }),
      getPublicUrl: (uploadPath) => ({ data: { publicUrl: `https://cdn.test/print-files/${uploadPath}` } })
    })
  }
}));

const { uploadPrintFile, compressPdfIfTooLarge, MAX_SAFE_PDF_BYTES } = require('../../services/printing/printFileStorage');

async function writeTempFile(sizeBytes) {
  const filePath = path.join(os.tmpdir(), `printfile-test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  await fsp.writeFile(filePath, Buffer.alloc(sizeBytes, 1));
  return filePath;
}

beforeEach(() => {
  uploadCalls.length = 0;
  mockExecFile.mockReset();
});

describe('printFileStorage.uploadPrintFile — fichier sous la limite', () => {
  it("n'appelle jamais ghostscript et uploade le fichier tel quel", async () => {
    const filePath = await writeTempFile(1000); // tres petit, loin de MAX_SAFE_PDF_BYTES
    const url = await uploadPrintFile(filePath, 'orders/test-1/print-ready.pdf');

    expect(mockExecFile).not.toHaveBeenCalled();
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].size).toBe(1000);
    expect(url).toContain('orders/test-1/print-ready.pdf');

    await fsp.unlink(filePath);
  });
});

describe('printFileStorage.uploadPrintFile — fichier au-dessus de la limite (compression)', () => {
  it('compresse via ghostscript avant upload, et nettoie le fichier temporaire ensuite', async () => {
    const filePath = await writeTempFile(MAX_SAFE_PDF_BYTES + 1000);
    let compressedPathUtilise = null;

    mockExecFile.mockImplementation(async (bin, args) => {
      expect(bin).toBe('gs');
      // /printer + ColorConversionStrategy(ForImages)=/RGB : le reglage qui
      // a fini par marcher en conditions reelles le 2026-10-05, apres deux
      // essais rejetes par Gelato ("ICC profile is not valid") — Chrome
      // embarque un profil ICC "sRGB" maison (Skia) non standard pour
      // chaque photo ; /RGB convertit vers du DeviceRGB simple, sans aucun
      // profil ICC embarque (contrairement a UseDeviceIndependentColor, le
      // defaut de /printer, et a LeaveColorUnchanged, qui preservaient tous
      // deux le profil fautif).
      expect(args).toEqual(expect.arrayContaining([
        '-dPDFSETTINGS=/printer',
        '-dColorConversionStrategy=/RGB',
        '-dColorConversionStrategyForImages=/RGB'
      ]));
      const outputArg = args.find((a) => a.startsWith('-sOutputFile='));
      compressedPathUtilise = outputArg.slice('-sOutputFile='.length);
      // Simule une vraie compression : ecrit un fichier plus petit.
      await fsp.writeFile(compressedPathUtilise, Buffer.alloc(1000, 2));
      return {};
    });

    const url = await uploadPrintFile(filePath, 'orders/test-2/print-ready.pdf');

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(uploadCalls).toHaveLength(1);
    // C'est bien le fichier COMPRESSE (1000 octets) qui part au stockage,
    // pas l'original (MAX_SAFE_PDF_BYTES + 1000).
    expect(uploadCalls[0].size).toBe(1000);
    expect(url).toContain('orders/test-2/print-ready.pdf');

    // Le fichier temporaire compresse est nettoye apres l'upload.
    await expect(fsp.access(compressedPathUtilise)).rejects.toThrow();

    await fsp.unlink(filePath);
  });

  it("un echec de ghostscript n'empeche pas l'upload : retombe sur le fichier ORIGINAL", async () => {
    const filePath = await writeTempFile(MAX_SAFE_PDF_BYTES + 1000);
    mockExecFile.mockRejectedValue(new Error('gs: commande introuvable'));

    const url = await uploadPrintFile(filePath, 'orders/test-3/print-ready.pdf');

    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].size).toBe(MAX_SAFE_PDF_BYTES + 1000); // fichier original, inchange
    expect(url).toContain('orders/test-3/print-ready.pdf');

    await fsp.unlink(filePath);
  });
});

describe('printFileStorage.compressPdfIfTooLarge', () => {
  it('renvoie le chemin ORIGINAL sans y toucher quand le fichier est deja sous la limite', async () => {
    const filePath = await writeTempFile(100);
    const result = await compressPdfIfTooLarge(filePath);

    expect(result).toEqual({ path: filePath, compressed: false });
    expect(mockExecFile).not.toHaveBeenCalled();

    await fsp.unlink(filePath);
  });
});

describe('printFileStorage.uploadPrintFile — fichier non-PDF (couverture)', () => {
  it("n'appelle jamais ghostscript, meme un fichier image volumineux", async () => {
    const filePath = path.join(os.tmpdir(), `printfile-test-cover-${Date.now()}.jpg`);
    await fsp.writeFile(filePath, Buffer.alloc(MAX_SAFE_PDF_BYTES + 1000, 3));

    const url = await uploadPrintFile(filePath, 'orders/test-4/cover.jpg');

    expect(mockExecFile).not.toHaveBeenCalled();
    expect(uploadCalls[0].contentType).toBe('image/jpeg');
    expect(url).toContain('orders/test-4/cover.jpg');

    await fsp.unlink(filePath);
  });
});
