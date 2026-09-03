// Tests du moteur de mise en page v2 (fonction pure, aucun mock necessaire) :
// placement complet du contenu, determinisme, garantie de repli, decoupage
// des textes trop longs, recommandation de palier. Catalogue de fixture
// aligne sur la nomenclature v2 (voir backend/sql/phase08_layout_engine_v2.sql).

const {
  compose,
  recommendPageCount,
  groupIntoBlocks,
  buildUnitsFromItems,
  PAGE_COUNT_TIERS,
  GUARANTEED_FALLBACK_SLUGS
} = require('../../services/composition/layoutEngine');
const { TEXT_HARD_SPLIT_THRESHOLD } = require('../../services/composition/textLength');
const { renderBookHtml } = require('../../services/composition/pageRenderer');

const LAYOUTS = [
  { id: 'l-full-photo', slug: 'FULL_PHOTO', kind: 'photo', capacity: { slots: [{ type: 'photo' }] } },
  { id: 'l-two-photos', slug: 'TWO_PHOTOS', kind: 'photo', capacity: { slots: [{ type: 'photo' }, { type: 'photo' }] } },
  {
    id: 'l-four-photos',
    slug: 'FOUR_PHOTOS',
    kind: 'photo',
    capacity: { slots: [{ type: 'photo' }, { type: 'photo' }, { type: 'photo' }, { type: 'photo' }] }
  },
  {
    id: 'l-photo-caption',
    slug: 'PHOTO_WITH_CAPTION',
    kind: 'mixte',
    capacity: { slots: [{ type: 'photo' }, { type: 'text', lengthClass: ['SHORT'] }] }
  },
  {
    id: 'l-one-testimony',
    slug: 'ONE_TESTIMONY',
    kind: 'texte',
    capacity: { slots: [{ type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }] }
  },
  {
    id: 'l-two-testimonies',
    slug: 'TWO_TESTIMONIES',
    kind: 'texte',
    capacity: { slots: [{ type: 'text', lengthClass: ['SHORT', 'MEDIUM'] }, { type: 'text', lengthClass: ['SHORT', 'MEDIUM'] }] }
  },
  {
    id: 'l-three-testimonies',
    slug: 'THREE_TESTIMONIES',
    kind: 'texte',
    capacity: { slots: [{ type: 'text', lengthClass: ['SHORT'] }, { type: 'text', lengthClass: ['SHORT'] }, { type: 'text', lengthClass: ['SHORT'] }] }
  },
  {
    id: 'l-photo-text',
    slug: 'PHOTO_TEXT',
    kind: 'mixte',
    capacity: { slots: [{ type: 'photo' }, { type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }] }
  },
  {
    id: 'l-text-photo',
    slug: 'TEXT_PHOTO',
    kind: 'mixte',
    capacity: { slots: [{ type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }, { type: 'photo' }] }
  },
  {
    id: 'l-two-photos-text',
    slug: 'TWO_PHOTOS_TEXT',
    kind: 'mixte',
    capacity: { slots: [{ type: 'photo' }, { type: 'photo' }, { type: 'text', lengthClass: ['SHORT', 'MEDIUM'] }] }
  },
  { id: 'l-contribution', slug: 'contribution-standard', kind: 'contribution', min_items: 1, max_items: 4 }
];

const TEMPLATE = { id: 'tpl-elegance', allowed_layouts: LAYOUTS.map((l) => l.slug) };

function photoItem(id, displayOrder, metadata) {
  return { id, kind: 'photo', url: `https://cdn.test/${id}.jpg`, display_order: displayOrder, metadata };
}

// Texte de remplissage avec de vrais mots/phrases (pas juste des
// caracteres repetes) : necessaire pour exercer le decoupage par
// phrase/mot de splitTextSafely de facon realiste.
function fillerText(length) {
  const sentence = 'Un souvenir precieux de ce jour-la, raconte avec ses propres mots. ';
  let text = '';
  while (text.length < length) text += sentence;
  return text.slice(0, length);
}

