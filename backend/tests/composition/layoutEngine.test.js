// Tests unitaires du moteur de mise en page (fonction pure, aucun mock
// necessaire) : determinisme, absence de page vide, pas de bloc coupe,
// regroupement par contribution. Trois profils de livre, comme prevu par
// le plan de developpement (livre pauvre / riche / mix photos-texte).

const { compose, weightOfItem, groupIntoBlocks, recommendPageCount, PAGE_COUNT_TIERS } = require('../../services/composition/layoutEngine');

const TEMPLATE = {
  id: 'tpl-elegance',
  allowed_layouts: ['photo-pleine-page', 'photo-pleine-page-marge', 'photo-duo', 'texte-centre', 'contribution-standard']
};

const LAYOUTS = [
  // Deux variantes equivalentes pour une photo seule : permet a la graine
  // de regeneration de faire un vrai choix entre candidats interchangeables.
  { id: 'lay-photo-1', slug: 'photo-pleine-page', kind: 'photo', min_items: 1, max_items: 1 },
  { id: 'lay-photo-1b', slug: 'photo-pleine-page-marge', kind: 'photo', min_items: 1, max_items: 1 },
  { id: 'lay-photo-2', slug: 'photo-duo', kind: 'photo', min_items: 2, max_items: 2 },
  { id: 'lay-texte-1', slug: 'texte-centre', kind: 'texte', min_items: 1, max_items: 1 },
  { id: 'lay-contrib-1', slug: 'contribution-standard', kind: 'contribution', min_items: 1, max_items: 3 }
];

function photoItem(id, displayOrder) {
  return { id, kind: 'photo', url: `https://cdn.test/${id}.jpg`, display_order: displayOrder };
}

function textItem(id, displayOrder, length = 100) {
  return { id, kind: 'texte', text: 'x'.repeat(length), display_order: displayOrder };
}

describe('layoutEngine.compose — livre pauvre en contenu', () => {
  const items = [photoItem('p1', 0), photoItem('p2', 1), photoItem('p3', 2)];

  it('ne cree aucune page vide et place tout le contenu', () => {
    const { pages, overflow } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 24 });

    expect(overflow).toBe(false);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.content.itemIds.length).toBeGreaterThan(0);
    }
    const placedIds = pages.flatMap((p) => p.content.itemIds).sort();
    expect(placedIds).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('layoutEngine.compose — livre riche (depasse le budget)', () => {
  const items = Array.from({ length: 40 }, (_, i) => photoItem(`p${i}`, i));

  it('signale un depassement (overflow) sans perdre de contenu', () => {
    const { pages, overflow } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 5 });

    expect(overflow).toBe(true);
    const placedIds = new Set(pages.flatMap((p) => p.content.itemIds));
    expect(placedIds.size).toBe(40);
  });
});

describe('layoutEngine.compose — mix photos/texte + contributions', () => {
  const items = [
    photoItem('photo-1', 0),
    // Une contribution : deux photos + un message d'un meme contributeur,
    // doit rester un seul bloc (jamais separe entre deux pages).
    { id: 'c1-photo-a', kind: 'photo', contribution_id: 'contrib-1', display_order: 1 },
    { id: 'c1-photo-b', kind: 'photo', contribution_id: 'contrib-1', display_order: 1 },
    { id: 'c1-texte', kind: 'texte', text: 'Un souvenir tendre.', contribution_id: 'contrib-1', display_order: 1 },
    textItem('texte-1', 2, 900) // texte long : plusieurs "slots", mais jamais coupe
  ];

  it('regroupe les items d\'une meme contribution en un seul bloc', () => {
    const blocks = groupIntoBlocks(items);
    const contributionBlock = blocks.find((b) => b.key === 'contribution:contrib-1');

    expect(contributionBlock).toBeDefined();
    expect(contributionBlock.itemIds.sort()).toEqual(['c1-photo-a', 'c1-photo-b', 'c1-texte'].sort());
  });

  it('ne coupe jamais un bloc entre deux pages', () => {
    const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 6 });

    for (const page of pages) {
      const hasContributionItems = page.content.itemIds.some((id) => id.startsWith('c1-'));
      if (hasContributionItems) {
        const contributionItemsOnPage = page.content.itemIds.filter((id) => id.startsWith('c1-'));
        expect(contributionItemsOnPage.sort()).toEqual(['c1-photo-a', 'c1-photo-b', 'c1-texte'].sort());
      }
    }
  });

  it('le texte long reste entier sur une seule page', () => {
    const { pages } = compose({ items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 6 });
    const pagesWithLongText = pages.filter((p) => p.content.itemIds.includes('texte-1'));
    expect(pagesWithLongText).toHaveLength(1);
  });
});

