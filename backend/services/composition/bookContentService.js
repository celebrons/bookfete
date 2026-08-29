// backend/services/composition/bookContentService.js
//
// Pool de contenu normalise d'un livre (book_content_items) et persistance
// du resultat du moteur de mise en page (book_pages). Aucune logique de
// composition ici : voir layoutEngine.js pour l'algorithme lui-meme.

const supabase = require('../../config/supabase');

async function listContentItems(bookId) {
  const { data, error } = await supabase
    .from('book_content_items')
    .select('*')
    .eq('book_id', bookId)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data;
}

async function createContentItem(bookId, payload = {}) {
  const { data, error } = await supabase
    .from('book_content_items')
    .insert([{ ...payload, book_id: bookId }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateContentItem(bookId, itemId, payload = {}) {
  const { data, error } = await supabase
    .from('book_content_items')
    .update(payload)
    .eq('id', itemId)
    .eq('book_id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteContentItem(bookId, itemId) {
  const { error } = await supabase
    .from('book_content_items')
    .delete()
    .eq('id', itemId)
    .eq('book_id', bookId);

  if (error) throw error;
}

async function listPages(bookId) {
  const { data, error } = await supabase
    .from('book_pages')
    .select('*')
    .eq('book_id', bookId)
    .order('page_index', { ascending: true });

  if (error) throw error;
  return data;
}

// Ecrit le resultat complet d'une composition (layoutEngine.compose()) :
// remplace toutes les pages non verrouillees du livre par le nouveau
// resultat. Les pages verrouillees (locked = true) sont preservees telles
// quelles, meme si le moteur en proposait une version differente.
async function replaceBookPages(bookId, pages = []) {
  const existing = await listPages(bookId);
  const lockedIndexes = new Set(existing.filter((page) => page.locked).map((page) => page.page_index));

  const rows = pages
    .filter((page) => !lockedIndexes.has(page.page_index))
    .map((page) => ({
      book_id: bookId,
      page_index: page.page_index,
      layout_id: page.layout_id,
      content: page.content || {}
    }));

  if (rows.length === 0) {
    return listPages(bookId);
  }

  const { error } = await supabase
    .from('book_pages')
    .upsert(rows, { onConflict: 'book_id,page_index' });

  if (error) throw error;
  return listPages(bookId);
}

async function upsertPage(bookId, pageIndex, payload = {}) {
  const { data, error } = await supabase
    .from('book_pages')
    .upsert(
      [{ ...payload, book_id: bookId, page_index: pageIndex }],
      { onConflict: 'book_id,page_index' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  listContentItems,
  createContentItem,
  updateContentItem,
  deleteContentItem,
  listPages,
  replaceBookPages,
  upsertPage
};
