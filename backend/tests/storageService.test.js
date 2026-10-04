// Miniature (grille "Mes souvenirs" de l'atelier) et version intermediaire
// (affichage une fois placee) : l'original ne doit JAMAIS etre modifie EN
// DESSOUS DE ORIGINAL_MAX_PX (seule source du rendu PDF final jusqu'a cette
// taille) ; les deux variantes generees doivent etre reellement plus
// legeres, jamais plus grandes que l'original (pas d'agrandissement d'une
// photo deja petite). Au-dela de ORIGINAL_MAX_PX (retour utilisateur,
// 2026-09-29 : quota de stockage), l'original stocke est desormais
// plafonne — voir le describe dedie plus bas.

const sharp = require('sharp');
const sizeOf = require('image-size');

const uploadCalls = [];
const mockStorageList = jest.fn(async () => ({ data: [], error: null }));
const mockStorageRemove = jest.fn(async () => ({ data: [], error: null }));

jest.mock('../config/supabase', () => ({
  storage: {
    from: (bucket) => ({
      upload: jest.fn(async (fileName, buffer, options) => {
        uploadCalls.push({ bucket, fileName, buffer, contentType: options?.contentType });
        return { data: { path: fileName }, error: null };
      }),
      getPublicUrl: (fileName) => ({ data: { publicUrl: `https://cdn.test/${fileName}` } }),
      list: (...args) => mockStorageList(bucket, ...args),
      remove: (...args) => mockStorageRemove(bucket, ...args)
    })
  }
}));

const { uploadFile, deleteBookFolder } = require('../services/storageService');

async function makeJpegBuffer(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } } })
    .jpeg()
    .toBuffer();
}

beforeEach(() => {
  uploadCalls.length = 0;
  mockStorageList.mockClear().mockResolvedValue({ data: [], error: null });
  mockStorageRemove.mockClear().mockResolvedValue({ data: [], error: null });
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

  // Comportement INVERSE depuis le plan de mise en production ("protection
  // des uploads", 2026-10-04) : un fichier dont le CONTENU n'est pas une
  // image reelle est maintenant refuse avant tout envoi au stockage. Avant
  // ce correctif, seul l'en-tete Content-Type declare par le navigateur
  // etait verifie (middleware/upload.js) — un fichier quelconque avec
  // `Content-Type: image/jpeg` passait ce filtre et partait vers le
  // stockage tel quel.
  it("refuse (sans rien envoyer au stockage) un fichier dont le contenu n'est pas une image valide", async () => {
    const file = { originalname: 'corrompu.jpg', mimetype: 'image/jpeg', buffer: Buffer.from("ceci n'est pas une image") };
    const result = await uploadFile('contribution-photos', file, 'book-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/pas une image valide/);
    expect(uploadCalls).toHaveLength(0); // rien n'atteint Storage
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

// HEIC/HEIF (format par defaut des photos iPhone, retour utilisateur,
// 2026-10-05 : plusieurs photos rejetees a l'upload "format non supporte").
// sharp ne sait PAS ENCODER du HEVC (licence, verifie manuellement : seul
// compression:'av1' fonctionne, 'hevc' leve "Unsupported compression") — ce
// fixture est donc un conteneur HEIF code AV1, pas un vrai .heic d'iPhone
// (code HEVC). sharp detecte les deux de la meme facon (metadata.format ===
// 'heif', exactement ce que convertHeicToJpeg verifie) : ce test verifie
// reellement le chemin de code (detection + conversion + orientation), pas
// le codec specifique d'un vrai iPhone — a confirmer en conditions reelles
// avec une vraie photo iPhone.
describe('storageService.uploadFile — HEIC/HEIF (photos iPhone)', () => {
  it('une photo HEIF est convertie en JPEG (jamais stockee telle quelle)', async () => {
    const source = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 200, b: 30 } } })
      .jpeg()
      .toBuffer();
    const heif = await sharp(source).heif({ quality: 80, compression: 'av1' }).toBuffer();
    const file = { originalname: 'photo.heic', mimetype: 'image/heic', buffer: heif };

    const result = await uploadFile('contribution-photos', file, 'book-1');

    expect(result.success).toBe(true);
    expect(result.fileName.endsWith('.jpg')).toBe(true);
    const originalCall = uploadCalls.find((call) => call.fileName === result.fileName);
    expect(originalCall.contentType).toBe('image/jpeg');
    const dims = sizeOf(originalCall.buffer);
    expect(dims.width).toBe(300);
    expect(dims.height).toBe(200);
    expect(result.thumbnailUrl).toBeDefined();
    expect(result.previewUrl).toBeDefined();
  });

  it("un fichier non reconnu nomme en .heic garde le message GENERIQUE (jamais le message HEIC specifique sur un fichier qui n'a jamais ete du HEIC)", async () => {
    const file = { originalname: 'corrompu.heic', mimetype: 'image/heic', buffer: Buffer.from("ceci n'est pas une image") };
    const result = await uploadFile('contribution-photos', file, 'book-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/pas une image valide/);
    expect(uploadCalls).toHaveLength(0);
  });
});

// Plafond du stockage de l'original (retour utilisateur, 2026-09-29 : quota
// Supabase depasse, 83% du bucket photos venant d'originaux dont les pixels
// au-dela de 2600px (le plus gros besoin reel, voir scripts/audit-egress.js)
// ne servent jamais a rien).
describe("storageService.uploadFile — plafond de l'original (ORIGINAL_MAX_PX)", () => {
  it('une photo plus grande que le plafond est redimensionnee ET reencodee en JPEG, meme si elle etait un PNG', async () => {
    const grande = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: { r: 10, g: 200, b: 30 } } })
      .png()
      .toBuffer();
    const file = { originalname: 'grande.png', mimetype: 'image/png', buffer: grande };

    const result = await uploadFile('contribution-photos', file, 'book-1');

    expect(result.success).toBe(true);
    // Extension ET type MIME suivent les VRAIS octets stockes (JPEG), pas le
    // fichier d'origine : un .png dont le contenu est en realite du JPEG
    // casserait sa lecture ailleurs.
    expect(result.fileName.endsWith('.jpg')).toBe(true);
    const originalCall = uploadCalls.find((call) => call.fileName === result.fileName);
    expect(originalCall.contentType).toBe('image/jpeg');
    expect(originalCall.buffer).not.toBe(grande); // reencode : reference differente
    expect(originalCall.buffer.length).toBeLessThan(grande.length);

    const dims = sizeOf(originalCall.buffer);
    expect(Math.max(dims.width, dims.height)).toBeLessThanOrEqual(3000);
    // Aspect ratio (3:2) preserve, pas de deformation.
    expect(Math.round((dims.width / dims.height) * 100)).toBe(150);
    expect(result.width).toBeLessThanOrEqual(3000); // les dimensions renvoyees refletent le fichier REELLEMENT stocke
  });

  it('une photo egale ou plus petite que le plafond traverse octet pour octet, inchangee (comportement historique preserve)', async () => {
    const normale = await makeJpegBuffer(3000, 2000); // exactement au plafond
    const file = { originalname: 'normale.jpg', mimetype: 'image/jpeg', buffer: normale };

    const result = await uploadFile('contribution-photos', file, 'book-1');

    expect(result.fileName.endsWith('.jpg')).toBe(true);
    const originalCall = uploadCalls.find((call) => call.fileName === result.fileName);
    expect(originalCall.buffer).toBe(normale);
    expect(originalCall.contentType).toBe('image/jpeg');
  });

  it("les vignettes/preview restent generees a partir de l'original PLAFONNE quand un plafonnage a eu lieu (jamais depuis l'original brut)", async () => {
    const grande = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: { r: 80, g: 40, b: 120 } } })
      .jpeg()
      .toBuffer();
    const file = { originalname: 'grande.jpg', mimetype: 'image/jpeg', buffer: grande };

    const result = await uploadFile('contribution-photos', file, 'book-1');

    // Toujours 3 uploads (original plafonne + thumbnail + preview), et la
    // preview (1600px) reste bien plus petite que le plafond (3000px) : la
    // chaine de derivation continue de fonctionner normalement en aval.
    expect(uploadCalls).toHaveLength(3);
    const previewCall = uploadCalls.find((call) => call.fileName.endsWith('_preview.jpg'));
    const previewDims = sizeOf(previewCall.buffer);
    expect(Math.max(previewDims.width, previewDims.height)).toBeLessThanOrEqual(1600);
    expect(result.thumbnailUrl).toBeDefined();
    expect(result.previewUrl).toBeDefined();
  });
});

