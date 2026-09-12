// Tests de bookContentService.replaceBookPages : le moteur v2 ne pad plus
// jamais de pages blanches (voir layoutEngine.js), donc une recomposition
// peut legitimement produire MOINS de pages qu'avant — les pages devenues
// orphelines doivent etre supprimees, pas laissees en base (bug signale :
// "recomposer"/"essayer une autre presentation" semblaient ne rien faire,
// en partie a cause d'anciennes pages jamais nettoyees).

const { createSupabaseMock } = require('../helpers/supabaseMock');

describe('bookContentService.replaceBookPages', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('supprime les pages devenues orphelines (au-dela du nouveau resultat, non verrouillees)', async () => {
    const existingPages = [
      { id: 'pg-0', book_id: 'book-1', page_index: 0, layout_id: 'l1', content: {}, locked: false },
      { id: 'pg-1', book_id: 'book-1', page_index: 1, layout_id: 'l1', content: {}, locked: false },
      { id: 'pg-2', book_id: 'book-1', page_index: 2, layout_id: 'l1', content: {}, locked: false }
    ];
    const mock = createSupabaseMock({ book_pages: existingPages });
    jest.doMock('../../config/supabase', () => mock);
    const bookContentService = require('../../services/composition/bookContentService');

    // Nouveau resultat : une seule page (le livre est desormais plus court,
    // ex. contenu reduit) — les pages d'index 1 et 2 doivent disparaitre.
    const newPages = [{ page_index: 0, layout_id: 'l2', content: { itemIds: ['x'] } }];
    await bookContentService.replaceBookPages('book-1', newPages);

    const remaining = mock.__table('book_pages');
    expect(remaining.map((p) => p.page_index).sort()).toEqual([0]);
  });

  it('ne supprime jamais une page verrouillee, meme au-dela du nouveau resultat', async () => {
    const existingPages = [
      { id: 'pg-0', book_id: 'book-1', page_index: 0, layout_id: 'l1', content: {}, locked: false },
      { id: 'pg-1', book_id: 'book-1', page_index: 1, layout_id: 'l1', content: {}, locked: true }
    ];
    const mock = createSupabaseMock({ book_pages: existingPages });
    jest.doMock('../../config/supabase', () => mock);
    const bookContentService = require('../../services/composition/bookContentService');

    const newPages = [{ page_index: 0, layout_id: 'l2', content: { itemIds: ['x'] } }];
    const result = await bookContentService.replaceBookPages('book-1', newPages);

    expect(result.some((p) => p.page_index === 1 && p.locked)).toBe(true);
  });

  it('ne laisse jamais de page orpheline meme quand le nouveau resultat est totalement vide', async () => {
    const existingPages = [
      { id: 'pg-0', book_id: 'book-1', page_index: 0, layout_id: 'l1', content: {}, locked: false },
      { id: 'pg-1', book_id: 'book-1', page_index: 1, layout_id: 'l1', content: {}, locked: false }
    ];
    const mock = createSupabaseMock({ book_pages: existingPages });
    jest.doMock('../../config/supabase', () => mock);
    const bookContentService = require('../../services/composition/bookContentService');

    await bookContentService.replaceBookPages('book-1', []);

    expect(mock.__table('book_pages')).toHaveLength(0);
  });
});

// Retrait de pages par la fin (bouton "-2" de l'atelier, voir
// routes/composition.js: POST /pages/shrink). Le service EXECUTE : c'est la
// route qui juge de la perte de contenu, d'ou des tests separes sur ce que
// l'inspection rapporte et sur ce que la suppression touche reellement.
describe('bookContentService — retrait de pages par la fin', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  const buildPages = () => ([
    { id: 'pg-0', book_id: 'book-1', page_index: 0, layout_id: 'l1', content: { itemIds: ['a'] }, locked: false },
    { id: 'pg-1', book_id: 'book-1', page_index: 1, layout_id: 'l1', content: { itemIds: ['b'] }, locked: false },
    { id: 'pg-2', book_id: 'book-1', page_index: 2, layout_id: 'l1', content: {}, locked: false },
    { id: 'pg-3', book_id: 'book-1', page_index: 3, layout_id: null, content: { itemIds: [] }, locked: false }
  ]);

  const load = (pages) => {
    const mock = createSupabaseMock({ book_pages: pages });
    jest.doMock('../../config/supabase', () => mock);
    return { mock, service: require('../../services/composition/bookContentService') };
  };

  it('retire les dernieres pages et laisse intactes celles du debut', async () => {
    const { mock, service } = load(buildPages());

    await service.removeTrailingPages('book-1', 2);

    expect(mock.__table('book_pages').map((p) => p.page_index).sort()).toEqual([0, 1]);
  });

  it('signale les pages non vides sans rien supprimer', async () => {
    const { mock, service } = load(buildPages());

    // Les 3 dernieres pages incluent pg-1, qui porte du contenu.
    const report = await service.inspectTrailingPages('book-1', 3);

    expect(report.totalPages).toBe(4);
    expect(report.doomed).toHaveLength(3);
    expect(report.nonEmpty.map((p) => p.page_index)).toEqual([1]);
    // Inspecter ne doit JAMAIS ecrire : c'est tout l'interet d'avoir separe
    // cette etape de la suppression.
    expect(mock.__table('book_pages')).toHaveLength(4);
  });

  it('signale les pages verrouillees', async () => {
    const pages = buildPages();
    pages[3].locked = true;
    const { service } = load(pages);

    const report = await service.inspectTrailingPages('book-1', 2);

    expect(report.locked.map((p) => p.page_index)).toEqual([3]);
  });

  it('traite un itemId orphelin comme une page vide', async () => {
    // Une photo supprimee laisse un trou (null) dans itemIds : compter la
    // longueur brute ferait passer cette page pour remplie et bloquerait
    // inutilement le retrait.
    const { service } = load([
      { id: 'pg-0', book_id: 'book-1', page_index: 0, layout_id: 'l1', content: { itemIds: [null, null] }, locked: false }
    ]);

    expect(service.isPageEmpty({ content: { itemIds: [null, null] } })).toBe(true);
    const report = await service.inspectTrailingPages('book-1', 1);
    expect(report.nonEmpty).toHaveLength(0);
  });
});

