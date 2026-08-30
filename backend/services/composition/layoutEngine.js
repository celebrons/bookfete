// backend/services/composition/layoutEngine.js
//
// Coeur du moteur de mise en page sans IA (voir l'artefact "Celebrons sans
// IA", section 06). Une fonction pure : compose(input) -> { pages, overflow }.
// Aucun appel reseau, aucun appel modele : memes entrees => meme sortie, a
// chaque execution. C'est ce qui la rend testable comme n'importe quelle
// fonction, et ce qui rend "regenerer" reproductible (voir buildSeed/variant).
//
// Etapes (fidele au sequencement de l'artefact) :
//   1. Normalisation   -> poids en "equivalent-slots" de chaque item
//   2. Budget de pages -> pages utiles = pageCount - pages fixes
//   3. Regroupement    -> blocs homogenes (ex. contribution = photos+texte
//                         d'un meme contributeur), tries de facon stable
//   4. Choix du layout -> par bloc, le layout dont le nombre de cases
//                         correspond le mieux, parmi les layouts autorises
//                         par le template
//   5. Garde-fous       -> pas de page vide, pas de bloc coupe entre deux pages
//   6. Ecriture          -> pages[] pret a etre persiste (book_pages)

const DEFAULT_SLOTS_PER_PAGE = 3;
const DEFAULT_FIXED_PAGES = 2; // garde + page de titre (la couverture est un document a part)
const TEXT_CHARS_PER_SLOT = 400;
// Paliers retenus (§ decisions de l'artefact), memes valeurs que le seed de
// backend/sql/phase03_data_model.sql (book_products.page_count).
const PAGE_COUNT_TIERS = [24, 32, 40, 48, 60];

function clampInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// --- 1. Normalisation ------------------------------------------------------

function weightOfItem(item) {
  if (item.kind === 'photo') return 1;
  const length = String(item.text || '').length;
  return Math.max(1, Math.ceil(length / TEXT_CHARS_PER_SLOT));
}

// --- 3. Regroupement --------------------------------------------------------

// Rassemble les items en blocs homogenes : les items d'une meme contribution
// (contribution_id commun) forment un seul bloc "contribution" (photo(s) +
// message) ; les items sans contribution restent des blocs a un seul item.
// Le tri est stable : display_order puis id, pour un resultat reproductible.
function groupIntoBlocks(items) {
  const byContribution = new Map();
  const standaloneBlocks = [];

  for (const item of items) {
    if (item.contribution_id) {
      const key = `contribution:${item.contribution_id}`;
      if (!byContribution.has(key)) {
        byContribution.set(key, { key, kind: 'contribution', itemIds: [], weight: 0, order: item.display_order ?? 0 });
      }
      const block = byContribution.get(key);
      block.itemIds.push(item.id);
      block.weight += weightOfItem(item);
      block.order = Math.min(block.order, item.display_order ?? 0);
    } else {
      standaloneBlocks.push({
        key: `item:${item.id}`,
        kind: item.kind,
        itemIds: [item.id],
        weight: weightOfItem(item),
        order: item.display_order ?? 0
      });
    }
  }

  const blocks = [...byContribution.values(), ...standaloneBlocks];
  blocks.sort((a, b) => (a.order - b.order) || String(a.key).localeCompare(String(b.key)));
  return blocks;
}

// --- Mode Automatique : recommandation de palier a partir du contenu reel --
// Meme fonction utilisee dans les deux modes (§06 de l'artefact) : en
// Automatique elle propose le palier par defaut, en Manuel elle sert juste a
// avertir si le palier choisi est trop juste ou trop large pour le contenu.

// Estime le nombre de pages necessaires pour un contenu donne, a la densite
// d'un template (ou la densite par defaut si aucun template n'est encore
// choisi). Ne construit pas les pages elles-memes (voir compose()) : c'est
// une simple division poids-total / slots-par-page, arrondie au palier
// superieur le plus proche.
function estimatePageCount(items, { fixedPages, slotsPerPage } = {}) {
  const blocks = groupIntoBlocks(items);
  const totalWeight = blocks.reduce((sum, block) => sum + block.weight, 0);
  const resolvedSlotsPerPage = clampInt(slotsPerPage, DEFAULT_SLOTS_PER_PAGE);
  const resolvedFixedPages = clampInt(fixedPages, DEFAULT_FIXED_PAGES);
  const contentPages = totalWeight === 0 ? 0 : Math.ceil(totalWeight / resolvedSlotsPerPage);
  return resolvedFixedPages + contentPages;
}

/**
 * @param {object} input
 * @param {Array} input.items - book_content_items du livre
 * @param {object} [input.template] - book_templates row (pour la densite ; optionnel)
 * @param {number} [input.fixedPages]
 * @returns {{ recommended: number, estimatedPages: number, tiers: Array<{pageCount:number, fits:boolean}> }}
 */
function recommendPageCount(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const slotsPerPage = input.template?.design_tokens?.slotsPerPage;
  const estimatedPages = estimatePageCount(items, { fixedPages: input.fixedPages, slotsPerPage });

  const recommended = PAGE_COUNT_TIERS.find((tier) => tier >= estimatedPages) || PAGE_COUNT_TIERS[PAGE_COUNT_TIERS.length - 1];
  const tiers = PAGE_COUNT_TIERS.map((pageCount) => ({ pageCount, fits: pageCount >= estimatedPages }));

  return { recommended, estimatedPages, tiers };
}

