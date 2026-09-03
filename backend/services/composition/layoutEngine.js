// backend/services/composition/layoutEngine.js
//
// Coeur du moteur de mise en page sans IA — v2 (voir le plan "Moteur de mise
// en page v2" : contenu -> volume -> profil -> templates compatibles ->
// scoring -> pages -> PDF). Une fonction pure : compose(input) -> { pages,
// overflow }. Aucun appel reseau, aucun appel modele : memes entrees =>
// meme sortie, a chaque execution.
//
// Contrairement au v1 (empaquetage par poids puis choix de presentation
// apres coup), le regroupement en pages et le choix du layout sont ICI la
// meme decision : pour le contenu restant (une fenetre ordonnee, jamais
// reordonnee), on filtre les layouts structurellement compatibles
// (layoutCapacity.js), on les note (layoutScoring.js) et on prend le
// meilleur — le contenu determine les layouts compatibles, jamais l'inverse.
//
// Etapes :
//   1. Unites       -> chaque item devient une unite atomique (bloc de
//                      contribution, photo, texte — avec decoupage prealable
//                      des textes trop longs, voir textLength.js)
//   2. Profil        -> PHOTO / TEXTE / EQUILIBRE (contentProfile.js), sert
//                      uniquement a orienter le scoring
//   3. Boucle        -> pour la fenetre de tete : candidats compatibles ->
//                      scoring -> meilleur (egalites departagees par PRNG
//                      seede, reproductible via `variant`) -> consommation
//   4. Garde-fous    -> jamais de page videe de force, jamais de contenu
//                      perdu (voir GUARANTEED_FALLBACK_SLUGS)
//   5. Ecriture      -> pages[] pret a etre persiste (book_pages)

const { detectContentProfile, weightOfItem } = require('./contentProfile');
const { classifyTextLength, splitTextSafely, TEXT_HARD_SPLIT_THRESHOLD } = require('./textLength');
const { resolveCandidates, consumedCount, MAX_LOOKAHEAD_UNITS } = require('./layoutCapacity');
const {
  scoreLayoutCandidate,
  createRhythmState,
  updateRhythmState,
  createFamilyCounts,
  updateFamilyCounts
} = require('./layoutScoring');

const DEFAULT_FIXED_PAGES = 2; // garde + page de titre (la couverture est un document a part)
// Paliers retenus (cahier des charges v2) : 16 / 24 / 32 / 48 / 64 pages.
const PAGE_COUNT_TIERS = [16, 24, 32, 48, 64];

// Layouts qui doivent TOUJOURS exister, etre actifs, et rester utilisables
// meme si la liste blanche du style choisi (allowed_layouts) ne les contient
// pas ou est mal configuree : garantit qu'un contenu valide trouve toujours
// une place (voir plan §6). Slugs alignes sur la migration SQL v2.
const GUARANTEED_FALLBACK_SLUGS = ['FULL_PHOTO', 'TWO_PHOTOS', 'ONE_TESTIMONY', 'PHOTO_TEXT', 'contribution-standard'];

function clampInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// --- 1. Regroupement en blocs atomiques -------------------------------------

// Rassemble les items en blocs homogenes : les items d'une meme contribution
// (contribution_id commun) forment un seul bloc "contribution" (photo(s) +
// message), toujours atomique ; les items sans contribution restent des
// blocs a un seul item. Tri stable : display_order puis id, pour un resultat
// reproductible.
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

// --- 1bis. Unites du moteur : blocs enrichis (longueur/orientation) + ------
// decoupage prealable des textes trop longs (jamais de texte coupe a
// l'affichage — voir textLength.js). Les fragments issus d'un decoupage
// referencent TOUJOURS l'item reel d'origine (itemIds inchange) : seul le
// texte affiche (textOverride) differe par fragment, jamais un id synthetique
// dans book_pages.content (contrat preserve pour tout code qui lit itemIds).

