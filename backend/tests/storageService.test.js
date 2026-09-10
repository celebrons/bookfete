// Miniature (grille "Mes souvenirs" de l'atelier) et version intermediaire
// (affichage une fois placee) : l'original ne doit JAMAIS etre modifie (seule
// source du rendu PDF final) ; les deux variantes generees doivent etre
// reellement plus legeres, jamais plus grandes que l'original (pas
// d'agrandissement d'une photo deja petite).

const sharp = require('sharp');
const sizeOf = require('image-size');

const uploadCalls = [];

jest.mock('../config/supabase', () => ({
  storage: {
    from: (bucket) => ({
      upload: jest.fn(async (fileName, buffer, options) => {
        uploadCalls.push({ bucket, fileName, buffer, contentType: options?.contentType });
        return { data: { path: fileName }, error: null };
      }),
      getPublicUrl: (fileName) => ({ data: { publicUrl: `https://cdn.test/${fileName}` } })
    })
  }
}));

const { uploadFile } = require('../services/storageService');

async function makeJpegBuffer(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } } })
    .jpeg()
    .toBuffer();
}

beforeEach(() => {
  uploadCalls.length = 0;
});

describe('storageService.uploadFile — miniature/preview, original jamais modifie', () => {
  it("uploade l'original tel quel (memes octets), plus une miniature et une preview reellement plus legeres", async () => {
    const original = await makeJpegBuffer(3000, 2000);
    const file = { originalname: 'photo.jpg', mimetype: 'image/jpeg', buffer: original };

    const result = await uploadFile('contribution-photos', file, 'book-1');

    expect(result.success).toBe(true);
    expect(uploadCalls).toHaveLength(3); // original + thumbnail + preview

    const originalCall = uploadCalls.find((call) => call.fileName === result.fileName);
    expect(originalCall.buffer).toBe(original); // reference identique : jamais retraite

    const thumbCall = uploadCalls.find((call) => call.fileName.endsWith('_thumb.jpg'));
    const previewCall = uploadCalls.find((call) => call.fileName.endsWith('_preview.jpg'));
    expect(thumbCall).toBeDefined();
    expect(previewCall).toBeDefined();
    expect(thumbCall.buffer.length).toBeLessThan(original.length);
    expect(previewCall.buffer.length).toBeLessThan(original.length);
    expect(thumbCall.buffer.length).toBeLessThan(previewCall.buffer.length);

    const thumbDims = sizeOf(thumbCall.buffer);
    const previewDims = sizeOf(previewCall.buffer);
    expect(Math.max(thumbDims.width, thumbDims.height)).toBeLessThanOrEqual(480);
    expect(Math.max(previewDims.width, previewDims.height)).toBeLessThanOrEqual(1600);
    // Aspect ratio (3:2) preserve, pas de deformation.
    expect(Math.round((thumbDims.width / thumbDims.height) * 100)).toBe(150);

    expect(result.thumbnailUrl).toContain('_thumb.jpg');
    expect(result.previewUrl).toContain('_preview.jpg');
    expect(result.url).not.toContain('_thumb');
    expect(result.url).not.toContain('_preview');
  });

  it("n'agrandit jamais une photo deja plus petite que la taille cible de la miniature", async () => {
    const original = await makeJpegBuffer(200, 100); // deja sous THUMBNAIL_MAX_PX (480)
    const file = { originalname: 'petite.jpg', mimetype: 'image/jpeg', buffer: original };

    await uploadFile('contribution-photos', file, 'book-1');

    const thumbCall = uploadCalls.find((call) => call.fileName.endsWith('_thumb.jpg'));
    const thumbDims = sizeOf(thumbCall.buffer);
    expect(thumbDims.width).toBeLessThanOrEqual(200);
    expect(thumbDims.height).toBeLessThanOrEqual(100);
  });

  it("l'upload de l'original reussit meme si le buffer n'est pas une image valide (jamais bloquant)", async () => {
    const file = { originalname: 'corrompu.jpg', mimetype: 'image/jpeg', buffer: Buffer.from("ceci n'est pas une image") };
    const result = await uploadFile('contribution-photos', file, 'book-1');

    expect(result.success).toBe(true);
    expect(result.thumbnailUrl).toBeUndefined();
    expect(result.previewUrl).toBeUndefined();
    expect(result.width).toBeUndefined();
    expect(uploadCalls).toHaveLength(1); // seul l'original (invalide) part vers Storage
  });
});

// Cahier des charges "PhotoSlot" (2026-09-10, §12) : "corriger correctement
// l'orientation EXIF". Ne doit reencoder QUE quand une rotation est
// reellement necessaire — sinon la garantie "original jamais retouche"
// ci-dessus (cas sans tag EXIF Orientation, le plus courant) resterait
// fausse.
describe("storageService.uploadFile — correction d'orientation EXIF", () => {
  it("une photo avec un tag EXIF Orientation (rotation necessaire) est physiquement corrigee avant l'upload", async () => {
    // orientation 6 = "tourner de 90° pour afficher correctement" (cas
    // classique photo prise telephone en portrait) : les dimensions RAW
    // sont 300x200 (paysage) mais l'affichage correct est 200x300 (portrait)
    // — sharp(...).rotate() doit produire un fichier dont les dimensions
    // reelles refletent deja cette rotation (plus besoin du tag ensuite).
    const raw = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 50, g: 60, b: 70 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const file = { originalname: 'portrait.jpg', mimetype: 'image/jpeg', buffer: raw };

    const result = await uploadFile('contribution-photos', file, 'book-1');

    expect(result.success).toBe(true);
    const originalCall = uploadCalls.find((call) => call.fileName === result.fileName);
    expect(originalCall.buffer).not.toBe(raw); // reencode : reference differente, attendu ici
    const dims = sizeOf(originalCall.buffer);
    expect(dims.width).toBe(200); // dimensions physiquement corrigees
    expect(dims.height).toBe(300);
    expect(dims.orientation === undefined || dims.orientation === 1).toBe(true); // tag remis a plat
    expect(result.width).toBe(200);
    expect(result.height).toBe(300);
  });

  it("une photo sans tag EXIF Orientation n'est jamais reencodee (meme garantie que le test ci-dessus)", async () => {
    const original = await makeJpegBuffer(400, 300);
    const file = { originalname: 'normale.jpg', mimetype: 'image/jpeg', buffer: original };

    const result = await uploadFile('contribution-photos', file, 'book-1');

    const originalCall = uploadCalls.find((call) => call.fileName === result.fileName);
    expect(originalCall.buffer).toBe(original);
  });
});