// Suppression d'un livre entier (nettoyage des brouillons, purge des
// comptes anonymes abandonnes) : les photos vivent sous <bucket>/<bookId>/
// (voir uploadFile) — lister puis supprimer ce dossier retrouve TOUT,
// y compris un fichier dont la ligne book_content_items a deja disparu.
describe('storageService.deleteBookFolder', () => {
  it('liste le dossier du livre et supprime chaque fichier trouve', async () => {
    mockStorageList.mockResolvedValueOnce({
      data: [{ name: 'a.jpg' }, { name: 'a_thumb.jpg' }, { name: 'a_preview.jpg' }],
      error: null
    });

    const resultat = await deleteBookFolder('contribution-photos', 'book-abandonne-1');

    expect(resultat).toEqual({ success: true, removed: 3 });
    expect(mockStorageList).toHaveBeenCalledWith('contribution-photos', 'book-abandonne-1');
    expect(mockStorageRemove).toHaveBeenCalledWith('contribution-photos', [
      'book-abandonne-1/a.jpg', 'book-abandonne-1/a_thumb.jpg', 'book-abandonne-1/a_preview.jpg'
    ]);
  });

  it('un dossier vide ou absent ne leve jamais — juste rien a supprimer', async () => {
    mockStorageList.mockResolvedValueOnce({ data: [], error: null });
    const resultat = await deleteBookFolder('contribution-photos', 'book-sans-photo');
    expect(resultat).toEqual({ success: true, removed: 0 });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('une erreur de stockage est rapportee, jamais levee', async () => {
    mockStorageList.mockRejectedValueOnce(new Error('reseau indisponible'));
    const resultat = await deleteBookFolder('contribution-photos', 'book-x');
    expect(resultat.success).toBe(false);
    expect(resultat.removed).toBe(0);
  });
});