function buildUnitsFromItems(items) {
  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
  const blocks = groupIntoBlocks(items);
  const units = [];

  for (const block of blocks) {
    if (block.kind === 'contribution') {
      const textItemId = block.itemIds.find((id) => itemsById[id]?.kind === 'texte');
      const text = textItemId ? String(itemsById[textItemId]?.text || '') : '';

      if (text.length > TEXT_HARD_SPLIT_THRESHOLD) {
        const parts = splitTextSafely(text, TEXT_HARD_SPLIT_THRESHOLD);
        parts.forEach((part, index) => {
          if (index === 0) {
            units.push({
              key: block.key,
              kind: 'contribution',
              itemIds: block.itemIds,
              order: block.order,
              weight: block.weight,
              textOverride: part,
              splitIndex: 0,
              splitTotal: parts.length
            });
          } else {
            units.push({
              key: `${block.key}::part${index}`,
              kind: 'texte',
              itemIds: [textItemId],
              order: block.order,
              weight: 1,
              textOverride: part,
              textLength: part.length,
              textLengthClass: classifyTextLength(part.length),
              splitIndex: index,
              splitTotal: parts.length,
              continuationOfContribution: true
            });
          }
        });
      } else {
        units.push({ key: block.key, kind: 'contribution', itemIds: block.itemIds, order: block.order, weight: block.weight });
      }
      continue;
    }

    if (block.kind === 'texte') {
      const text = String(itemsById[block.itemIds[0]]?.text || '');

      if (text.length > TEXT_HARD_SPLIT_THRESHOLD) {
        const parts = splitTextSafely(text, TEXT_HARD_SPLIT_THRESHOLD);
        parts.forEach((part, index) => {
          units.push({
            key: `${block.key}::part${index}`,
            kind: 'texte',
            itemIds: block.itemIds,
            order: block.order,
            weight: 1,
            textOverride: part,
            textLength: part.length,
            textLengthClass: classifyTextLength(part.length),
            splitIndex: index,
            splitTotal: parts.length
          });
        });
      } else {
        units.push({
          key: block.key,
          kind: 'texte',
          itemIds: block.itemIds,
          order: block.order,
          weight: block.weight,
          textLength: text.length,
          textLengthClass: classifyTextLength(text.length)
        });
      }
      continue;
    }

    // photo
    units.push({
      key: block.key,
      kind: 'photo',
      itemIds: block.itemIds,
      order: block.order,
      weight: block.weight,
      orientation: itemsById[block.itemIds[0]]?.metadata?.orientation || null
    });
  }

  return units;
}

// --- Choix du layout : PRNG deterministe pour departager les egalites de ---
// score. Ne change jamais le contenu place : seul le candidat exact
// (presentation, parfois decoupage en pages a capacite egale) alterne, de
// facon reproductible.

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

// --- 3. Boucle unifiee : consommation du contenu restant, page par page ---

function buildPageEntry(pageIndex, layout, consumedUnits, presentationVariant) {
  const kinds = new Set(consumedUnits.map((unit) => unit.kind));
  const pageKind = kinds.size === 1 ? [...kinds][0] : 'mixte';

  const textOverrides = consumedUnits
    .filter((unit) => unit.textOverride !== undefined)
    .map((unit) => ({
      itemId: unit.itemIds[0],
      text: unit.textOverride,
      splitIndex: unit.splitIndex,
      splitTotal: unit.splitTotal,
      continuation: Boolean(unit.continuationOfContribution)
    }));

  const block = {
    itemIds: consumedUnits.flatMap((unit) => unit.itemIds),
    kind: pageKind,
    layoutId: layout?.id || null,
    // Alterne une sous-presentation purement cosmetique (voir pageRenderer.js)
    // independamment du choix structurel du layout : garantit que "essayer
    // une autre presentation" (regeneration via `variant`) change toujours
    // visiblement quelque chose, meme quand le scoring ne depart aucune
    // egalite entre layouts differents pour ce contenu.
    presentationVariant
  };
  if (textOverrides.length > 0) block.textOverrides = textOverrides;

  return {
    page_index: pageIndex,
    layout_id: block.layoutId,
    content: {
      kind: pageKind,
      itemIds: block.itemIds,
      blocks: [block]
    }
  };
}

