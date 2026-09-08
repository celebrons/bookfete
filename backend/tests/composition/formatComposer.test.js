// Tests de formatComposer.js (fonction pure) : le contenu verrouille (pages
// construites a la main dans l'atelier) doit rester identique quel que soit
// le format, le contenu non verrouille doit etre integralement replace
// nulle part, et le mood du format doit reellement changer le choix de
// layout (et donc potentiellement le nombre de pages).

const {
  composeBookForFormat,
  withChapterSeparators,
  CHAPTER_SEPARATOR_MIN_PAGES,
  CHAPTER_SEPARATOR_INTERVAL,
  CHAPTER_SEPARATOR_MAX_COUNT
} = require('../../services/composition/formatComposer');

const LAYOUTS = [
  { id: 'l-full-photo', slug: 'FULL_PHOTO', kind: 'photo', capacity: { slots: [{ type: 'photo' }] } },
  { id: 'l-two-photos', slug: 'TWO_PHOTOS', kind: 'photo', capacity: { slots: [{ type: 'photo' }, { type: 'photo' }] } },
  {
    id: 'l-four-photos',
    slug: 'FOUR_PHOTOS',
    kind: 'photo',
    capacity: { slots: [{ type: 'photo' }, { type: 'photo' }, { type: 'photo' }, { type: 'photo' }] }
  }
];
const TEMPLATE = { id: 'tpl-test', allowed_layouts: LAYOUTS.map((l) => l.slug) };

function photoItem(id, displayOrder) {
  return { id, kind: 'photo', url: `https://cdn.test/${id}.jpg`, display_order: displayOrder };
}

describe('composeBookForFormat — pages verrouillees', () => {
  const items = [photoItem('p1', 0), photoItem('p2', 1), photoItem('p3', 2), photoItem('p4', 3)];
  const existingPages = [
    { page_index: 1, locked: true, layout_id: 'l-two-photos', content: { kind: 'photo', itemIds: ['p2', 'p3'], blocks: [{ itemIds: ['p2', 'p3'] }] } }
  ];

  it.each(['livret', 'standard', 'luxe'])('garde exactement le contenu/layout verrouille pour le format %s', (formatId) => {
    const { pages } = composeBookForFormat({ items, existingPages, template: TEMPLATE, layouts: LAYOUTS, formatId });
    const locked = pages.find((page) => page.page_index === 1);
    expect(locked.locked).toBe(true);
    expect(locked.layout_id).toBe('l-two-photos');
    expect(locked.content.itemIds).toEqual(['p2', 'p3']);
  });

  it('ne replace jamais ailleurs le contenu deja utilise par une page verrouillee (aucun doublon)', () => {
    const { pages } = composeBookForFormat({ items, existingPages, template: TEMPLATE, layouts: LAYOUTS, formatId: 'luxe' });
    const allItemIds = pages.flatMap((page) => page.content?.itemIds || []);
    expect(allItemIds.filter((id) => id === 'p2').length).toBe(1);
    expect(allItemIds.filter((id) => id === 'p3').length).toBe(1);
  });

  it("conserve 100% du contenu (aucune perte), verrouille ou non", () => {
    const { pages } = composeBookForFormat({ items, existingPages, template: TEMPLATE, layouts: LAYOUTS, formatId: 'standard' });
    const allItemIds = new Set(pages.flatMap((page) => page.content?.itemIds || []));
    expect(allItemIds).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
  });

  it("etend le total de pages plutot que de tronquer une page verrouillee tres en avance", () => {
    const items2 = [photoItem('p1', 0)];
    const farLockedPages = [
      { page_index: 5, locked: true, layout_id: 'l-full-photo', content: { kind: 'photo', itemIds: ['p1'], blocks: [{ itemIds: ['p1'] }] } }
    ];
    const { pages, pageCount } = composeBookForFormat({ items: items2, existingPages: farLockedPages, template: TEMPLATE, layouts: LAYOUTS, formatId: 'livret' });
    expect(pageCount).toBe(6);
    expect(pages.find((page) => page.page_index === 5).locked).toBe(true);
  });
});

describe('composeBookForFormat — le mood du format change reellement la composition', () => {
  // Assez de photos pour que la difference livret (dense, FOUR_PHOTOS favorise)
  // vs luxe (aere, FULL_PHOTO favorise) se traduise en un NOMBRE DE PAGES
  // different, pas seulement un layout_id different sur une seule page.
  const items = Array.from({ length: 8 }, (_, index) => photoItem(`p${index}`, index));

  it('livret produit un livre plus dense (moins de pages) que luxe pour le meme contenu', () => {
    const livret = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'livret' });
    const luxe = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'luxe' });

    expect(livret.pageCount).toBeLessThan(luxe.pageCount);
  });

  it('livret choisit majoritairement FOUR_PHOTOS, luxe majoritairement FULL_PHOTO', () => {
    const livret = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'livret' });
    const luxe = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'luxe' });

    const livretSlugs = livret.pages.map((page) => LAYOUTS.find((l) => l.id === page.layout_id)?.slug);
    const luxeSlugs = luxe.pages.map((page) => LAYOUTS.find((l) => l.id === page.layout_id)?.slug);

    expect(livretSlugs.filter((slug) => slug === 'FOUR_PHOTOS').length).toBeGreaterThan(0);
    expect(luxeSlugs.filter((slug) => slug === 'FULL_PHOTO').length).toBeGreaterThan(0);
    expect(livretSlugs).not.toEqual(luxeSlugs);
  });

  it('standard (mood neutre) reste deterministe et conserve tout le contenu', () => {
    const a = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'standard' });
    const b = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'standard' });
    expect(a.pages).toEqual(b.pages);
    const allItemIds = new Set(a.pages.flatMap((page) => page.content?.itemIds || []));
    expect(allItemIds.size).toBe(8);
  });
});