// --- 4. Choix du layout : PRNG deterministe pour departager les candidats --
// equivalents (meme kind, meme gabarit de cases). Ne change jamais le
// contenu : seule la presentation alterne, de facon reproductible.

function hashSeed(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seedInt) {
  let state = seedInt;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDeterministic(candidates, seed) {
  if (candidates.length <= 1) return candidates[0];
  const rand = mulberry32(hashSeed(seed));
  const index = Math.floor(rand() * candidates.length);
  return candidates[Math.min(index, candidates.length - 1)];
}

function chooseLayout(block, layouts, allowedSlugs, seed) {
  const itemCount = block.itemIds.length;
  const pool = allowedSlugs && allowedSlugs.length > 0
    ? layouts.filter((layout) => allowedSlugs.includes(layout.slug))
    : layouts;

  const byKindAndCount = pool.filter(
    (layout) => layout.kind === block.kind && itemCount >= layout.min_items && itemCount <= layout.max_items
  );
  if (byKindAndCount.length > 0) {
    return pickDeterministic(byKindAndCount, seed).id;
  }

  const byKind = pool.filter((layout) => layout.kind === block.kind);
  if (byKind.length > 0) {
    return pickDeterministic(byKind, seed).id;
  }

  const mixte = pool.filter((layout) => layout.kind === 'mixte');
  if (mixte.length > 0) {
    return pickDeterministic(mixte, seed).id;
  }

  return pool.length > 0 ? pickDeterministic(pool, seed).id : null;
}

// --- 2 + 5 + 6. Budget, empaquetage, garde-fous, ecriture -------------------

// Empaquette les blocs (deja tries) sur des pages, sans jamais couper un
// bloc en deux ni produire de page vide : un bloc trop lourd pour le budget
// d'une page occupe simplement sa propre page.
function packBlocksIntoPages(blocks, slotsPerPage) {
  const pageGroups = [];
  let current = [];
  let currentWeight = 0;

  for (const block of blocks) {
    const wouldOverflow = current.length > 0 && currentWeight + block.weight > slotsPerPage;
    if (wouldOverflow) {
      pageGroups.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(block);
    currentWeight += block.weight;
  }
  if (current.length > 0) pageGroups.push(current);

  return pageGroups;
}

function kindOfPage(blocksOnPage) {
  const kinds = new Set(blocksOnPage.map((block) => block.kind));
  if (kinds.size === 1) return [...kinds][0];
  return 'mixte';
}

/**
 * @param {object} input
 * @param {Array} input.items - book_content_items du livre (kind, text, url, contribution_id, display_order, id)
 * @param {object} input.template - book_templates row (allowed_layouts, design_tokens)
 * @param {Array} input.layouts - layout_definitions actifs
 * @param {number} input.pageCount - nombre de pages demande pour le livre (couverture non comprise)
 * @param {number} [input.variant] - graine de regeneration (0 par defaut)
 * @param {number} [input.fixedPages] - pages fixes non composees (garde/titre)
 * @returns {{ pages: Array<{page_index:number, layout_id:string|null, content:object}>, overflow: boolean }}
 */
function compose(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const allowedSlugs = Array.isArray(input.template?.allowed_layouts) ? input.template.allowed_layouts : [];
  const slotsPerPage = clampInt(input.template?.design_tokens?.slotsPerPage, DEFAULT_SLOTS_PER_PAGE);
  const fixedPages = clampInt(input.fixedPages, DEFAULT_FIXED_PAGES);
  const variant = Number.isInteger(input.variant) ? input.variant : 0;
  const seedBase = `${input.template?.id || 'no-template'}:${variant}`;

  const pagesAvailable = Math.max(0, clampInt(input.pageCount, 0) - fixedPages);
  const budgetSlots = pagesAvailable * slotsPerPage;

  const blocks = groupIntoBlocks(items);
  const totalWeight = blocks.reduce((sum, block) => sum + block.weight, 0);
  const overflow = budgetSlots > 0 && totalWeight > budgetSlots;

  const pageGroups = packBlocksIntoPages(blocks, slotsPerPage);

  const pages = pageGroups.map((blocksOnPage, pageIndex) => {
    const pageKind = kindOfPage(blocksOnPage);
    const layoutSeed = `${seedBase}:${pageIndex}`;
    // Une page melangeant plusieurs blocs heterogenes n'a en general qu'un
    // seul bloc dominant a placer via un layout "mixte" ; sinon, chaque bloc
    // garde son propre layout dans le contenu de la page.
    const blockPlacements = blocksOnPage.map((block) => ({
      itemIds: block.itemIds,
      kind: block.kind,
      layoutId: chooseLayout(block, layouts, allowedSlugs, `${layoutSeed}:${block.key}`)
    }));

    return {
      page_index: pageIndex,
      layout_id: blockPlacements.length === 1 ? blockPlacements[0].layoutId : null,
      content: {
        kind: pageKind,
        itemIds: blocksOnPage.flatMap((block) => block.itemIds),
        blocks: blockPlacements
      }
    };
  });

  return { pages, overflow, pageBudget: pagesAvailable, totalWeight };
}

module.exports = {
  compose,
  weightOfItem,
  groupIntoBlocks,
  recommendPageCount,
  DEFAULT_SLOTS_PER_PAGE,
  DEFAULT_FIXED_PAGES,
  PAGE_COUNT_TIERS
};
