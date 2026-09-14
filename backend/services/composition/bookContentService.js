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

// Supprime les souvenirs ECRITS DANS UNE PAGE puis abandonnes.
//
// Regle produit (2026-09-14) : « il ne faut jamais garder des souvenirs
// ecrits dans une page puis abandonnes ; l'onglet Souvenirs sert surtout a
// recuperer les souvenirs des contributeurs ». Un texte tape directement dans
// un emplacement n'existe que pour cet emplacement : s'il en sort — retire,
// changement de mise en page, page videe — il disparait avec lui.
//
// QUATRE conditions cumulees, volontairement etroites. Chacune protege une
// categorie de contenu qu'il serait grave de perdre :
//   1. kind 'texte'          — une PHOTO n'est jamais supprimee : c'est un
//                              fichier que l'utilisateur a choisi et envoye.
//   2. source 'upload'       — jamais une contribution : la bibliotheque
//                              existe d'abord pour les recueillir.
//   3. metadata.origin 'page' — jamais un souvenir ajoute a la main via le
//                              bouton "Ajouter" (origin 'library'), ni un
//                              souvenir anterieur a cette regle (champ
//                              absent = 'library' par defaut, voir
//                              routes/composition.js sanitizeItemOrigin).
//   4. reference par AUCUNE page — tant qu'il est pose quelque part, il fait
//                              partie du livre et ne bouge pas.
//
// Appelee APRES chaque ecriture de page, jamais avant : c'est l'etat final
// des pages qui decide. Jamais bloquante — un echec de nettoyage ne doit pas
// faire echouer la sauvegarde d'une page.
async function purgeAbandonedPageTexts(bookId) {
  try {
    const [pages, items] = await Promise.all([listPages(bookId), listContentItems(bookId)]);

    // Tout ce qui est reference par une page, quelle qu'elle soit : itemIds
    // de la page ET itemIds de chaque bloc (les deux existent selon le chemin
    // d'ecriture, et l'un peut etre a jour sans l'autre).
    const utilises = new Set();
    pages.forEach((page) => {
      (page.content?.itemIds || []).filter(Boolean).forEach((id) => utilises.add(id));
      (page.content?.blocks || []).forEach((block) => {
        (block?.itemIds || []).filter(Boolean).forEach((id) => utilises.add(id));
      });
    });

    const abandonnes = items.filter((item) => (
      item.kind === 'texte'
      && item.source === 'upload'
      && item.metadata?.origin === 'page'
      && !utilises.has(item.id)
    ));
    if (abandonnes.length === 0) return [];

    const { error } = await supabase
      .from('book_content_items')
      .delete()
      .eq('book_id', bookId)
      .in('id', abandonnes.map((item) => item.id));
    if (error) throw error;

    return abandonnes;
  } catch (_error) {
    return [];
  }
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
async function appendEmptyPages(bookId, count, declaredPageCount = 0) {
  const existing = await listPages(bookId);
  // A LA FIN DU LIVRE, pas apres la derniere LIGNE : le nombre de lignes
  // compte les pages SAUVEGARDEES, or une page restee vierge n'a pas de ligne
  // du tout. Sur un livre de 30 pages dont 5 sont remplies, partir de 5 aurait
  // insere des pages 5 et 6 — au MILIEU du livre — au lieu de 30 et 31
  // (2026-09-14, meme famille d'erreur que l'ecart page_count / pages reelles).
  const startIndex = pageExtent(existing, declaredPageCount);
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
//
// Raisonne en NUMEROS DE PAGE, pas en lignes de la table : les pages restees
// vierges n'ont pas de ligne, donc prendre "les `count` dernieres lignes"
// visait des pages du milieu du livre. Sur un livre de 30 pages dont seules
// les 5 premieres sont composees, retirer 2 pages doit viser les pages 29 et
// 30 (vides, rien a perdre) et non les pages 4 et 5 (pleines).
async function inspectTrailingPages(bookId, count, declaredPageCount = 0) {
  const existing = await listPages(bookId);
  const totalPages = pageExtent(existing, declaredPageCount);
  const firstDoomed = Math.max(0, totalPages - Math.max(0, count));
  const byIndex = new Map(existing.map((page) => [page.page_index, page]));

  const doomed = count > 0
    ? Array.from({ length: totalPages - firstDoomed }, (_, offset) => {
      const index = firstDoomed + offset;
      return byIndex.get(index) || { page_index: index, layout_id: null, content: {}, locked: false };
    })
    : [];

  return {
    totalPages,
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
async function removeTrailingPages(bookId, count, declaredPageCount = 0) {
  const { doomed } = await inspectTrailingPages(bookId, count, declaredPageCount);
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

// Liste DENSE des pages interieures, pour tout ce qui rend le LIVRE ENTIER
// (apercu final, PDF client, fichier d'impression).
//
// `listPages` ne renvoie que les pages ayant une ligne en base : une page
// vide n'en a pas. Rendre cette liste telle quelle FAIT DISPARAITRE les pages
// vides du document — un livre de 30 pages dont 24 sont remplies produisait un
// PDF de 24 pages (constate le 2026-09-14 sur un livre reel : 30 annoncees,
// 24 rendues). Consequences : le client recoit moins de pages qu'il n'en
// paie, et le nombre de pages envoye a l'imprimeur ne correspond plus a la
// commande.
//
// Une page absente est ici materialisee en page VIDE : c'est exactement ce
// qu'elle est dans le livre imprime — une belle page blanche, pas un trou.
async function listPagesForRender(bookId, pageCount) {
  const pages = await listPages(bookId);
  const total = pageExtent(pages, pageCount);
  const byIndex = new Map(pages.map((page) => [page.page_index, page]));

  return Array.from({ length: total }, (_, index) => (
    byIndex.get(index) || { page_index: index, layout_id: null, content: {}, locked: false }
  ));
}

// --- Nombre de pages : une seule autorite ---------------------------------
//
// `books.page_count` et les lignes de `book_pages` DOIVENT toujours decrire le
// meme livre. Les laisser diverger coute de l'argent en silence : le PRIX se
// calcule sur page_count (routes/orders.js) tandis que le FICHIER envoye a
// l'imprimeur se construit sur les pages reelles (gelatoOrderService).
// Constate sur un livre reel le 2026-09-14 : 30 pages facturees, 40 imprimees.
//
// Trois regles, appliquees ICI et nulle part ailleurs, pour qu'aucun chemin
// d'ecriture ne puisse les contourner :
//   1. PLANCHER de MIN_BOOK_PAGES (30). C'est un choix PRODUIT : l'imprimeur
//      accepte des 28 pages (voir gelatoCatalog: minPages). Le forcer evite
//      qu'un livre se retrouve non commandable sans que rien ne l'ait dit.
//   2. PARITE : l'imprimeur n'accepte que des nombres pairs (pageStep 2).
//   3. Le compte couvre TOUTE page existante : jamais de contenu au-dela du
//      nombre annonce.
const MIN_BOOK_PAGES = 30;
const MAX_BOOK_PAGES = 200;

function normalizePageCount(value) {
  const n = Math.ceil(Number(value) || 0);
  const floored = Math.max(MIN_BOOK_PAGES, n);
  const even = floored % 2 === 0 ? floored : floored + 1;
  return Math.min(MAX_BOOK_PAGES, even);
}

// Etendue REELLE du livre : le plus grand des deux, ce qu'il annonce et ce
// qu'il contient. Sans plancher ni parite, volontairement — c'est la mesure
// honnete, celle qu'on rend et qu'on facture. Y appliquer le plancher produit
// ferait imprimer 30 pages a un vieux livre qui en annonce 20 : plus de pages
// imprimees que payees, exactement l'ecart qu'on cherche a supprimer.
function pageExtent(pages = [], declared = 0) {
  const maxIndex = pages.reduce((max, page) => Math.max(max, Number(page.page_index) || 0), -1);
  return Math.max(Number(declared) || 0, maxIndex + 1);
}

// Nombre de pages que le livre DOIT annoncer, compte tenu de ce qu'il contient
// reellement. `desired` permet a un appelant de demander davantage (ex. le
// resultat d'une composition) — jamais moins que ce qui existe deja. C'est ici,
// et seulement ici, que s'ajoutent le plancher produit et la parite.
function requiredPageCount(pages = [], desired = 0) {
  return normalizePageCount(pageExtent(pages, desired));
}

// Aligne `books.page_count` sur la realite. Retourne le compte retenu.
// Idempotente : n'ecrit que si la valeur change.
async function syncPageCount(bookId, desired = 0) {
  const pages = await listPages(bookId);
  const pageCount = requiredPageCount(pages, desired);

  const { data: book, error: readError } = await supabase
    .from('books')
    .select('page_count')
    .eq('id', bookId)
    .single();
  if (readError) throw readError;

  if (book.page_count !== pageCount) {
    const { error } = await supabase
      .from('books')
      .update({ page_count: pageCount, updated_at: new Date().toISOString() })
      .eq('id', bookId);
    if (error) throw error;
  }

  return pageCount;
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
  listPagesForRender,
  purgeAbandonedPageTexts,
  movePage,
  upsertPage,
  MIN_BOOK_PAGES,
  MAX_BOOK_PAGES,
  normalizePageCount,
  pageExtent,
  requiredPageCount,
  syncPageCount
};