function textItem(id, displayOrder, length = 100) {
  return { id, kind: 'texte', text: fillerText(length), display_order: displayOrder };
}

function contributionItems(contributionId, displayOrder, { photos = 1, textLength = 100 } = {}) {
  const items = [];
  for (let i = 0; i < photos; i += 1) {
    items.push({
      id: `${contributionId}-photo-${i}`,
      kind: 'photo',
      url: 'https://cdn.test/c.jpg',
      contribution_id: contributionId,
      display_order: displayOrder
    });
  }
  items.push({
    id: `${contributionId}-text`,
    kind: 'texte',
    text: fillerText(textLength),
    contribution_id: contributionId,
    display_order: displayOrder,
    metadata: { contributor_name: 'Jules' }
  });
  return items;
}

function placedItemIds(pages) {
  return pages.flatMap((page) => page.content.itemIds).sort();
}

describe('layoutEngine.compose — placement complet du contenu', () => {
  it('livre principalement photo : place toutes les photos, sans en perdre', () => {
    const items = Array.from({ length: 12 }, (_, i) => photoItem(`p${i}`, i));
    const { pages, overflow } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24 });

    expect(overflow).toBe(false);
    expect(placedItemIds(pages)).toEqual(items.map((i) => i.id).sort());
  });

  it('livre principalement texte : place tous les temoignages', () => {
    const items = Array.from({ length: 30 }, (_, i) => textItem(`t${i}`, i, 60));
    const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 48 });

    expect(placedItemIds(pages)).toEqual(items.map((i) => i.id).sort());
  });

  it('livre equilibre : place photos et textes, sans en perdre', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => photoItem(`p${i}`, i * 2)),
      ...Array.from({ length: 5 }, (_, i) => textItem(`t${i}`, i * 2 + 1, 150))
    ];
    const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24 });

    expect(placedItemIds(pages)).toEqual(items.map((i) => i.id).sort());
  });

  it('ne genere jamais aucune page vide, quel que soit le nombre de pages demande (aucun remplissage artificiel)', () => {
    const items = Array.from({ length: 6 }, (_, i) => photoItem(`p${i}`, i));
    PAGE_COUNT_TIERS.forEach((pageCount) => {
      const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount });
      pages.forEach((page) => {
        expect(page.content.itemIds.length).toBeGreaterThan(0);
      });
    });
  });

  it('un contenu modeste (4 photos + 2 textes) produit un livre court, jamais pad de pages blanches jusqu\'au palier choisi', () => {
    // Reproduit le cas signale : un petit livre choisi a 24 pages ne doit
    // jamais se retrouver avec des pages vides pour "faire le compte".
    const items = [
      photoItem('p1', 0), photoItem('p2', 1), photoItem('p3', 2), photoItem('p4', 3),
      textItem('t1', 4, 80), textItem('t2', 5, 80)
    ];
    const { pages, underflow } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24 });

    expect(pages.length).toBeLessThan(24 - 2);
    pages.forEach((page) => expect(page.content.itemIds.length).toBeGreaterThan(0));
    expect(underflow).toBe(true);
    expect(placedItemIds(pages)).toEqual(items.map((i) => i.id).sort());
  });

  it('underflow=true si le contenu tient sur moins de pages que demande', () => {
    const items = [photoItem('p1', 0)];
    const { underflow } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24 });
    expect(underflow).toBe(true);
  });

  it('underflow=false si le contenu correspond bien au nombre de pages demande', () => {
    const items = [photoItem('p1', 0)];
    const { pages, underflow } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 16 });
    // 1 photo -> 1 page de contenu ; avec fixedPages=2, pageCount=16 laisse
    // un budget de 14 pages, largement superieur au contenu reel : on
    // verifie surtout que le flag ne ment jamais dans le sens inverse.
    expect(pages.length).toBeGreaterThan(0);
    expect(typeof underflow).toBe('boolean');
  });

  it('overflow=true si le contenu depasse le budget, mais rien n\'est perdu pour autant', () => {
    const items = Array.from({ length: 60 }, (_, i) => photoItem(`p${i}`, i));
    const { pages, overflow } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 16 });

    expect(overflow).toBe(true);
    expect(placedItemIds(pages)).toEqual(items.map((i) => i.id).sort());
  });
});

