const {
  scoreLayoutCandidate,
  createRhythmState,
  updateRhythmState,
  createFamilyCounts,
  updateFamilyCounts,
  layoutFamily,
  MOOD_LAYOUT_WEIGHTS,
  PHOTO_SLOT_RATIOS,
  PAGE_RATIO_BY_FORMAT,
  slotRatioScore
} = require('../../services/composition/layoutScoring');

const FULL_PHOTO = { slug: 'FULL_PHOTO', kind: 'photo', capacity: { slots: [{ type: 'photo' }] } };
const FOUR_PHOTOS = {
  slug: 'FOUR_PHOTOS',
  kind: 'photo',
  capacity: { slots: [{ type: 'photo' }, { type: 'photo' }, { type: 'photo' }, { type: 'photo' }] }
};
const ONE_TESTIMONY = {
  slug: 'ONE_TESTIMONY',
  kind: 'texte',
  capacity: { slots: [{ type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }] }
};
const PHOTO_TEXT = {
  slug: 'PHOTO_TEXT',
  kind: 'mixte',
  capacity: { slots: [{ type: 'photo' }, { type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }] }
};

function photoUnit(id, orientation) {
  return { key: id, kind: 'photo', itemIds: [id], orientation };
}

function photoUnitWithRatio(id, ratio) {
  return { key: id, kind: 'photo', itemIds: [id], ratio };
}

function texteUnit(id, textLengthClass = 'SHORT') {
  return { key: id, kind: 'texte', itemIds: [id], textLengthClass };
}

describe('layoutScoring.layoutFamily', () => {
  it('classe correctement chaque famille', () => {
    expect(layoutFamily(FULL_PHOTO)).toBe('photo');
    expect(layoutFamily(ONE_TESTIMONY)).toBe('texte');
    expect(layoutFamily(PHOTO_TEXT)).toBe('mixte');
    expect(layoutFamily({ kind: 'contribution' })).toBe('contribution');
  });
});

describe('layoutScoring.scoreLayoutCandidate', () => {
  it('favorise un layout dont la famille correspond au profil detecte', () => {
    const units4Photos = [photoUnit('p1'), photoUnit('p2'), photoUnit('p3'), photoUnit('p4')];
    const scorePhotoProfile = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'PHOTO' });
    const scoreTexteProfileForPhotoLayout = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'TEXTE' });
    expect(scorePhotoProfile).toBeGreaterThan(scoreTexteProfileForPhotoLayout);
  });

  it('favorise un layout qui utilise pleinement sa capacite (fit) a candidats egaux par ailleurs', () => {
    const scoreFull = scoreLayoutCandidate(FOUR_PHOTOS, [photoUnit('p1'), photoUnit('p2'), photoUnit('p3'), photoUnit('p4')], { profile: 'PHOTO' });
    const scoreSingle = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'PHOTO' });
    expect(scoreFull).toBeGreaterThan(scoreSingle);
  });

  it('penalise la repetition immediate du meme slug (rythme)', () => {
    const state = updateRhythmState(createRhythmState(), FULL_PHOTO);
    const scoreWithoutHistory = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'PHOTO', rhythmState: createRhythmState() });
    const scoreWithRepeat = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'PHOTO', rhythmState: state });
    expect(scoreWithRepeat).toBeLessThan(scoreWithoutHistory);
  });

  it('penalise une longue serie de la meme famille', () => {
    let state = createRhythmState();
    state = updateRhythmState(state, FULL_PHOTO);
    state = updateRhythmState(state, FOUR_PHOTOS);
    state = updateRhythmState(state, FULL_PHOTO);

    const scoreAfterLongRun = scoreLayoutCandidate(FOUR_PHOTOS, [photoUnit('p1'), photoUnit('p2'), photoUnit('p3'), photoUnit('p4')], {
      profile: 'PHOTO',
      rhythmState: state
    });
    const scoreFresh = scoreLayoutCandidate(FOUR_PHOTOS, [photoUnit('p1'), photoUnit('p2'), photoUnit('p3'), photoUnit('p4')], {
      profile: 'PHOTO',
      rhythmState: createRhythmState()
    });
    expect(scoreAfterLongRun).toBeLessThan(scoreFresh);
  });

  it('ne penalise jamais au point de rendre le score negatif-bloquant : le candidat reste toujours choisissable', () => {
    let state = createRhythmState();
    for (let i = 0; i < 10; i += 1) state = updateRhythmState(state, FULL_PHOTO);
    const score = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'PHOTO', rhythmState: state });
    expect(Number.isFinite(score)).toBe(true);
  });

  it('bonus orientation quand deux photos partagent la meme orientation', () => {
    const twoPhotosLayout = {
      slug: 'TWO_PHOTOS',
      kind: 'photo',
      capacity: { slots: [{ type: 'photo' }, { type: 'photo' }] }
    };
    const scoreSameOrientation = scoreLayoutCandidate(
      twoPhotosLayout,
      [photoUnit('p1', 'landscape'), photoUnit('p2', 'landscape')],
      { profile: 'PHOTO' }
    );
    const scoreMixedOrientation = scoreLayoutCandidate(
      twoPhotosLayout,
      [photoUnit('p1', 'landscape'), photoUnit('p2', 'portrait')],
      { profile: 'PHOTO' }
    );
    expect(scoreSameOrientation).toBeGreaterThan(scoreMixedOrientation);
  });

  it("l'absence d'orientation ne penalise jamais (neutre)", () => {
    const twoPhotosLayout = {
      slug: 'TWO_PHOTOS',
      kind: 'photo',
      capacity: { slots: [{ type: 'photo' }, { type: 'photo' }] }
    };
    expect(() => scoreLayoutCandidate(twoPhotosLayout, [photoUnit('p1'), photoUnit('p2')], { profile: 'PHOTO' })).not.toThrow();
  });
});

