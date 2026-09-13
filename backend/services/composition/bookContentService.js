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

// Supprime TOUS les souvenirs d'un type ('photo' ou 'texte') et, surtout,
// nettoie les references qu'ils laissaient derriere eux.
//
// Une suppression unitaire (deleteContentItem) ne retire que la ligne : les
// pages gardent l'itemId, qui devient orphelin. C'est supportable pour une
// photo isolee (le rendu ignore deja les ids inconnus), ca ne l'est plus
// pour 40 d'un coup — on se retrouverait avec des pages entierement
// composees de trous, et des reglages (cadrage, role typographique) pointant
// vers des elements disparus.
//
// Les emplacements sont mis a `null`, jamais retires du tableau : c'est la
// convention de tout ce projet (voir renderPhotoBlock/renderMixteOrderedBlock
// — "les autres elements restent a leur place"). Compacter reindexerait les
// emplacements et deplacerait le contenu survivant.
//
// Retourne les items supprimes, pour que l'appelant puisse nettoyer le
// stockage (leurs URLs ne sont plus accessibles autrement).
async function deleteContentItemsByKind(bookId, kind) {
  const { data: doomed, error: readError } = await supabase
    .from('book_content_items')
    .select('*')
    .eq('book_id', bookId)
    .eq('kind', kind);
  if (readError) throw readError;
  if (!doomed || doomed.length === 0) return [];

  const doomedIds = new Set(doomed.map((item) => item.id));

  const { error: deleteError } = await supabase
    .from('book_content_items')
    .delete()
    .eq('book_id', bookId)
    .eq('kind', kind);
  if (deleteError) throw deleteError;

  // Nettoyage des pages : on ne reecrit QUE celles reellement touchees.
  const pages = await listPages(bookId);
  const cleanIds = (ids) => (Array.isArray(ids) ? ids.map((id) => (doomedIds.has(id) ? null : id)) : ids);
  const cleanKeyed = (record) => {
    if (!record || typeof record !== 'object') return record;
    const kept = Object.fromEntries(Object.entries(record).filter(([id]) => !doomedIds.has(id)));
    return Object.keys(kept).length === Object.keys(record).length ? record : kept;
  };

  for (const page of pages) {
    const content = page.content || {};
    const touched = (Array.isArray(content.itemIds) && content.itemIds.some((id) => doomedIds.has(id)))
      || (Array.isArray(content.blocks) && content.blocks.some((block) => (block.itemIds || []).some((id) => doomedIds.has(id))));
    if (!touched) continue;

    const nextContent = {
      ...content,
      itemIds: cleanIds(content.itemIds),
      blocks: Array.isArray(content.blocks)
        ? content.blocks.map((block) => ({ ...block, itemIds: cleanIds(block.itemIds) }))
        : content.blocks,
      photoAdjustments: cleanKeyed(content.photoAdjustments),
      textRoles: cleanKeyed(content.textRoles),
      textStyles: cleanKeyed(content.textStyles),
      photoFit: cleanKeyed(content.photoFit),
      textFit: cleanKeyed(content.textFit)
    };

    // eslint-disable-next-line no-await-in-loop
    await upsertPage(bookId, page.page_index, { content: nextContent });
  }

  return doomed;
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
//
// Le moteur v2 ne pad plus jamais avec des pages blanches (voir
// layoutEngine.js) : une recomposition peut donc legitimement produire MOINS
// de pages qu'avant (contenu supprime, texte redevenu plus court, etc.). Les
// pages devenues orphelines (au-dela du nouveau resultat, non verrouillees)
// sont donc explicitement supprimees plutot que laissees en base — sinon un
// "Recomposer" laisserait trainer d'anciennes pages jamais nettoyees.
async function replaceBookPages(bookId, pages = []) {
  const existing = await listPages(bookId);
  const lockedIndexes = new Set(existing.filter((page) => page.locked).map((page) => page.page_index));
  const newIndexes = new Set(pages.map((page) => page.page_index));

  const rows = pages
    .filter((page) => !lockedIndexes.has(page.page_index))
    .map((page) => ({
      book_id: bookId,
      page_index: page.page_index,
      layout_id: page.layout_id,
      content: page.content || {}
    }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from('book_pages')
      .upsert(rows, { onConflict: 'book_id,page_index' });

    if (error) throw error;
  }

  const staleIndexes = existing
    .filter((page) => !page.locked && !newIndexes.has(page.page_index))
    .map((page) => page.page_index);

  if (staleIndexes.length > 0) {
    const { error: deleteError } = await supabase
      .from('book_pages')
      .delete()
      .eq('book_id', bookId)
      .in('page_index', staleIndexes);

    if (deleteError) throw deleteError;
  }

  return listPages(bookId);
}

// Ajoute `count` pages VIDES a la fin du livre, sans toucher aux pages
// existantes (verrouillees ou non) — geste explicite de l'utilisateur (voir
// routes/composition.js: POST /pages/extend, bouton "+2" du filmstrip
// atelier), distinct de la recomposition automatique : celle-ci ne pad
// jamais artificiellement (voir layoutEngine.compose), mais un utilisateur
// qui choisit consciemment d'agrandir son livre n'est pas dans ce cas —
// meme distinction que le principe deja documente ailleurs dans ce fichier.
async function appendEmptyPages(bookId, count) {
  const existing = await listPages(bookId);
  const startIndex = existing.length;
  const newRows = Array.from({ length: count }, (_, offset) => ({
    book_id: bookId,
    page_index: startIndex + offset,
    layout_id: null,
    content: {}
  }));

  const { error } = await supabase.from('book_pages').insert(newRows);
  if (error) throw error;

  return listPages(bookId);
}

// Une page est consideree VIDE si aucun emplacement n'est rempli — meme
// critere exact que le filmstrip de l'atelier (BookAtelierLuxe.js
// finishStats : `content.itemIds.filter(Boolean)`), volontairement, pour que
// la vignette grise que l'utilisateur voit et la page que le serveur accepte
// de supprimer soient toujours la meme chose. Le `filter(Boolean)` n'est pas
// cosmetique : un itemId orphelin (photo supprimee depuis) laisse un trou
// dans le tableau, et compter la longueur brute ferait passer une page
// reellement vide pour remplie.
function isPageEmpty(page) {
  const itemIds = page?.content?.itemIds;
  if (!Array.isArray(itemIds)) return true;
  return itemIds.filter(Boolean).length === 0;
}

// Inspecte les `count` dernieres pages sans rien supprimer : dit a l'appelant
// ce qui serait perdu. Separe de la suppression elle-meme pour que la route
// puisse refuser AVANT d'ecrire quoi que ce soit.
async function inspectTrailingPages(bookId, count) {
  const existing = await listPages(bookId);
  const doomed = count > 0 ? existing.slice(-count) : [];
  return {
    totalPages: existing.length,
    doomed,
    nonEmpty: doomed.filter((page) => !isPageEmpty(page)),
    locked: doomed.filter((page) => page?.locked === true)
  };
}

// Retire les `count` DERNIERES pages du livre. Contrepartie exacte de
// appendEmptyPages ci-dessus (bouton "-2" du filmstrip atelier, voir
// routes/composition.js: POST /pages/shrink).
//
// Toujours par la FIN, jamais au milieu : supprimer une page intermediaire
// obligerait a reindexer tout ce qui suit, ce qui deplacerait silencieusement
// des pages verrouillees et decalerait les numeros de page deja composes dans
// le contenu. La contrainte de parite (pages retirees 2 par 2) vient du
// catalogue imprimeur, comme pour l'ajout.
//
// Ne decide RIEN sur la perte de contenu : c'est la route qui verifie que les
// pages visees sont vides et non verrouillees, ou que l'utilisateur a
// explicitement confirme. Ici, on execute.
async function removeTrailingPages(bookId, count) {
  const { doomed } = await inspectTrailingPages(bookId, count);
  if (doomed.length === 0) return listPages(bookId);

  const { error } = await supabase
    .from('book_pages')
    .delete()
    .eq('book_id', bookId)
    .in('page_index', doomed.map((page) => page.page_index));

  if (error) throw error;

  return listPages(bookId);
}

// Deplace la page `fromIndex` a la position `toIndex`, en decalant celles qui
// se trouvent entre les deux. Ce n'est PAS une permutation : echanger deux
// pages distantes melangerait l'ordre de lecture du livre, alors qu'on veut
// "prendre cette page et la poser la" (retour utilisateur 2026-09-13).
//
// Les pages sans ligne en base (jamais remplies) n'ont rien a deplacer : leur
// absence se comporte exactement comme une page vide qui se decale, le calcul
// reste donc juste sans avoir a les materialiser.
//
// DEUX PASSES, indispensables : `book_pages` porte un index UNIQUE sur
// (book_id, page_index), verifie ligne par ligne et non en fin d'instruction.
// Ecrire directement les index finaux ferait donc collision avec une page pas
// encore deplacee. On gare d'abord les lignes concernees tres au-dela du livre
// (PARK_OFFSET), puis on pose les index definitifs — les emplacements vises
// sont alors tous libres.
const PARK_OFFSET = 100000;

async function movePage(bookId, fromIndex, toIndex) {
  if (fromIndex === toIndex) return listPages(bookId);

  const existing = await listPages(bookId);

  // Application bijective de l'ancien index vers le nouveau : c'est cette
  // propriete qui garantit qu'aucune page non deplacee n'occupe une place
  // visee par une page deplacee (voir la 2e passe).
  const nextIndexFor = (index) => {
    if (index === fromIndex) return toIndex;
    if (fromIndex < toIndex) return index > fromIndex && index <= toIndex ? index - 1 : index;
    return index >= toIndex && index < fromIndex ? index + 1 : index;
  };

  const moved = existing
    .map((page) => ({ id: page.id, to: nextIndexFor(page.page_index), from: page.page_index }))
    .filter((row) => row.from !== row.to);

  if (moved.length === 0) return listPages(bookId);

  // `book_id` est repasse a chaque ligne : supabase envoie un INSERT ... ON
  // CONFLICT, et la ligne candidate doit satisfaire les colonnes NOT NULL
  // meme quand le conflit garantit qu'on fera un UPDATE.
  const write = async (rows) => {
    const { error } = await supabase
      .from('book_pages')
      .upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  };

  await write(moved.map((row) => ({ id: row.id, book_id: bookId, page_index: PARK_OFFSET + row.to })));
  await write(moved.map((row) => ({ id: row.id, book_id: bookId, page_index: row.to })));

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
  deleteContentItemsByKind,
  listPages,
  replaceBookPages,
  appendEmptyPages,
  inspectTrailingPages,
  removeTrailingPages,
  isPageEmpty,
  movePage,
  upsertPage
};
