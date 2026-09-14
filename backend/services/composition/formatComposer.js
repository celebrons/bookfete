// backend/services/composition/formatComposer.js
//
// Compose un livre pour UN format d'impression donne, en respectant une
// regle absolue : une page verrouillee (locked = true, construite a la main
// dans l'atelier) garde TOUJOURS exactement son contenu et son layout, quel
// que soit le format (decision utilisateur explicite) — seules ses marges/
// taille de photo/typographie s'adaptent (voir pageRenderer.js). Seul le
// contenu non verrouille est reellement recompose, avec un choix de layout
// biaise par formatDensity.js (mood 'format-livret'/'format-luxe').
//
// Fonction pure : aucun acces reseau/disque, aucune ecriture en base (voir
// bookContentService.replaceBookPages pour la persistance, appelee par le
// routeur avec le resultat de composeBookForFormat).

const { buildUnitsFromItems, buildPages } = require('./layoutEngine');
const { detectContentProfile } = require('./contentProfile');
const { resolveFormatDensity } = require('./formatDensity');

// Pages de separation de chapitre (Luxe uniquement) : rares et sobres —
// purement decoratives, ne consomment jamais une unite de contenu (voir
// pageRenderer.renderChapterSeparatorPage pour le rendu). Registre de
// titres volontairement chaleureux/simple, meme esprit que coverCopy.js.
const CHAPTER_SEPARATOR_TITLES = ['NOS SOUVENIRS', 'CE QUI COMPTE', 'DES MOMENTS PRÉCIEUX', 'ENSEMBLE', 'POUR TOUJOURS'];
const CHAPTER_SEPARATOR_INTERVAL = 8; // une page de separation tous les ~8 pages composees
const CHAPTER_SEPARATOR_MIN_PAGES = 10; // jamais sur un petit livre (rien en dessous de ce volume)
const CHAPTER_SEPARATOR_MAX_COUNT = 4; // jamais plus de 4, meme sur un tres long livre

// Insere des pages de separation dans le contenu FRAICHEMENT COMPOSE (jamais
// dans les pages verrouillees, qui ne passent pas par ici) — jamais avant la
// toute premiere page (un livre commence par du contenu, pas un separateur).
// Etendue reelle d'une liste de pages : le plus grand index + 1. Duplique
// volontairement plutot qu'importe de bookContentService (qui, lui, parle a
// la base) : ce module doit rester une fonction pure.
function pageExtent(pages = []) {
  return pages.reduce((max, page) => Math.max(max, (Number(page.page_index) || 0) + 1), 0);
}

function withChapterSeparators(composedPages, formatId) {
  if (formatId !== 'luxe' || composedPages.length < CHAPTER_SEPARATOR_MIN_PAGES) return composedPages;

  const result = [];
  let separatorCount = 0;
  composedPages.forEach((page, index) => {
    if (index > 0 && index % CHAPTER_SEPARATOR_INTERVAL === 0 && separatorCount < CHAPTER_SEPARATOR_MAX_COUNT) {
      const number = String(separatorCount + 1).padStart(2, '0');
      const title = CHAPTER_SEPARATOR_TITLES[separatorCount % CHAPTER_SEPARATOR_TITLES.length];
      result.push({ layout_id: null, content: { kind: 'chapter-separator', number, title } });
      separatorCount += 1;
    }
    result.push(page);
  });
  return result;
}

/**
 * @param {object} input
 * @param {Array} input.items - book_content_items du livre (TOUS, verrouilles ou non)
 * @param {Array} input.existingPages - book_pages actuelles (pour identifier les pages verrouillees)
 * @param {object} [input.template] - book_templates row (allowed_layouts, id)
 * @param {Array} input.layouts - layout_definitions actifs
 * @param {string} input.formatId - 'livret' | 'standard' | 'luxe'
 * @returns {{ pages: Array<{page_index:number, layout_id:string|null, content:object, locked?:boolean}>, pageCount: number }}
 */
