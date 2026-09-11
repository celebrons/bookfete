// Tests unitaires de photoQualityEngine.js (fonction pure) : DPI effectif
// calcule sur la zone REELLEMENT utilisee apres cover-fit (jamais la taille
// brute du fichier source), paliers de qualite, geometrie des emplacements
// (cahier des charges "PhotoSlot", 2026-09-10, §9/§10/§25).

const {
  resolveUsableAreaMm,
  resolveSlotSizeMm,
  computeEffectiveDpi,
  checkImageFit,
  checkSlotImageFit,
  statutForDpi,
  FIT_DISPLAY,
  RATIO_GAP_THRESHOLD
} = require('../../services/composition/photoQualityEngine');

describe('resolveUsableAreaMm', () => {
  it('standard (210x280mm, spaceScale 1) : soustrait 14mm de padding de chaque cote', () => {
    expect(resolveUsableAreaMm('standard')).toEqual({ widthMm: 182, heightMm: 252, gapMm: 3 });
  });

  it('livret (200x200mm, spaceScale 0.62) : padding/gap mis a l\'echelle', () => {
    const area = resolveUsableAreaMm('livret');
    expect(area.widthMm).toBeCloseTo(182.64, 1);
    expect(area.heightMm).toBeCloseTo(182.64, 1); // carre
    expect(area.gapMm).toBeCloseTo(1.86, 1);
  });

  it('format inconnu retombe sur standard (meme repli que coverFormat.js/formatDensity.js)', () => {
    expect(resolveUsableAreaMm('inconnu')).toEqual(resolveUsableAreaMm('standard'));
  });
});

describe('resolveSlotSizeMm', () => {
  it('FULL_PHOTO (sentinelle "page") : toute la surface utile de la page', () => {
    expect(resolveSlotSizeMm('FULL_PHOTO', 0, 'standard')).toEqual({ widthMm: 182, heightMm: 252 });
  });

  it('TWO_PHOTOS : 2 colonnes pleine hauteur (tres vertical), meme taille pour les 2 slots', () => {
    const slot0 = resolveSlotSizeMm('TWO_PHOTOS', 0, 'standard');
    const slot1 = resolveSlotSizeMm('TWO_PHOTOS', 1, 'standard');
    expect(slot0).toEqual(slot1);
    expect(slot0.widthMm).toBeCloseTo(89.5, 1);
    expect(slot0.heightMm).toBeCloseTo(235.5, 1); // 89.5 / 0.38 (ratio TWO_PHOTOS)
  });

  it('THREE_PHOTOS : les 2 premiers slots sont quasi carres, le 3e prend toute la largeur', () => {
    const slot0 = resolveSlotSizeMm('THREE_PHOTOS', 0, 'standard');
    const slot2 = resolveSlotSizeMm('THREE_PHOTOS', 2, 'standard');
    expect(slot0.widthMm).toBeCloseTo(89.5, 1);
    expect(slot2.widthMm).toBeCloseTo(182, 1); // pleine largeur
    expect(slot2.widthMm).toBeGreaterThan(slot0.widthMm);
  });

  it('slug inconnu -> null (l\'appelant doit s\'abstenir, jamais deviner)', () => {
    expect(resolveSlotSizeMm('LAYOUT_INEXISTANT', 0, 'standard')).toBeNull();
  });

  it('index de slot hors table -> null', () => {
    expect(resolveSlotSizeMm('TWO_PHOTOS', 5, 'standard')).toBeNull();
  });
});