describe('withChapterSeparators — pages de separation de chapitre (Luxe uniquement)', () => {
  function fakePages(count) {
    return Array.from({ length: count }, (_, index) => ({ layout_id: `l-${index}`, content: { kind: 'photo', itemIds: [`p${index}`] } }));
  }

  it('jamais pour livret/standard, quel que soit le volume', () => {
    const pages = fakePages(40);
    expect(withChapterSeparators(pages, 'livret')).toEqual(pages);
    expect(withChapterSeparators(pages, 'standard')).toEqual(pages);
    expect(withChapterSeparators(pages, undefined)).toEqual(pages);
  });

  it(`jamais en dessous de ${CHAPTER_SEPARATOR_MIN_PAGES} pages composees, meme en luxe`, () => {
    const pages = fakePages(CHAPTER_SEPARATOR_MIN_PAGES - 1);
    expect(withChapterSeparators(pages, 'luxe')).toEqual(pages);
  });

  it('insere au moins un separateur pour un livre luxe suffisamment long, jamais avant la premiere page', () => {
    const pages = fakePages(CHAPTER_SEPARATOR_INTERVAL + 2);
    const result = withChapterSeparators(pages, 'luxe');
    const separators = result.filter((page) => page.content.kind === 'chapter-separator');
    expect(separators.length).toBeGreaterThan(0);
    expect(result[0].content.kind).not.toBe('chapter-separator');
  });

  it('ne consomme ni ne perd aucune page composee (uniquement des insertions)', () => {
    const pages = fakePages(30);
    const result = withChapterSeparators(pages, 'luxe');
    const realPages = result.filter((page) => page.content.kind !== 'chapter-separator');
    expect(realPages).toEqual(pages);
  });

  it(`plafonne a ${CHAPTER_SEPARATOR_MAX_COUNT} separateurs, meme sur un tres long livre`, () => {
    const pages = fakePages(500);
    const result = withChapterSeparators(pages, 'luxe');
    const separators = result.filter((page) => page.content.kind === 'chapter-separator');
    expect(separators.length).toBe(CHAPTER_SEPARATOR_MAX_COUNT);
  });

  it('numerote sequentiellement (01, 02, ...) et ne plante jamais', () => {
    const pages = fakePages(30);
    const result = withChapterSeparators(pages, 'luxe');
    const numbers = result.filter((page) => page.content.kind === 'chapter-separator').map((page) => page.content.number);
    expect(numbers).toEqual(['01', '02', '03'].slice(0, numbers.length));
  });
});

describe('composeBookForFormat — les separateurs de chapitre s\'integrent a la composition complete', () => {
  it('un livre luxe avec beaucoup de contenu contient au moins une page chapter-separator, jamais pour standard/livret avec le meme contenu', () => {
    const items = Array.from({ length: 40 }, (_, index) => photoItem(`p${index}`, index));
    const luxe = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'luxe' });
    const standard = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'standard' });
    const livret = composeBookForFormat({ items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'livret' });

    expect(luxe.pages.some((page) => page.content.kind === 'chapter-separator')).toBe(true);
    expect(standard.pages.some((page) => page.content.kind === 'chapter-separator')).toBe(false);
    expect(livret.pages.some((page) => page.content.kind === 'chapter-separator')).toBe(false);

    // 100% du contenu reste present malgre les separateurs inseres.
    const allItemIds = new Set(luxe.pages.flatMap((page) => page.content?.itemIds || []));
    expect(allItemIds.size).toBe(40);
  });
});

describe('composeBookForFormat — livre sans contenu restant', () => {
  it('ne plante pas quand tout le contenu est deja verrouille', () => {
    const items = [photoItem('p1', 0)];
    const existingPages = [
      { page_index: 0, locked: true, layout_id: 'l-full-photo', content: { kind: 'photo', itemIds: ['p1'], blocks: [{ itemIds: ['p1'] }] } }
    ];
    const { pages, pageCount } = composeBookForFormat({ items, existingPages, template: TEMPLATE, layouts: LAYOUTS, formatId: 'luxe' });
    expect(pageCount).toBe(1);
    expect(pages[0].locked).toBe(true);
  });

  it('livre vide -> aucune page', () => {
    const { pages, pageCount } = composeBookForFormat({ items: [], existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'standard' });
    expect(pages).toEqual([]);
    expect(pageCount).toBe(0);
  });
});