function composeBookForFormat(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const existingPages = Array.isArray(input.existingPages) ? input.existingPages : [];
  const template = input.template || null;
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const { mood } = resolveFormatDensity(input.formatId);

  const lockedPages = existingPages.filter((page) => page.locked);
  const lockedIndexSet = new Set(lockedPages.map((page) => page.page_index));

  // Le contenu deja fixe par une page verrouillee ne doit jamais etre
  // redistribue ailleurs par la recomposition du reste (sinon duplication) :
  // exclu du pool AVANT de reconstruire les unites. Un angle mort deja
  // present dans layoutEngine.compose()/POST /compose aujourd'hui (non
  // touche ici, hors scope de cette passe) — corrige seulement pour ce
  // nouveau chemin, plus exigeant puisqu'il tourne a chaque changement de
  // format plutot qu'a la demande.
  const lockedItemIds = new Set(lockedPages.flatMap((page) => page.content?.itemIds || []));

  // MODE MANUEL : CHANGER DE FORMAT NE TOUCHE PAS AU LIVRE.
  //
  // Des qu'un livre contient une seule page composee a la main, c'est
  // l'utilisateur qui decide de ce qu'il contient — pas le moteur. Choisir un
  // format change alors le PAPIER, jamais le contenu : aucune page ajoutee,
  // aucune page retiree, aucun contenu deplace.
  //
  // Histoire de ce garde-fou, en deux temps (2026-09-14) :
  //
  //   1. A l'origine, cette fonction reprenait TOUT ce qui n'etait pas sur une
  //      page verrouillee — y compris les souvenirs jamais places, restes dans
  //      la bibliotheque. Sur « Voyage a Montreal » (30 pages faites a la
  //      main, 10 souvenirs jamais utilises), choisir un format ajoutait 4
  //      pages en Livret/Standard et 6 en Luxe.
  //   2. Premiere correction, trop timide : ne rejouer que le contenu deja
  //      pose sur les pages automatiques existantes. Mais les pages fautives
  //      etaient DEJA la, et leur contenu comptait donc comme "deja pose" :
  //      elles se regeneraient indefiniment. Retour utilisateur : « elles
  //      reapparaissent malgre la suppression ».
  //
  // D'ou la regle actuelle, sans exception : « en mode manuel, il ne faut
  // JAMAIS ajouter du contenu non voulu ».
  //
  // NON DESTRUCTIF, deliberement : les pages automatiques deja presentes sont
  // rendues telles quelles, jamais supprimees. Un livre genere
  // automatiquement puis retouche a la main (donc porteur de pages
  // verrouillees) ne perd pas ses pages generees en changeant de format —
  // ce serait le defaut symetrique, et bien pire. Pour retirer des pages, il
  // y a l'atelier ("-2") et scripts/pages-ajoutees-par-le-format.js.
  const hasManualPages = lockedPages.length > 0;
  if (hasManualPages) {
    const pagesInchangees = [...existingPages]
      .sort((a, b) => a.page_index - b.page_index)
      .map((page) => ({
        page_index: page.page_index,
        layout_id: page.layout_id,
        content: page.content || {},
        locked: page.locked === true
      }));
    return { pages: pagesInchangees, pageCount: pageExtent(pagesInchangees) };
  }

  const remainingItems = items.filter((item) => !lockedItemIds.has(item.id));

  const units = buildUnitsFromItems(remainingItems);
  const { profile } = detectContentProfile(remainingItems);
  const allowedSlugs = Array.isArray(template?.allowed_layouts) ? template.allowed_layouts : [];
  const seedBase = `${template?.id || 'no-template'}:format:${input.formatId || 'standard'}`;
  const { pages: rawComposedPages } = units.length > 0
    ? buildPages({ units, layouts, allowedSlugs, profile, seedBase, mood, formatId: input.formatId })
    : { pages: [] };
  const composedPages = withChapterSeparators(rawComposedPages, input.formatId);

  // Reassemblage : les index verrouilles restent fixes a leur place
  // d'origine, le reste des index (0..N-1) est rempli dans l'ordre par les
  // pages fraichement composees. Si un index verrouille depasse ce que le
  // contenu non verrouille suffirait a remplir (ex. beaucoup de pages
  // verrouillees en fin de livre), le total s'etend pour ne jamais tronquer
  // une page verrouillee.
  const maxLockedIndex = lockedPages.reduce((max, page) => Math.max(max, page.page_index), -1);
  const total = Math.max(maxLockedIndex + 1, lockedPages.length + composedPages.length);

  const pages = [];
  let composedCursor = 0;
  for (let index = 0; index < total; index += 1) {
    if (lockedIndexSet.has(index)) {
      const lockedPage = lockedPages.find((page) => page.page_index === index);
      pages.push({ page_index: index, layout_id: lockedPage.layout_id, content: lockedPage.content, locked: true });
    } else if (composedCursor < composedPages.length) {
      pages.push({ ...composedPages[composedCursor], page_index: index });
      composedCursor += 1;
    } else {
      // Repli : plus de contenu compose disponible pour cet index (ex. une
      // page verrouillee tres en avance par rapport au volume de contenu
      // restant) -> page vide plutot qu'un trou dans la numerotation, meme
      // convention qu'une page jamais construite ailleurs dans ce module
      // (voir routes/composition.js: GET /pages/:pageIndex/preview.html).
      pages.push({ page_index: index, layout_id: null, content: {} });
    }
  }
  // Filet de securite : ne devrait jamais servir vu le calcul de `total`
  // ci-dessus, mais garantit qu'aucune page composee n'est perdue si les
  // deux comptes divergent malgre tout.
  while (composedCursor < composedPages.length) {
    pages.push({ ...composedPages[composedCursor], page_index: pages.length });
    composedCursor += 1;
  }

  return { pages, pageCount: pages.length };
}

module.exports = {
  composeBookForFormat,
  withChapterSeparators,
  CHAPTER_SEPARATOR_TITLES,
  CHAPTER_SEPARATOR_INTERVAL,
  CHAPTER_SEPARATOR_MIN_PAGES,
  CHAPTER_SEPARATOR_MAX_COUNT
};
