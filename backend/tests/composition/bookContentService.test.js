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