/**
 * Construit toutes les pages necessaires pour placer TOUT le contenu restant
 * (jamais de contenu perdu) : pas de budget de pages ici, c'est compose() qui
 * decide ensuite si le resultat depasse le nombre de pages demande
 * (overflow, purement indicatif) ou doit etre complete par des pages
 * blanches. Aussi reutilise tel quel par recommendPageCount (§5 du plan).
 *
 * @param {object} input
 * @param {Array} input.units - buildUnitsFromItems(items)
 * @param {Array} input.layouts - layout_definitions actifs
 * @param {Array} input.allowedSlugs - liste blanche du style choisi (vide = pas de restriction)
 * @param {string} input.profile - 'PHOTO'|'TEXTE'|'EQUILIBRE'
 * @param {string} input.seedBase
 * @returns {{ pages: Array }}
 */
function buildPages(input) {
  const allUnits = Array.isArray(input.units) ? input.units : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const allowedSlugs = Array.isArray(input.allowedSlugs) ? input.allowedSlugs : [];
  const profile = input.profile || 'EQUILIBRE';
  const seedBase = input.seedBase || 'no-template:0';

  const pool = allowedSlugs.length > 0
    ? layouts.filter((layout) => allowedSlugs.includes(layout.slug) || GUARANTEED_FALLBACK_SLUGS.includes(layout.slug))
    : layouts;
  const fallbackPool = layouts.filter((layout) => GUARANTEED_FALLBACK_SLUGS.includes(layout.slug));

  let queue = allUnits.slice();
  let rhythmState = createRhythmState();
  let familyCounts = createFamilyCounts();
  const pages = [];

  while (queue.length > 0) {
    const window = queue.slice(0, MAX_LOOKAHEAD_UNITS);

    let candidates = resolveCandidates(pool, window);
    if (candidates.length === 0) candidates = resolveCandidates(fallbackPool, window);
    if (candidates.length === 0) {
      // Filet de securite ultime (catalogue incomplet/mal configure) : place
      // au moins l'unite de tete seule plutot que de perdre du contenu ou de
      // boucler indefiniment. Ne devrait jamais servir en production tant que
      // GUARANTEED_FALLBACK_SLUGS reste actif en base (voir migration SQL).
      candidates = [{ slug: null, kind: window[0].kind, capacity: {}, min_items: 1, max_items: 1 }];
    }

    const scored = candidates.map((layout) => {
      const units = window.slice(0, consumedCount(layout, window) || 1);
      return { layout, units, score: scoreLayoutCandidate(layout, units, { profile, rhythmState, familyCounts }) };
    });

    const maxScore = Math.max(...scored.map((entry) => entry.score));
    const best = scored.filter((entry) => Math.abs(entry.score - maxScore) < 1e-9);
    const chosen = pickDeterministic(best, `${seedBase}:${pages.length}:${window[0].key}`);

    // Seed distincte de celle du choix structurel ci-dessus : la sous-presentation
    // varie a chaque regeneration meme quand le choix de layout, lui, ne
    // change pas (voir buildPageEntry et pageRenderer.js).
    const presentationSeed = hashSeed(`${seedBase}:${pages.length}:presentation`);
    const presentationVariant = Math.floor(mulberry32(presentationSeed)() * 2);

    pages.push(buildPageEntry(pages.length, chosen.layout, chosen.units, presentationVariant));
    rhythmState = updateRhythmState(rhythmState, chosen.layout);
    familyCounts = updateFamilyCounts(familyCounts, chosen.layout);
    queue = queue.slice(chosen.units.length);
  }

  return { pages };
}

// --- Mode Automatique : recommandation de palier a partir du contenu reel --
// Reutilise la meme boucle que compose() (source unique de verite) avec un
// budget de pages non borne : le nombre de pages qu'il faudrait reellement
// pour tout placer, sans jamais inventer de contenu pour combler.

/**
 * @param {object} input
 * @param {Array} input.items - book_content_items du livre
 * @param {Array} [input.layouts] - layout_definitions actifs (necessaire pour une estimation precise)
 * @param {object} [input.template] - book_templates row (pour allowed_layouts ; optionnel)
 * @param {number} [input.fixedPages]
 * @returns {{ recommended: number, estimatedPages: number, tiers: Array<{pageCount:number, fits:boolean}> }}
 */
