// Tests unitaires de photoQualityEngine.js (fonction pure) : DPI effectif
// calcule sur la zone REELLEMENT utilisee apres cover-fit (jamais la taille
// brute du fichier source), paliers de qualite, geometrie des emplacements
// (cahier des charges "PhotoSlot", 2026-09-10, §9/§10/§25).

const {
  resolveUsableAreaMm,
  resolveSlotSizeMm,
  computeEffectiveDpi,
  qualityLevelForDpi,
  describeQuality,
  QUALITY_DISPLAY
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

describe('qualityLevelForDpi / describeQuality — paliers (§10)', () => {
  it.each([
    [300, 'excellent'],
    [299, 'tres-bon'],
    [250, 'tres-bon'],
    [249, 'bon'],
    [200, 'bon'],
    [199, 'attention'],
    [150, 'attention'],
    [149, 'faible'],
    [0, 'faible']
  ])('%i DPI -> %s', (dpi, expected) => {
    expect(qualityLevelForDpi(dpi)).toBe(expected);
  });

  it('tres-bon et bon partagent le meme message affiche (jamais le mot DPI, §10)', () => {
    expect(QUALITY_DISPLAY['tres-bon']).toEqual(QUALITY_DISPLAY.bon);
    Object.values(QUALITY_DISPLAY).forEach((entry) => {
      expect(entry.label.toLowerCase()).not.toContain('dpi');
    });
  });

  it('describeQuality retourne le niveau, le DPI arrondi et le message pret pour l\'UI', () => {
    expect(describeQuality(260.4)).toEqual({
      level: 'tres-bon',
      dpi: 260,
      emoji: '🟡',
      label: 'Bonne qualité d\'impression'
    });
  });

  it('describeQuality(null) ne plante jamais, retombe sur "faible"', () => {
    expect(describeQuality(null).level).toBe('faible');
  });
});
