const { scorePhoto, rankPhotos, RESOLUTION_TARGET_PX, NEUTRAL_SCORE } = require('../../services/composition/coverPhotoSelector');

const STANDARD_FORMAT = { trimWidthMm: 210, trimHeightMm: 297 }; // ratio ~0.707

function photo(id, metadata, displayOrder = 0) {
  return { id, kind: 'photo', display_order: displayOrder, metadata };
}

describe('coverPhotoSelector.scorePhoto', () => {
  it('sature au-dela de RESOLUTION_TARGET_PX (une photo plus grande ne score pas mieux)', () => {
    const at = scorePhoto(photo('p1', { width: RESOLUTION_TARGET_PX, height: RESOLUTION_TARGET_PX * 1.41, orientation: 'portrait' }), STANDARD_FORMAT);
    const beyond = scorePhoto(photo('p2', { width: RESOLUTION_TARGET_PX * 3, height: RESOLUTION_TARGET_PX * 3 * 1.41, orientation: 'portrait' }), STANDARD_FORMAT);
    expect(beyond).toBeCloseTo(at, 5);
  });

  it('metadonnee manquante -> score neutre, jamais disqualifiant', () => {
    const score = scorePhoto(photo('p1', undefined), STANDARD_FORMAT);
    expect(score).toBeCloseTo(NEUTRAL_SCORE, 5);
  });

  it('le score de ratio est maximal exactement au ratio de la couverture', () => {
    const exact = scorePhoto(
      photo('p1', { width: 210, height: 297, orientation: 'portrait' }),
      STANDARD_FORMAT
    );
    const off = scorePhoto(
      photo('p2', { width: 400, height: 300, orientation: 'landscape' }), // tres different du ratio portrait
      STANDARD_FORMAT
    );
    expect(exact).toBeGreaterThan(off);
  });

  it('bonus orientation : portrait > carre > paysage', () => {
    const base = { width: 1000, height: 1000 };
    const portrait = scorePhoto(photo('p1', { ...base, height: 1500, orientation: 'portrait' }), STANDARD_FORMAT);
    const square = scorePhoto(photo('p2', { ...base, orientation: 'square' }), STANDARD_FORMAT);
    const landscape = scorePhoto(photo('p3', { width: 1500, height: 1000, orientation: 'landscape' }), STANDARD_FORMAT);
    expect(portrait).toBeGreaterThan(square);
    expect(square).toBeGreaterThan(landscape);
  });

  it('reste toujours dans [0, 1]', () => {
    const score = scorePhoto(photo('p1', { width: 50, height: 5000, orientation: 'landscape' }), STANDARD_FORMAT);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('coverPhotoSelector.rankPhotos', () => {
  it('trie par score decroissant', () => {
    const items = [
      photo('low', { width: 300, height: 200, orientation: 'landscape' }, 0),
      photo('high', { width: 2400, height: 3400, orientation: 'portrait' }, 1)
    ];
    const ranked = rankPhotos(items, STANDARD_FORMAT);
    expect(ranked[0].item.id).toBe('high');
    expect(ranked[1].item.id).toBe('low');
  });

  it('ignore les items non-photo', () => {
    const items = [
      photo('p1', { width: 2000, height: 2800 }, 0),
      { id: 't1', kind: 'texte', text: 'x', display_order: 1 }
    ];
    const ranked = rankPhotos(items, STANDARD_FORMAT);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].item.id).toBe('p1');
  });

  it('renvoie un tableau vide sans planter quand il n\'y a aucune photo', () => {
    expect(rankPhotos([], STANDARD_FORMAT)).toEqual([]);
    expect(rankPhotos([{ id: 't1', kind: 'texte', text: 'x' }], STANDARD_FORMAT)).toEqual([]);
  });

  it('departage les egalites par display_order, de facon deterministe (pas de PRNG)', () => {
    const items = [
      photo('b', undefined, 2),
      photo('a', undefined, 1)
    ];
    const run1 = rankPhotos(items, STANDARD_FORMAT).map((entry) => entry.item.id);
    const run2 = rankPhotos(items, STANDARD_FORMAT).map((entry) => entry.item.id);
    expect(run1).toEqual(['a', 'b']);
    expect(run1).toEqual(run2);
  });
});