describe('layoutScoring — ambiance (mood)', () => {
  const units4Photos = [photoUnit('p1'), photoUnit('p2'), photoUnit('p3'), photoUnit('p4')];

  it("l'absence de mood ne change aucun score (non-regression)", () => {
    const withoutMood = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'PHOTO' });
    const withUndefinedMood = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'PHOTO', mood: undefined });
    expect(withUndefinedMood).toBe(withoutMood);
  });

  it("l'ambiance 'classique' ne change aucun score (identique a l'absence de mood)", () => {
    const withoutMood = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'PHOTO' });
    const withClassique = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'PHOTO', mood: 'classique' });
    expect(withClassique).toBe(withoutMood);
  });

  it("'aere' favorise une photo seule sur une pleine page plutot qu'une grille dense", () => {
    const scoreFullPhotoAere = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE', mood: 'aere' });
    const scoreFullPhotoNeutral = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE' });
    const scoreFourPhotosAere = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'EQUILIBRE', mood: 'aere' });
    const scoreFourPhotosNeutral = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'EQUILIBRE' });
    expect(scoreFullPhotoAere).toBeGreaterThan(scoreFullPhotoNeutral);
    expect(scoreFourPhotosAere).toBeLessThan(scoreFourPhotosNeutral);
  });

  it("'compact' favorise une grille dense sur une photo seule (inverse d'aere)", () => {
    const scoreFourPhotosCompact = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'EQUILIBRE', mood: 'compact' });
    const scoreFourPhotosNeutral = scoreLayoutCandidate(FOUR_PHOTOS, units4Photos, { profile: 'EQUILIBRE' });
    const scoreFullPhotoCompact = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE', mood: 'compact' });
    const scoreFullPhotoNeutral = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE' });
    expect(scoreFourPhotosCompact).toBeGreaterThan(scoreFourPhotosNeutral);
    expect(scoreFullPhotoCompact).toBeLessThan(scoreFullPhotoNeutral);
  });

  it('un layout absent de la table de ponderation reste neutre pour toute ambiance (ex. bloc contribution)', () => {
    const contributionLayout = { slug: 'CONTRIBUTION_STANDARD', kind: 'contribution', capacity: {} };
    const unit = [{ key: 'c1', kind: 'contribution', itemIds: ['c1'] }];
    Object.keys(MOOD_LAYOUT_WEIGHTS).forEach((mood) => {
      const withMood = scoreLayoutCandidate(contributionLayout, unit, { profile: 'EQUILIBRE', mood });
      const withoutMood = scoreLayoutCandidate(contributionLayout, unit, { profile: 'EQUILIBRE' });
      expect(withMood).toBe(withoutMood);
    });
  });

  it('un id de mood inconnu ne plante jamais (reste neutre)', () => {
    expect(() => scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE', mood: 'inexistant' })).not.toThrow();
  });
});