describe('computeEffectiveDpi', () => {
  it('exemple du cahier des charges (§9) : 4000x3000px dans un cadre 20x20cm -> ~381 DPI', () => {
    const dpi = computeEffectiveDpi({ imageWidthPx: 4000, imageHeightPx: 3000, frameWidthMm: 200, frameHeightMm: 200 });
    expect(dpi).toBeCloseTo(381, 0);
  });

  it('photo carree dans un cadre carre : DPI eleve (pas de recadrage necessaire)', () => {
    const dpi = computeEffectiveDpi({ imageWidthPx: 3000, imageHeightPx: 3000, frameWidthMm: 100, frameHeightMm: 100 });
    expect(dpi).toBeGreaterThan(300);
  });

  it('zoomer divise le DPI effectif par le facteur de zoom (moins de pixels sources par mm)', () => {
    const base = computeEffectiveDpi({ imageWidthPx: 3000, imageHeightPx: 3000, frameWidthMm: 100, frameHeightMm: 100 });
    const zoomed = computeEffectiveDpi({ imageWidthPx: 3000, imageHeightPx: 3000, frameWidthMm: 100, frameHeightMm: 100, zoom: 2 });
    expect(zoomed).toBeCloseTo(base / 2, 5);
  });

  it('photo basse resolution dans un grand cadre : DPI faible', () => {
    const dpi = computeEffectiveDpi({ imageWidthPx: 1200, imageHeightPx: 900, frameWidthMm: 210, frameHeightMm: 280 });
    expect(dpi).toBeLessThan(150);
  });

  it('la MEME photo basse resolution dans un petit cadre reste correcte (la qualite depend de l\'usage reel, §11)', () => {
    const dpi = computeEffectiveDpi({ imageWidthPx: 1200, imageHeightPx: 900, frameWidthMm: 80, frameHeightMm: 60 });
    expect(dpi).toBeGreaterThan(300);
  });

  it('donnees manquantes -> null, jamais une exception', () => {
    expect(computeEffectiveDpi({ imageWidthPx: null, imageHeightPx: 3000, frameWidthMm: 100, frameHeightMm: 100 })).toBeNull();
    expect(computeEffectiveDpi({})).toBeNull();
  });
});

// Cahier des charges v2 (2026-09-11) : 3 statuts seulement (250/150), qui
// remplacent les 5 paliers de la v1 — une seule echelle dans toute l'app.
describe('statutForDpi — seuils v2', () => {
  it.each([
    [400, 'ok'],
    [250, 'ok'],
    [249, 'limite'],
    [150, 'limite'],
    [149, 'insuffisant'],
    [0, 'insuffisant']
  ])('%i DPI -> %s', (dpi, expected) => {
    expect(statutForDpi(dpi)).toBe(expected);
  });

  it('donnee manquante -> null (aucun avis), jamais un faux avertissement', () => {
    expect(statutForDpi(null)).toBeNull();
    expect(statutForDpi(undefined)).toBeNull();
  });

  it('aucun message affiche ne contient le mot "DPI" (§2) et "ok" n\'a aucun message', () => {
    expect(FIT_DISPLAY.ok.label).toBe('');
    expect(FIT_DISPLAY.ok.severity).toBeNull();
    Object.values(FIT_DISPLAY).forEach((entry) => {
      expect(entry.label.toLowerCase()).not.toContain('dpi');
    });
  });
});

describe('checkImageFit — ecart de ratio + resolution (§1/§4)', () => {
  it('photo parfaitement au ratio du cadre -> ecartRatio 0, aucun flag', () => {
    const fit = checkImageFit({ imageWidthPx: 3000, imageHeightPx: 3000, frameWidthMm: 100, frameHeightMm: 100 });
    expect(fit.ecartRatio).toBeCloseTo(0, 5);
    expect(fit.ratioGap).toBe(false);
    expect(fit.statut).toBe('ok');
  });

  it('ecart de ratio juste sous le seuil de 15% -> pas de flag', () => {
    // cadre carre, photo 1.14:1 -> ecart 14%
    const fit = checkImageFit({ imageWidthPx: 1140, imageHeightPx: 1000, frameWidthMm: 100, frameHeightMm: 100 });
    expect(fit.ecartRatio).toBeCloseTo(0.14, 2);
    expect(fit.ratioGap).toBe(false);
  });

  it('ecart de ratio au dela de 15% -> flag leve (recadrage applique quand meme)', () => {
    // cadre carre, photo panoramique 2:1 -> ecart 100%
    const fit = checkImageFit({ imageWidthPx: 4000, imageHeightPx: 2000, frameWidthMm: 100, frameHeightMm: 100 });
    expect(fit.ecartRatio).toBeCloseTo(1, 5);
    expect(fit.ratioGap).toBe(true);
    expect(fit.ecartRatio).toBeGreaterThan(RATIO_GAP_THRESHOLD);
  });

  it('photo basse resolution dans un grand cadre -> insuffisant + message sans "DPI"', () => {
    const fit = checkImageFit({ imageWidthPx: 1200, imageHeightPx: 900, frameWidthMm: 210, frameHeightMm: 280 });
    expect(fit.statut).toBe('insuffisant');
    expect(fit.severity).toBe('danger');
    expect(fit.label).toMatch(/floue/i);
  });

  it('un zoom manuel peut faire basculer une photo de "ok" a "limite"', () => {
    const base = { imageWidthPx: 2000, imageHeightPx: 2000, frameWidthMm: 160, frameHeightMm: 160 };
    expect(checkImageFit(base).statut).toBe('ok'); // ~318 dpi
    expect(checkImageFit({ ...base, zoom: 2 }).statut).toBe('limite'); // ~159 dpi
  });

  it('donnees manquantes -> statut null et ecartRatio null, jamais une exception', () => {
    const fit = checkImageFit({ imageWidthPx: null, imageHeightPx: 900, frameWidthMm: 100, frameHeightMm: 100 });
    expect(fit.statut).toBeNull();
    expect(fit.ecartRatio).toBeNull();
    expect(fit.ratioGap).toBe(false);
    expect(() => checkImageFit({})).not.toThrow();
  });
});