// Suppression en masse ("Tout supprimer" de l'atelier, 2026-09-12).
// Le point qui compte n'est pas de retirer les lignes — c'est de ne pas
// laisser derriere soi des references orphelines. Une suppression unitaire
// pouvait se le permettre (le rendu ignore un id inconnu) ; sur 40 photos
// d'un coup, les pages deviendraient un champ de trous et les reglages
// (cadrage, roles typographiques) pointeraient dans le vide.
describe('bookContentService.deleteContentItemsByKind', () => {
  beforeEach(() => { jest.resetModules(); });

  const load = () => {
    const mock = createSupabaseMock({
      book_content_items: [
        { id: 'ph1', book_id: 'book-1', kind: 'photo', url: 'http://x/1.jpg' },
        { id: 'ph2', book_id: 'book-1', kind: 'photo', url: 'http://x/2.jpg' },
        { id: 'tx1', book_id: 'book-1', kind: 'texte', text: 'un souvenir' },
        { id: 'ph-autre', book_id: 'book-2', kind: 'photo', url: 'http://x/3.jpg' }
      ],
      book_pages: [
        {
          id: 'pg-0',
          book_id: 'book-1',
          page_index: 0,
          content: {
            itemIds: ['ph1', 'tx1', 'ph2'],
            blocks: [{ kind: 'mixte', itemIds: ['ph1', 'tx1', 'ph2'] }],
            photoAdjustments: { ph1: { zoom: 1.4 } },
            textRoles: { tx1: 'quote' },
            photoFit: { ph1: { statut: 'ok' }, ph2: { statut: 'ok' } }
          }
        },
        {
          id: 'pg-1',
          book_id: 'book-1',
          page_index: 1,
          content: { itemIds: ['tx1'], blocks: [{ kind: 'texte', itemIds: ['tx1'] }] }
        }
      ]
    });
    jest.doMock('../../config/supabase', () => mock);
    return { mock, service: require('../../services/composition/bookContentService') };
  };

  it('supprime tous les items du type demande, et eux seuls', async () => {
    const { mock, service } = load();
    await service.deleteContentItemsByKind('book-1', 'photo');

    const restants = mock.__table('book_content_items').map((row) => row.id).sort();
    expect(restants).toEqual(['ph-autre', 'tx1']);
  });

  it("ne touche jamais aux items d'un AUTRE livre", async () => {
    const { mock, service } = load();
    await service.deleteContentItemsByKind('book-1', 'photo');
    expect(mock.__table('book_content_items').some((row) => row.id === 'ph-autre')).toBe(true);
  });

  it('renvoie les items supprimes (leurs URLs servent au menage du stockage)', async () => {
    const { service } = load();
    const deleted = await service.deleteContentItemsByKind('book-1', 'photo');
    expect(deleted.map((item) => item.url).sort()).toEqual(['http://x/1.jpg', 'http://x/2.jpg']);
  });

  it('remplace les references supprimees par null, SANS decaler les survivants', async () => {
    const { mock, service } = load();
    await service.deleteContentItemsByKind('book-1', 'photo');

    const page = mock.__table('book_pages').find((row) => row.page_index === 0);
    // Le texte reste a sa position d'origine (index 1) : compacter le tableau
    // deplacerait le contenu survivant dans un autre emplacement.
    expect(page.content.itemIds).toEqual([null, 'tx1', null]);
    expect(page.content.blocks[0].itemIds).toEqual([null, 'tx1', null]);
  });

  it('nettoie aussi les reglages indexes par itemId', async () => {
    const { mock, service } = load();
    await service.deleteContentItemsByKind('book-1', 'photo');

    const page = mock.__table('book_pages').find((row) => row.page_index === 0);
    expect(page.content.photoAdjustments).toEqual({});
    expect(page.content.photoFit).toEqual({});
    // Les reglages des items CONSERVES ne bougent pas.
    expect(page.content.textRoles).toEqual({ tx1: 'quote' });
  });

  it('ne reecrit pas une page qui ne contenait aucun item supprime', async () => {
    const { mock, service } = load();
    const avant = JSON.stringify(mock.__table('book_pages').find((row) => row.page_index === 1));
    await service.deleteContentItemsByKind('book-1', 'photo');
    const apres = JSON.stringify(mock.__table('book_pages').find((row) => row.page_index === 1));
    expect(apres).toBe(avant);
  });

  it('ne fait rien quand il n y a rien a supprimer', async () => {
    const { service } = load();
    await service.deleteContentItemsByKind('book-1', 'photo');
    const deuxieme = await service.deleteContentItemsByKind('book-1', 'photo');
    expect(deuxieme).toEqual([]);
  });
});