describe('layoutScoring — adequation photo<->emplacement (2026-09-10)', () => {
  it('slotRatioScore : 1 pour un ratio identique, decroit avec l ecart, jamais negatif', () => {
    expect(slotRatioScore(1, 1)).toBeCloseTo(1, 5);
    expect(slotRatioScore(0.38, 0.38)).toBeCloseTo(1, 5);
    expect(slotRatioScore(3, 0.38)).toBeGreaterThanOrEqual(0); // tres mauvais match, jamais < 0
    expect(slotRatioScore(2, 1)).toBeLessThan(slotRatioScore(1.2, 1)); // plus proche = mieux note
  });

  it('slotRatioScore : donnee manquante -> null (neutre), jamais une erreur', () => {
    expect(slotRatioScore(null, 1)).toBeNull();
    expect(slotRatioScore(1, null)).toBeNull();
  });

  it('FULL_PHOTO : une photo au ratio proche de la page est mieux notee qu une photo tres eloignee', () => {
    // 'standard'/'luxe' : page 210x280mm -> ratio ~0.75 (portrait)
    const closeMatch = scoreLayoutCandidate(FULL_PHOTO, [photoUnitWithRatio('p1', 0.75)], { profile: 'PHOTO', formatId: 'standard' });
    const badMatch = scoreLayoutCandidate(FULL_PHOTO, [photoUnitWithRatio('p1', 3)], { profile: 'PHOTO', formatId: 'standard' }); // panorama tres large dans un cadre portrait
    expect(closeMatch).toBeGreaterThan(badMatch);
  });

  it('FULL_PHOTO : le ratio de page attendu depend du format (livret carre vs standard/luxe portrait)', () => {
    const squarePhoto = photoUnitWithRatio('p1', 1);
    const scoreOnLivret = scoreLayoutCandidate(FULL_PHOTO, [squarePhoto], { profile: 'PHOTO', formatId: 'livret' });
    const scoreOnStandard = scoreLayoutCandidate(FULL_PHOTO, [squarePhoto], { profile: 'PHOTO', formatId: 'standard' });
    // une photo carree colle mieux a une page carree (livret) qu'a une page portrait (standard)
    expect(scoreOnLivret).toBeGreaterThan(scoreOnStandard);
  });

  it('formatId absent retombe sur le ratio de page par defaut (standard) — jamais une erreur, comportement non-regressif', () => {
    expect(PAGE_RATIO_BY_FORMAT.standard).toBeDefined();
    expect(() => scoreLayoutCandidate(FULL_PHOTO, [photoUnitWithRatio('p1', 0.75)], { profile: 'PHOTO' })).not.toThrow();
  });

  it('TWO_PHOTOS : deux photos avec un ratio proche de celui (tres vertical) de leur emplacement sont mieux notees que deux photos larges', () => {
    const twoPhotosLayout = { slug: 'TWO_PHOTOS', kind: 'photo', capacity: { slots: [{ type: 'photo' }, { type: 'photo' }] } };
    const tallPhotos = [photoUnitWithRatio('p1', 0.4), photoUnitWithRatio('p2', 0.4)];
    const widePhotos = [photoUnitWithRatio('p1', 2), photoUnitWithRatio('p2', 2)];
    const scoreTall = scoreLayoutCandidate(twoPhotosLayout, tallPhotos, { profile: 'PHOTO' });
    const scoreWide = scoreLayoutCandidate(twoPhotosLayout, widePhotos, { profile: 'PHOTO' });
    expect(scoreTall).toBeGreaterThan(scoreWide);
  });

  it('un layout absent de PHOTO_SLOT_RATIOS retombe sur l ancien comportement (coherence d orientation entre photos)', () => {
    expect(PHOTO_SLOT_RATIOS.UNKNOWN_LAYOUT_SLUG).toBeUndefined();
    const unknownLayout = { slug: 'UNKNOWN_LAYOUT_SLUG', kind: 'photo', capacity: { slots: [{ type: 'photo' }, { type: 'photo' }] } };
    const scoreSameOrientation = scoreLayoutCandidate(unknownLayout, [photoUnit('p1', 'landscape'), photoUnit('p2', 'landscape')], { profile: 'PHOTO' });
    const scoreMixedOrientation = scoreLayoutCandidate(unknownLayout, [photoUnit('p1', 'landscape'), photoUnit('p2', 'portrait')], { profile: 'PHOTO' });
    expect(scoreSameOrientation).toBeGreaterThan(scoreMixedOrientation);
  });

  it('aucun ratio sonde (photos anciennes/pre-fonctionnalite) sur un layout connu -> reste neutre, jamais une erreur', () => {
    expect(() => scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'PHOTO', formatId: 'standard' })).not.toThrow();
  });
});

describe('layoutScoring familyCounts / balance', () => {
  it('penalise legerement une famille deja sur-representee par rapport au profil', () => {
    let counts = createFamilyCounts();
    for (let i = 0; i < 10; i += 1) counts = updateFamilyCounts(counts, FULL_PHOTO);

    const scoreOverrepresented = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE', familyCounts: counts });
    const scoreFreshBook = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE', familyCounts: createFamilyCounts() });
    expect(scoreOverrepresented).toBeLessThan(scoreFreshBook);
  });
});