describe('layoutEngine.compose — determinisme', () => {
  const items = [
    photoItem('p1', 0), photoItem('p2', 1), photoItem('p3', 2), photoItem('p4', 3),
    textItem('t1', 4), textItem('t2', 5)
  ];

  it('memes entrees => meme sortie, a chaque execution', () => {
    const input = { items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 10, variant: 3 };
    const first = compose(input);
    const second = compose(input);
    expect(second).toEqual(first);
  });

  it('un variant different peut changer la presentation, jamais le contenu', () => {
    const base = { items, template: TEMPLATE, layouts: LAYOUTS, pageCount: 10 };
    const results = [0, 1, 2, 3, 4, 5, 6, 7].map((variant) => compose({ ...base, variant }));

    for (const result of results) {
      const placedIds = result.pages.flatMap((p) => p.content.itemIds).sort();
      expect(placedIds).toEqual(['p1', 'p2', 'p3', 'p4', 't1', 't2'].sort());
    }

    const layoutSignatures = new Set(
      results.map((r) => JSON.stringify(r.pages.flatMap((p) => p.content.blocks.map((b) => b.layoutId))))
    );
    // Au moins deux variantes doivent produire un agencement de layouts different
    // (sinon la graine de regeneration ne servirait a rien).
    expect(layoutSignatures.size).toBeGreaterThan(1);
  });
});

describe('weightOfItem', () => {
  it('une photo pese toujours 1 slot', () => {
    expect(weightOfItem({ kind: 'photo' })).toBe(1);
  });

  it('un texte pese au moins 1 slot, et davantage s\'il est long', () => {
    expect(weightOfItem({ kind: 'texte', text: 'court' })).toBe(1);
    expect(weightOfItem({ kind: 'texte', text: 'x'.repeat(900) })).toBe(3);
  });
});

describe('recommendPageCount — mode Automatique', () => {
  it('recommande le plus petit palier pour un livre pauvre en contenu', () => {
    const items = [photoItem('p1', 0), photoItem('p2', 1)];
    const { recommended, tiers } = recommendPageCount({ items, template: TEMPLATE });

    expect(recommended).toBe(PAGE_COUNT_TIERS[0]);
    expect(tiers.every((tier) => tier.fits)).toBe(true);
  });

  it('recommande un palier plus grand quand le contenu est plus volumineux', () => {
    const fewItems = Array.from({ length: 3 }, (_, i) => photoItem(`p${i}`, i));
    const manyItems = Array.from({ length: 120 }, (_, i) => photoItem(`p${i}`, i));

    const small = recommendPageCount({ items: fewItems, template: TEMPLATE });
    const large = recommendPageCount({ items: manyItems, template: TEMPLATE });

    expect(large.recommended).toBeGreaterThan(small.recommended);
  });

  it('plafonne au plus grand palier sans jamais depasser', () => {
    const hugeItems = Array.from({ length: 1000 }, (_, i) => photoItem(`p${i}`, i));
    const { recommended } = recommendPageCount({ items: hugeItems, template: TEMPLATE });
    expect(recommended).toBe(PAGE_COUNT_TIERS[PAGE_COUNT_TIERS.length - 1]);
  });

  it('fonctionne meme sans template choisi (densite par defaut)', () => {
    const items = [photoItem('p1', 0)];
    expect(() => recommendPageCount({ items })).not.toThrow();
  });
});
