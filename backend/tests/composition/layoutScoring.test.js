const {
  scoreLayoutCandidate,
  createRhythmState,
  updateRhythmState,
  createFamilyCounts,
  updateFamilyCounts,
  layoutFamily
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

describe('layoutScoring familyCounts / balance', () => {
  it('penalise legerement une famille deja sur-representee par rapport au profil', () => {
    let counts = createFamilyCounts();
    for (let i = 0; i < 10; i += 1) counts = updateFamilyCounts(counts, FULL_PHOTO);

    const scoreOverrepresented = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE', familyCounts: counts });
    const scoreFreshBook = scoreLayoutCandidate(FULL_PHOTO, [photoUnit('p1')], { profile: 'EQUILIBRE', familyCounts: createFamilyCounts() });
    expect(scoreOverrepresented).toBeLessThan(scoreFreshBook);
  });
});