function recommendPageCount(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const allowedSlugs = Array.isArray(input.template?.allowed_layouts) ? input.template.allowed_layouts : [];
  const fixedPages = clampInt(input.fixedPages, DEFAULT_FIXED_PAGES);

  const units = buildUnitsFromItems(items);
  const { profile } = detectContentProfile(items);
  const seedBase = `${input.template?.id || 'no-template'}:recommend`;
  const { pages } = buildPages({ units, layouts, allowedSlugs, profile, seedBase });

  const estimatedPages = units.length === 0 ? 0 : fixedPages + pages.length;
  const recommended = PAGE_COUNT_TIERS.find((tier) => tier >= estimatedPages) || PAGE_COUNT_TIERS[PAGE_COUNT_TIERS.length - 1];
  const tiers = PAGE_COUNT_TIERS.map((pageCount) => ({ pageCount, fits: pageCount >= estimatedPages }));

  return { recommended, estimatedPages, tiers };
}

/**
 * @param {object} input
 * @param {Array} input.items - book_content_items du livre (kind, text, url, contribution_id, display_order, id, metadata)
 * @param {object} input.template - book_templates row (allowed_layouts, id)
 * @param {Array} input.layouts - layout_definitions actifs
 * @param {number} input.pageCount - nombre de pages demande pour le livre (couverture non comprise)
 * @param {number} [input.variant] - graine de regeneration (0 par defaut)
 * @param {number} [input.fixedPages] - pages fixes non composees (garde/titre)
 * @returns {{ pages: Array<{page_index:number, layout_id:string|null, content:object}>, overflow: boolean, underflow: boolean, pageBudget: number, totalWeight: number }}
 */
function compose(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const allowedSlugs = Array.isArray(input.template?.allowed_layouts) ? input.template.allowed_layouts : [];
  const fixedPages = clampInt(input.fixedPages, DEFAULT_FIXED_PAGES);
  const variant = Number.isInteger(input.variant) ? input.variant : 0;
  const seedBase = `${input.template?.id || 'no-template'}:${variant}`;

  const pagesAvailable = Math.max(0, clampInt(input.pageCount, 0) - fixedPages);

  const units = buildUnitsFromItems(items);
  const { profile } = detectContentProfile(items);
  const { pages: contentPages } = buildPages({ units, layouts, allowedSlugs, profile, seedBase });

  // Le livre compte EXACTEMENT le nombre de pages que le contenu occupe,
  // jamais plus : aucune page blanche n'est jamais inseree pour atteindre un
  // palier (une page vide est une forme de "remplissage artificiel" au meme
  // titre qu'inventer du contenu — voir cahier des charges §2 et §10).
  //
  // Si le contenu depasse le budget demande, tout est tout de meme place
  // (jamais de troncature) et `overflow` previent l'appelant. Si le contenu
  // tient sur moins de pages que demande, `underflow` previent l'appelant
  // (le livre sera plus court que le palier choisi) — dans les deux cas une
  // simple recommandation/alerte cote ecran, jamais un blocage.
  const overflow = pagesAvailable > 0 && contentPages.length > pagesAvailable;
  const underflow = pagesAvailable > 0 && contentPages.length < pagesAvailable && contentPages.length > 0;

  const pages = contentPages.map((page, index) => ({ ...page, page_index: index }));
  const totalWeight = units.reduce((sum, unit) => sum + (unit.weight || 1), 0);

  return { pages, overflow, underflow, pageBudget: pagesAvailable, totalWeight };
}

module.exports = {
  compose,
  buildUnitsFromItems,
  buildPages,
  weightOfItem,
  groupIntoBlocks,
  recommendPageCount,
  hashSeed,
  mulberry32,
  pickDeterministic,
  DEFAULT_FIXED_PAGES,
  PAGE_COUNT_TIERS,
  GUARANTEED_FALLBACK_SLUGS
};
