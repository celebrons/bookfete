const { buildManualPageContent } = require('../../services/composition/manualPageBuilder');

const FULL_PHOTO = { id: 'lay-photo', slug: 'FULL_PHOTO', kind: 'photo', capacity: { slots: [{ type: 'photo' }] } };
const PHOTO_TEXT = {
  id: 'lay-mixte',
  slug: 'PHOTO_TEXT',
  kind: 'mixte',
  capacity: { slots: [{ type: 'photo' }, { type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }] }
};
const TITLE_TWO_PHOTOS = {
  id: 'lay-title-photos',
  slug: 'TITLE_TWO_PHOTOS',
  kind: 'mixte',
  capacity: { slots: [{ type: 'text', lengthClass: ['SHORT'] }, { type: 'photo' }, { type: 'photo' }] }
};
const CONTRIBUTION = { id: 'lay-contrib', slug: 'contribution-standard', kind: 'contribution', min_items: 1, max_items: 4 };

const photo = (id) => ({ id, kind: 'photo', url: `https://cdn.test/${id}.jpg` });
const text = (id, length = 50) => ({ id, kind: 'texte', text: 'x'.repeat(length) });

describe('manualPageBuilder.buildManualPageContent — cas valides', () => {
  it('un seul emplacement photo, un item photo -> content a un bloc, itemIds preserves', () => {
    const content = buildManualPageContent({ layout: FULL_PHOTO, items: [photo('p1')] });
    expect(content).toEqual({
      kind: 'photo',
      itemIds: ['p1'],
      blocks: [{ itemIds: ['p1'], kind: 'photo', layoutId: 'lay-photo', presentationVariant: 0 }]
    });
  });

  it('photo + texte (PHOTO_TEXT) -> ordre des items preserve exactement', () => {
    const content = buildManualPageContent({ layout: PHOTO_TEXT, items: [photo('p1'), text('t1')] });
    expect(content.itemIds).toEqual(['p1', 't1']);
    expect(content.kind).toBe('mixte');
    expect(content.blocks[0].layoutId).toBe('lay-mixte');
  });

  it('titre + 2 photos (TITLE_TWO_PHOTOS) : le titre (texte court) en premiere position est accepte', () => {
    const content = buildManualPageContent({
      layout: TITLE_TWO_PHOTOS,
      items: [text('title', 20), photo('p1'), photo('p2')]
    });
    expect(content.itemIds).toEqual(['title', 'p1', 'p2']);
  });
});

describe('manualPageBuilder.buildManualPageContent — validations (jamais un plantage generique)', () => {
  it('layout absent -> erreur 400', () => {
    expect(() => buildManualPageContent({ layout: null, items: [photo('p1')] })).toThrow();
    try {
      buildManualPageContent({ layout: null, items: [photo('p1')] });
    } catch (error) {
      expect(error.status).toBe(400);
    }
  });

  it('aucun item -> erreur 400', () => {
    expect(() => buildManualPageContent({ layout: FULL_PHOTO, items: [] })).toThrow();
  });

  it('un texte dans un emplacement photo -> refuse (jamais accepte silencieusement)', () => {
    expect(() => buildManualPageContent({ layout: FULL_PHOTO, items: [text('t1')] })).toThrow(/emplacements/);
  });

  it('une photo dans un emplacement texte -> refuse', () => {
    expect(() => buildManualPageContent({ layout: PHOTO_TEXT, items: [photo('p1'), photo('p2')] })).toThrow(/emplacements/);
  });

  it('mauvais nombre d\'items (layout a 2 emplacements, 1 fourni) -> refuse avec un message clair', () => {
    expect(() => buildManualPageContent({ layout: PHOTO_TEXT, items: [photo('p1')] })).toThrow(/2 element/);
  });

  it('trop d\'items (layout a 1 emplacement, 2 fournis) -> refuse', () => {
    expect(() => buildManualPageContent({ layout: FULL_PHOTO, items: [photo('p1'), photo('p2')] })).toThrow();
  });

  it('texte trop long pour un emplacement "titre" (SHORT uniquement) -> refuse', () => {
    const items = [text('title', 500), photo('p1'), photo('p2')];
    expect(() => buildManualPageContent({ layout: TITLE_TWO_PHOTOS, items })).toThrow(/emplacements/);
  });

  it('texte de longueur SHORT accepte dans un emplacement "titre"', () => {
    const items = [text('title', 20), photo('p1'), photo('p2')];
    expect(() => buildManualPageContent({ layout: TITLE_TWO_PHOTOS, items })).not.toThrow();
  });

  it('layout sans capacity.slots (ex. contribution-standard) -> refuse proprement, jamais un plantage', () => {
    expect(() => buildManualPageContent({ layout: CONTRIBUTION, items: [photo('p1'), photo('p2')] }))
      .toThrow(/atelier/);
  });

  it('items contenant des valeurs falsy (ex. item introuvable, filtre en amont) -> traite comme absent, jamais un crash', () => {
    expect(() => buildManualPageContent({ layout: FULL_PHOTO, items: [null] })).toThrow();
  });
});