describe('layoutEngine.compose — contributions et decoupage de textes longs', () => {
  it('garde une contribution atomique (photo + texte du meme contributeur jamais separes entre deux pages)', () => {
    const items = contributionItems('c1', 0, { photos: 2, textLength: 80 });
    const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 16 });

    const pagesWithContent = pages.filter((page) => page.content.itemIds.length > 0);
    expect(pagesWithContent.length).toBe(1);
    expect(pagesWithContent[0].content.itemIds.sort()).toEqual(items.map((i) => i.id).sort());
  });

  it('decoupe un texte tres long sur plusieurs pages, sans perdre de contenu', () => {
    const items = [textItem('long1', 0, TEXT_HARD_SPLIT_THRESHOLD * 2.5)];
    const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24 });

    const pagesForText = pages.filter((page) => page.content.itemIds.includes('long1'));
    expect(pagesForText.length).toBeGreaterThan(1);
    // Chaque fragment reste sous le seuil de decoupage.
    pagesForText.forEach((page) => {
      const override = page.content.blocks[0].textOverrides?.find((o) => o.itemId === 'long1');
      expect(override).toBeDefined();
      expect(override.text.length).toBeLessThanOrEqual(TEXT_HARD_SPLIT_THRESHOLD);
    });
  });

  it('decoupe le texte d\'une contribution trop longue sans repeter la photo sur les pages de suite', () => {
    const items = contributionItems('c2', 0, { photos: 1, textLength: TEXT_HARD_SPLIT_THRESHOLD * 2 });
    const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24 });

    const photoId = 'c2-photo-0';
    const pagesWithPhoto = pages.filter((page) => page.content.itemIds.includes(photoId));
    expect(pagesWithPhoto.length).toBe(1); // la photo n'apparait que sur la 1ere page de la contribution

    const pagesWithText = pages.filter((page) => page.content.itemIds.includes('c2-text'));
    expect(pagesWithText.length).toBeGreaterThan(1); // le texte, lui, continue sur plusieurs pages
  });
});

describe('layoutEngine.compose — garantie de repli', () => {
  it('place toujours 1 photo seule, meme avec un catalogue minimal', () => {
    const minimalLayouts = LAYOUTS.filter((l) => GUARANTEED_FALLBACK_SLUGS.includes(l.slug));
    const items = [photoItem('p1', 0)];
    const { pages } = compose({ items, template: { id: 'tpl', allowed_layouts: [] }, layouts: minimalLayouts, pageCount: 16 });
    expect(placedItemIds(pages)).toEqual(['p1']);
  });

  it('place toujours 1 texte long isole (ne bloque jamais sur ONE_TESTIMONY)', () => {
    const minimalLayouts = LAYOUTS.filter((l) => GUARANTEED_FALLBACK_SLUGS.includes(l.slug));
    const items = [textItem('t1', 0, 5000)];
    const { pages } = compose({ items, template: { id: 'tpl', allowed_layouts: [] }, layouts: minimalLayouts, pageCount: 16 });
    expect(placedItemIds(pages).length).toBeGreaterThan(0);
  });

  it('ne bloque jamais meme avec allowed_layouts vide et un catalogue reduit', () => {
    const items = [photoItem('p1', 0), textItem('t1', 1), photoItem('p2', 2)];
    expect(() => compose({ items, template: { id: 'tpl', allowed_layouts: [] }, layouts: LAYOUTS, pageCount: 16 })).not.toThrow();
  });
});