describe('checkSlotImageFit — depuis un item place dans un emplacement', () => {
  const photo = (width, height) => ({ kind: 'photo', metadata: { width, height } });

  it('resout le cadre tout seul via le slug/slot et renvoie un statut', () => {
    const fit = checkSlotImageFit({ item: photo(4000, 6000), layoutSlug: 'FULL_PHOTO', slotIndex: 0, formatId: 'standard' });
    expect(fit.statut).toBe('ok');
    expect(fit.dpiEffectif).toBeGreaterThan(250);
  });

  it('photo sans metadata (jamais sondee) -> null, aucun badge affiche', () => {
    expect(checkSlotImageFit({ item: { kind: 'photo', metadata: {} }, layoutSlug: 'FULL_PHOTO', slotIndex: 0, formatId: 'standard' })).toBeNull();
  });

  it('emplacement texte d\'une mise en page mixte -> null (jamais evalue)', () => {
    expect(checkSlotImageFit({ item: photo(4000, 3000), layoutSlug: 'PHOTO_TEXT', slotIndex: 1, formatId: 'standard' })).toBeNull();
  });
});

// Trou comble le 2026-09-11 : ces mises en page n'etaient PAS dans
// PHOTO_SLOT_RATIOS, donc leurs photos echappaient totalement au controle
// (verifie en base sur un livre reel : pages 6/9/18/24/28 "PAS EVALUE").
describe('mises en page mixtes — desormais evaluees', () => {
  it.each([
    ['PHOTO_TEXT', 0],
    ['TEXT_PHOTO', 1],
    ['TWO_PHOTOS_TEXT', 0],
    ['TWO_PHOTOS_TEXT', 1]
  ])('%s slot %i a bien un cadre resolu', (slug, slotIndex) => {
    const frame = resolveSlotSizeMm(slug, slotIndex, 'standard');
    expect(frame).not.toBeNull();
    expect(frame.widthMm).toBeGreaterThan(0);
    expect(frame.heightMm).toBeGreaterThan(0);
  });

  it('la photo de PHOTO_TEXT occupe toute la largeur utile, pas une demi-colonne', () => {
    expect(resolveSlotSizeMm('PHOTO_TEXT', 0, 'standard').widthMm).toBeCloseTo(182, 0);
  });

  it('les 2 photos de TWO_PHOTOS_TEXT sont cote a cote (demi-largeur)', () => {
    expect(resolveSlotSizeMm('TWO_PHOTOS_TEXT', 0, 'standard').widthMm).toBeCloseTo(88.5, 0);
  });

  it('une photo basse resolution en PHOTO_TEXT est desormais signalee (avant : ignoree)', () => {
    const fit = checkSlotImageFit({
      item: { kind: 'photo', metadata: { width: 900, height: 600 } },
      layoutSlug: 'PHOTO_TEXT',
      slotIndex: 0,
      formatId: 'standard'
    });
    expect(fit).not.toBeNull();
    expect(fit.statut).toBe('insuffisant');
  });
});
