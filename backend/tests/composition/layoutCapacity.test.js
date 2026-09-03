const {
  isStructurallyCompatible,
  resolveCandidates,
  consumedCount
} = require('../../services/composition/layoutCapacity');

const FULL_PHOTO = { slug: 'FULL_PHOTO', kind: 'photo', capacity: { slots: [{ type: 'photo' }] } };
const TWO_PHOTOS = { slug: 'TWO_PHOTOS', kind: 'photo', capacity: { slots: [{ type: 'photo' }, { type: 'photo' }] } };
const ONE_TESTIMONY = {
  slug: 'ONE_TESTIMONY',
  kind: 'texte',
  capacity: { slots: [{ type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }] }
};
const TWO_TESTIMONIES = {
  slug: 'TWO_TESTIMONIES',
  kind: 'texte',
  capacity: { slots: [{ type: 'text', lengthClass: ['SHORT', 'MEDIUM'] }, { type: 'text', lengthClass: ['SHORT', 'MEDIUM'] }] }
};
const PHOTO_TEXT = {
  slug: 'PHOTO_TEXT',
  kind: 'mixte',
  capacity: { slots: [{ type: 'photo' }, { type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }] }
};
const TEXT_PHOTO = {
  slug: 'TEXT_PHOTO',
  kind: 'mixte',
  capacity: { slots: [{ type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }, { type: 'photo' }] }
};
const CONTRIBUTION = { slug: 'contribution-standard', kind: 'contribution', min_items: 1, max_items: 4 };

function photoUnit(id) {
  return { key: id, kind: 'photo', itemIds: [id] };
}

function texteUnit(id, textLengthClass = 'SHORT', textLength = 50) {
  return { key: id, kind: 'texte', itemIds: [id], textLengthClass, textLength };
}

function contributionUnit(id, itemCount = 2) {
  return { key: id, kind: 'contribution', itemIds: Array.from({ length: itemCount }, (_, i) => `${id}-${i}`) };
}

describe('layoutCapacity.isStructurallyCompatible', () => {
  it('FULL_PHOTO est compatible avec une photo seule', () => {
    expect(isStructurallyCompatible(FULL_PHOTO, [photoUnit('p1')])).toBe(true);
  });

  it('TWO_PHOTOS exige deux unites photo consecutives', () => {
    expect(isStructurallyCompatible(TWO_PHOTOS, [photoUnit('p1'), photoUnit('p2')])).toBe(true);
    expect(isStructurallyCompatible(TWO_PHOTOS, [photoUnit('p1')])).toBe(false);
    expect(isStructurallyCompatible(TWO_PHOTOS, [photoUnit('p1'), texteUnit('t1')])).toBe(false);
  });

  it("respecte l'ordre des slots (PHOTO_TEXT vs TEXT_PHOTO ne sont pas interchangeables)", () => {
    expect(isStructurallyCompatible(PHOTO_TEXT, [photoUnit('p1'), texteUnit('t1')])).toBe(true);
    expect(isStructurallyCompatible(PHOTO_TEXT, [texteUnit('t1'), photoUnit('p1')])).toBe(false);
    expect(isStructurallyCompatible(TEXT_PHOTO, [texteUnit('t1'), photoUnit('p1')])).toBe(true);
    expect(isStructurallyCompatible(TEXT_PHOTO, [photoUnit('p1'), texteUnit('t1')])).toBe(false);
  });

  it('un slot texte refuse une classe de longueur non autorisee', () => {
    expect(isStructurallyCompatible(TWO_TESTIMONIES, [texteUnit('t1', 'SHORT'), texteUnit('t2', 'MEDIUM')])).toBe(true);
    expect(isStructurallyCompatible(TWO_TESTIMONIES, [texteUnit('t1', 'LONG'), texteUnit('t2', 'SHORT')])).toBe(false);
  });

  it('ONE_TESTIMONY accepte meme un texte LONG (garantie de repli)', () => {
    expect(isStructurallyCompatible(ONE_TESTIMONY, [texteUnit('t1', 'LONG')])).toBe(true);
  });

  it('les layouts de kind contribution suivent le comportement min/max items v1', () => {
    expect(isStructurallyCompatible(CONTRIBUTION, [contributionUnit('c1', 2)])).toBe(true);
    expect(isStructurallyCompatible(CONTRIBUTION, [contributionUnit('c1', 5)])).toBe(false);
    expect(isStructurallyCompatible(CONTRIBUTION, [photoUnit('p1')])).toBe(false);
  });
});

describe('layoutCapacity.consumedCount', () => {
  it('correspond au nombre de slots pour un layout capacity-based', () => {
    expect(consumedCount(TWO_PHOTOS, [photoUnit('p1'), photoUnit('p2')])).toBe(2);
    expect(consumedCount(PHOTO_TEXT, [photoUnit('p1'), texteUnit('t1')])).toBe(2);
  });

  it('vaut 0 si non compatible', () => {
    expect(consumedCount(TWO_PHOTOS, [photoUnit('p1')])).toBe(0);
  });

  it('vaut 1 pour un layout contribution', () => {
    expect(consumedCount(CONTRIBUTION, [contributionUnit('c1', 3)])).toBe(1);
  });
});

describe('layoutCapacity.resolveCandidates', () => {
  const catalog = [FULL_PHOTO, TWO_PHOTOS, ONE_TESTIMONY, TWO_TESTIMONIES, PHOTO_TEXT, TEXT_PHOTO, CONTRIBUTION];

  it('ne reordonne jamais le contenu : ne retient que des prefixes contigus', () => {
    const window = [texteUnit('t1'), photoUnit('p1')];
    const candidates = resolveCandidates(catalog, window);
    const slugs = candidates.map((c) => c.slug);
    expect(slugs).toContain('ONE_TESTIMONY');
    expect(slugs).toContain('TEXT_PHOTO');
    expect(slugs).not.toContain('PHOTO_TEXT');
    expect(slugs).not.toContain('TWO_PHOTOS');
  });

  it('renvoie toujours au moins un candidat pour une seule photo ou un seul texte (garantie de base)', () => {
    expect(resolveCandidates(catalog, [photoUnit('p1')]).length).toBeGreaterThan(0);
    expect(resolveCandidates(catalog, [texteUnit('t1', 'LONG')]).length).toBeGreaterThan(0);
  });
});