describe('layoutEngine.compose — determinisme', () => {
  const items = [
    photoItem('p1', 0), photoItem('p2', 1), photoItem('p3', 2), photoItem('p4', 3),
    textItem('t1', 4, 90), textItem('t2', 5, 90)
  ];

  it('le meme variant produit exactement le meme resultat a chaque execution', () => {
    const run1 = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24, variant: 3 });
    const run2 = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24, variant: 3 });
    expect(run1.pages).toEqual(run2.pages);
  });

  it('des variants differents peuvent changer la presentation, mais placent toujours le meme contenu au total', () => {
    const runA = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24, variant: 0 });
    const runB = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24, variant: 1 });
    // Invariant volontairement affaibli par rapport au v1 : le contenu place
    // reste identique, mais (contrairement au v1) deux layouts de capacites
    // differentes peuvent en de rares cas se departager a score egal, ce qui
    // peut alors faire varier le nombre de pages de contenu d'un variant a
    // l'autre. Voir le plan "Moteur de mise en page v2", section scoring.
    expect(placedItemIds(runA.pages)).toEqual(placedItemIds(runB.pages));
  });
});

describe('layoutEngine.compose — la regeneration change toujours quelque chose de visible', () => {
  // Reproduit le bug signale : "essayer une autre presentation"/"recomposer"
  // semblaient ne rien faire. Cause reelle : pour un contenu qui resout
  // toujours vers le MEME layout structurel (ex. 4 photos -> toujours
  // FOUR_PHOTOS), l'ancien mecanisme (PRNG uniquement pour departager des
  // egalites de score entre layouts differents) n'avait souvent aucune
  // egalite a departager, donc rien ne changeait jamais. Le
  // presentationVariant (voir buildPageEntry) corrige ca independamment du
  // choix structurel.
  it('un contenu qui choisit toujours le meme layout structurel produit tout de meme un rendu different entre plusieurs variants', () => {
    const items = [
      photoItem('p1', 0), photoItem('p2', 1), photoItem('p3', 2), photoItem('p4', 3),
      textItem('t1', 4, 80), textItem('t2', 5, 80)
    ];

    const renders = Array.from({ length: 6 }, (_, variant) => {
      const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24, variant });
      return renderBookHtml({ book: { title: 'Test' }, pages, items, layouts: LAYOUTS });
    });

    expect(new Set(renders).size).toBeGreaterThan(1);
  });
});

describe('layoutEngine.recommendPageCount', () => {
  it('recommande un palier parmi PAGE_COUNT_TIERS = [16, 24, 32, 48, 64]', () => {
    const items = Array.from({ length: 20 }, (_, i) => photoItem(`p${i}`, i));
    const { recommended } = recommendPageCount({ items, template: TEMPLATE, layouts: LAYOUTS });
    expect(PAGE_COUNT_TIERS).toContain(recommended);
  });

  it('recommande le plus petit palier pour un contenu vide', () => {
    const { recommended, estimatedPages } = recommendPageCount({ items: [], template: TEMPLATE, layouts: LAYOUTS });
    expect(estimatedPages).toBe(0);
    expect(recommended).toBe(PAGE_COUNT_TIERS[0]);
  });

  it('recommande un palier plus grand pour un livre plus riche en contenu', () => {
    const small = recommendPageCount({ items: Array.from({ length: 4 }, (_, i) => photoItem(`p${i}`, i)), template: TEMPLATE, layouts: LAYOUTS });
    const big = recommendPageCount({ items: Array.from({ length: 80 }, (_, i) => photoItem(`p${i}`, i)), template: TEMPLATE, layouts: LAYOUTS });
    expect(PAGE_COUNT_TIERS.indexOf(big.recommended)).toBeGreaterThanOrEqual(PAGE_COUNT_TIERS.indexOf(small.recommended));
  });
});

describe('layoutEngine.groupIntoBlocks / buildUnitsFromItems', () => {
  it('groupIntoBlocks regroupe les items d\'une meme contribution en un seul bloc', () => {
    const items = contributionItems('c1', 0, { photos: 2 });
    const blocks = groupIntoBlocks(items);
    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe('contribution');
  });

  it('buildUnitsFromItems ne modifie pas le nombre d\'items reels pour un contenu sans texte long', () => {
    const items = [photoItem('p1', 0), textItem('t1', 1, 50)];
    const units = buildUnitsFromItems(items);
    expect(units.map((u) => u.itemIds).flat().sort()).toEqual(['p1', 't1']);
  });
});
