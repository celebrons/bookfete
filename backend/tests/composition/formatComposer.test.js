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

  // CONTRAT MODIFIE LE 2026-09-14, deliberement.
  //
  // Ce test exigeait auparavant que TOUT le contenu du livre soit replace,
  // y compris les souvenirs jamais poses sur une page. C'etait un defaut, pas
  // une garantie : sur un livre compose a la main, changer de format ajoutait
  // silencieusement des pages remplies de contenu que l'utilisateur n'avait
  // pas mis dans son livre (constate sur « Voyage a Montreal » : 30 pages
  // faites a la main, +4 pages en Livret/Standard et +6 en Luxe).
  //
  // Nouveau contrat : sur un livre qui contient des pages faites a la main,
  // seul le contenu DEJA POSE circule. La garantie « aucune perte » reste
  // entiere pour un livre 100% automatique (test dedie plus bas).
  it('ne perd aucun contenu DEJA POSE sur une page, verrouillee ou non', () => {
    const avecPageAuto = [
      ...existingPages,
      { page_index: 2, locked: false, layout_id: 'l-full-photo', content: { kind: 'photo', itemIds: ['p1'], blocks: [{ itemIds: ['p1'] }] } }
    ];
    const { pages } = composeBookForFormat({ items, existingPages: avecPageAuto, template: TEMPLATE, layouts: LAYOUTS, formatId: 'standard' });
    const allItemIds = new Set(pages.flatMap((page) => page.content?.itemIds || []).filter(Boolean));
    expect(allItemIds).toEqual(new Set(['p1', 'p2', 'p3']));
    // p4 n'a jamais ete pose : il reste dans la bibliotheque, le livre ne
    // grossit pas tout seul pour l'accueillir.
    expect(allItemIds.has('p4')).toBe(false);
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

// Changer de FORMAT ne doit jamais ajouter au livre du contenu que
// l'utilisateur n'y a pas mis.
//
// Defaut reel constate le 2026-09-14 sur « Voyage a Montreal » : 30 pages
// composees a la main, 10 souvenirs jamais places restes dans la
// bibliotheque. Le simple choix d'un format ajoutait 4 pages en
// Livret/Standard et 6 en Luxe, remplies de ces souvenirs-la. « Des pages
// supplementaires apparaissent dans l'apercu final, mon livre ne contient
// que 30 pages. »
describe('composeBookForFormat — un livre fait a la main ne grossit pas tout seul', () => {
  // 4 photos posees a la main sur 2 pages, 6 photos JAMAIS placees.
  const posees = [photoItem('p1', 0), photoItem('p2', 1), photoItem('p3', 2), photoItem('p4', 3)];
  const jamaisPlacees = [5, 6, 7, 8, 9, 10].map((n) => photoItem(`libre-${n}`, n));
  const items = [...posees, ...jamaisPlacees];

  const pagesManuelles = [
    { page_index: 0, layout_id: 'l-two-photos', locked: true, content: { kind: 'photo', itemIds: ['p1', 'p2'], blocks: [{ kind: 'photo', layoutId: 'l-two-photos', itemIds: ['p1', 'p2'] }] } },
    { page_index: 1, layout_id: 'l-two-photos', locked: true, content: { kind: 'photo', itemIds: ['p3', 'p4'], blocks: [{ kind: 'photo', layoutId: 'l-two-photos', itemIds: ['p3', 'p4'] }] } }
  ];

  const composer = (formatId, existingPages) => composeBookForFormat({
    items, existingPages, template: TEMPLATE, layouts: LAYOUTS, formatId
  });

  it('garde EXACTEMENT le meme nombre de pages dans les trois formats', () => {
    const comptes = ['livret', 'standard', 'luxe'].map((f) => composer(f, pagesManuelles).pageCount);
    expect(comptes).toEqual([2, 2, 2]);
  });

  it('ne place aucun souvenir laisse dans la bibliotheque', () => {
    const { pages } = composer('luxe', pagesManuelles);
    const posesEnPage = pages.flatMap((page) => page.content?.itemIds || []).filter(Boolean);
    jamaisPlacees.forEach((item) => {
      expect(posesEnPage).not.toContain(item.id);
    });
  });

  // NON DESTRUCTIF : les pages automatiques deja presentes ne sont pas
  // supprimees non plus. Un livre genere automatiquement puis retouche a la
  // main ne doit pas perdre ses pages generees en changeant de format —
  // ce serait le defaut symetrique, et bien pire que d'en ajouter.
  it('ne supprime pas non plus les pages automatiques deja presentes', () => {
    const avecPageAuto = [
      ...pagesManuelles,
      { page_index: 2, layout_id: 'l-two-photos', locked: false, content: { kind: 'photo', itemIds: ['libre-5', 'libre-6'], blocks: [{ kind: 'photo', layoutId: 'l-two-photos', itemIds: ['libre-5', 'libre-6'] }] } }
    ];
    ['livret', 'standard', 'luxe'].forEach((formatId) => {
      const { pages, pageCount } = composer(formatId, avecPageAuto);
      expect(pageCount).toBe(3);
      const posesEnPage = pages.flatMap((page) => page.content?.itemIds || []).filter(Boolean);
      expect(posesEnPage).toContain('libre-5');
      expect(posesEnPage).toContain('libre-6');
      // ... et toujours aucun souvenir jamais pose.
      expect(posesEnPage).not.toContain('libre-9');
    });
  });

  // Le coeur de la regle : en mode manuel, changer de format change le
  // PAPIER, jamais le livre.
  it('rend le livre STRICTEMENT identique dans les trois formats', () => {
    const avecPageAuto = [
      ...pagesManuelles,
      { page_index: 2, layout_id: 'l-full-photo', locked: false, content: { kind: 'photo', itemIds: ['libre-5'], blocks: [{ kind: 'photo', layoutId: 'l-full-photo', itemIds: ['libre-5'] }] } }
    ];
    const rendus = ['livret', 'standard', 'luxe'].map((formatId) => JSON.stringify(composer(formatId, avecPageAuto).pages));
    expect(rendus[1]).toBe(rendus[0]);
    expect(rendus[2]).toBe(rendus[0]);
  });

  it('un livre 100% automatique garde sa pagination propre a chaque format', () => {
    // Aucune page verrouillee : le moteur reprend TOUT le contenu, comme
    // avant — c'est la fonctionnalite « chaque format a sa propre
    // pagination », elle ne doit pas etre touchee par le correctif.
    const { pages } = composeBookForFormat({
      items, existingPages: [], template: TEMPLATE, layouts: LAYOUTS, formatId: 'standard'
    });
    const posesEnPage = pages.flatMap((page) => page.content?.itemIds || []).filter(Boolean);
    expect(posesEnPage.length).toBe(items.length);
  });
});
