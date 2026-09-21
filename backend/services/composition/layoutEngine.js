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
// 2026-09-09 : 16 et 24 RETIRES — en dessous du minimum imprimable chez
// Gelato (integration imprimeur en cours de test, voir
// backend/services/printing/gelatoCatalog.js) : tous les produits
// photobooks du catalogue reel n'acceptent qu'entre 28 et 200 pages, par pas
// de 2, verifie via l'API (voir memoire "gelato-integration-status").
//
// 2026-09-11 : plancher porte a 30 (demande utilisateur). A NOTER, verifie a
// nouveau sur l'API reelle le meme jour : Gelato accepte toujours 28 (la
// liste renvoyee par /prices?pageCount=<invalide> commence bien par
// [28,30,32,...] sur les 3 produits) — 30 est donc un choix PRODUIT, plus
// strict que la contrainte imprimeur, pas une obligation Gelato. C'est sans
// risque (un cran au-dessus du minimum reel), mais si quelqu'un cherche un
// jour a redescendre a 28, rien cote imprimeur ne s'y oppose. La valeur
// reelle du catalogue reste 28 dans gelatoCatalog.js, qui decrit l'imprimeur
// et non notre politique editoriale.
const PAGE_COUNT_TIERS = [30, 32, 48, 64];
// Alias semantique de PAGE_COUNT_TIERS[0] : plancher DUR applique partout ou
// un nombre de pages est sur le point d'etre PERSISTE (POST /compose, POST
// /format — voir routes/composition.js), pas seulement suggere. Choix
// utilisateur confirme 2026-09-09 : en dessous de ce plancher, le systeme
// BLOQUE et demande plus de contenu plutot que de completer avec des pages
// vides — coherent avec la regle deja en place dans compose() ci-dessous
// ("aucune page blanche n'est jamais inseree pour atteindre un palier").
const MIN_PRINTABLE_PAGES = PAGE_COUNT_TIERS[0];
// Plafond DUR symetrique — Gelato n'imprime aucun produit photobook
// au-dela de 200 pages interieures, verifie via l'API sur tous les
// formats (voir memoire "gelato-integration-status"). Sans ce garde, un
// livre a contenu tres abondant pouvait composer/persister un nombre de
// pages qui ne serait bloque qu'au moment d'une vraie commande — trop
// tard pour que l'utilisateur retire du contenu sereinement.
const MAX_PRINTABLE_PAGES = 200;

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
      orientation: itemsById[block.itemIds[0]]?.metadata?.orientation || null,
      // Ratio numerique largeur/hauteur (voir storageService.js:
      // probeImageDimensions) — deja sonde a l'upload, jamais utilise avant
      // le scoring d'adequation photo<->emplacement ci-dessous
      // (layoutScoring.js: scoreOrientation) : orientation seule (paysage/
      // portrait/carre) ne distingue pas un panorama tres large d'une photo
      // 4:3 classique, toutes deux "paysage".
      ratio: itemsById[block.itemIds[0]]?.metadata?.ratio || null
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
 * @param {string} [input.mood] - ambiance de composition (voir layoutScoring.MOOD_LAYOUT_WEIGHTS), absent = comportement standard
 * @param {string} [input.formatId] - 'livret'|'standard'|'luxe' (voir layoutScoring.scoreOrientation), absent = ratio de page par defaut (standard/luxe)
 * @param {number} [input.targetPages] - nombre de pages A REMPLIR. Absent/0 = densite naturelle, comportement d'avant.
 * @returns {{ pages: Array }}
 */
function buildPages(input) {
  const allUnits = Array.isArray(input.units) ? input.units : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const allowedSlugs = Array.isArray(input.allowedSlugs) ? input.allowedSlugs : [];
  const profile = input.profile || 'EQUILIBRE';
  const seedBase = input.seedBase || 'no-template:0';
  const mood = input.mood || undefined;
  const formatId = input.formatId || undefined;
  const targetPages = Math.max(0, clampInt(input.targetPages, 0));

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

    // REPARTIR plutot qu'EMPILER, quand le livre a de la place.
    //
    // Sans cette etape, le moteur remplit chaque page au maximum de ce que la
    // mise en page la mieux notee accepte — et s'arrete des qu'il n'a plus de
    // contenu. Resultat constate le 2026-09-15 : 47 photos tenaient en 21
    // pages, laissant 9 pages blanches a la fin d'un livre de 30. Or il y
    // avait largement de quoi remplir le livre entier, simplement en posant
    // moins de photos par page.
    //
    // Regle : tant qu'il reste des pages a remplir, on ne retient que les
    // mises en page qui consomment au plus la "ration" restante
    // (unites restantes / pages restantes, arrondie au superieur). Avec 59
    // unites pour 30 pages, la ration vaut 2 : les formats a 3 ou 4 photos
    // sont ecartes, ceux a 1 ou 2 restent — et le livre se remplit.
    //
    // Trois garde-fous, chacun important :
    //   - au moins 1 : une ration de 0 ecarterait tout.
    //   - si le filtre ne laisse RIEN (aucune mise en page assez petite pour
    //     ce contenu), on garde les candidats d'origine : mieux vaut une page
    //     dense qu'un contenu perdu.
    //   - au-dela de la cible (contenu plus abondant que le livre), le filtre
    //     ne s'applique plus : on reprend la densite naturelle, et compose()
    //     signalera l'overflow.
    if (targetPages > 0 && pages.length < targetPages) {
      const rationParPage = Math.max(1, Math.ceil(queue.length / (targetPages - pages.length)));
      const assezLegers = candidates.filter((layout) => (consumedCount(layout, window) || 1) <= rationParPage);
      if (assezLegers.length > 0) candidates = assezLegers;
    }

    if (candidates.length === 0) {
      // Filet de securite ultime (catalogue incomplet/mal configure) : place
      // au moins l'unite de tete seule plutot que de perdre du contenu ou de
      // boucler indefiniment. Ne devrait jamais servir en production tant que
      // GUARANTEED_FALLBACK_SLUGS reste actif en base (voir migration SQL).
      candidates = [{ slug: null, kind: window[0].kind, capacity: {}, min_items: 1, max_items: 1 }];
    }

    const scored = candidates.map((layout) => {
      const units = window.slice(0, consumedCount(layout, window) || 1);
      return { layout, units, score: scoreLayoutCandidate(layout, units, { profile, rhythmState, familyCounts, mood, formatId }) };
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
 * @param {number} [input.targetPages] - nombre de pages du livre, pour savoir combien seront REELLEMENT remplies
 * @returns {{ recommended: number, estimatedPages: number, filledPages: number, tiers: Array<{pageCount:number, fits:boolean}> }}
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

  // Combien de pages seront REELLEMENT remplies dans CE livre-ci.
  //
  // `estimatedPages` repond a une autre question : « sur combien de pages ce
  // contenu tient-il naturellement ? » — utile pour recommander un palier a
  // la creation. Mais depuis que le moteur repartit le contenu sur le nombre
  // de pages demande (voir buildPages, "REPARTIR plutot qu'EMPILER"), les deux
  // chiffres divergent : 47 photos "tiennent" en 21 pages mais en remplissent
  // 30 si le livre en compte 30. Annoncer le premier ferait promettre des
  // pages blanches qui n'existeront pas.
  const targetPages = Math.max(0, clampInt(input.targetPages, 0));
  const filledPages = units.length === 0
    ? 0
    : (targetPages > 0
      ? buildPages({ units, layouts, allowedSlugs, profile, seedBase, targetPages }).pages.length
      : pages.length);
  const recommended = PAGE_COUNT_TIERS.find((tier) => tier >= estimatedPages) || PAGE_COUNT_TIERS[PAGE_COUNT_TIERS.length - 1];
  const tiers = PAGE_COUNT_TIERS.map((pageCount) => ({ pageCount, fits: pageCount >= estimatedPages }));

  return { recommended, estimatedPages, filledPages, tiers };
}

// Accorde le registre visuel des pages qui se font face — voir l'appel dans
// compose() pour la raison. Ne touche QUE la sous-presentation : jamais le
// contenu place, jamais le format choisi, jamais l'ordre de lecture.
//
// `FULL_PHOTO` est le seul format dont la presentation change de registre
// (variante 0 = fond perdu, variante 1 = photo dans sa marge — voir
// pageRenderer.renderPhotoBlock). Les grilles, elles, sont toujours dans
// leur cadre : une page pleine page qui leur fait face doit donc prendre sa
// marge pour leur ressembler.
//
// `FULL_PHOTO_SPREAD` occupe deja les deux pages : elle est coherente par
// construction et n'est pas touchee.
function harmoniserLesDoublesPages(pages, layouts) {
  const slugParId = new Map((layouts || []).map((layout) => [layout.id, layout.slug]));
  const estPleinePage = (page) => slugParId.get(page?.layout_id) === 'FULL_PHOTO';

  const ajuster = (page, variante) => {
    if (!page || page.content?.blocks?.[0]?.presentationVariant === variante) return page;
    const blocks = (page.content?.blocks || []).map((bloc, index) => (
      index === 0 ? { ...bloc, presentationVariant: variante } : bloc
    ));
    return { ...page, content: { ...page.content, blocks } };
  };

  const resultat = [...pages];

  // D'ABORD, ON APPAIRE LES PLEINES PAGES SOLITAIRES.
  //
  // Le moteur alterne volontairement les familles de mise en page pour eviter
  // la monotonie : deux pleines pages ne se retrouvent donc JAMAIS cote a
  // cote d'elles-memes. Mesure sur un livre reel de 46 pages : 15 pleines
  // pages, zero paire. Se contenter d'accorder les registres revenait donc a
  // mettre une marge a TOUTES — le fond perdu disparaissait du produit,
  // alors que c'est lui qui fait respirer un livre de photos.
  //
  // On echange donc deux pages entre deux doubles pages mal assorties : la
  // pleine page de la seconde vient rejoindre celle de la premiere. Resultat,
  // une double page immersive et une double page d'album, toutes deux
  // coherentes, la ou il y avait deux melanges.
  //
  // Un ECHANGE, pas une reecriture : les memes pages, le meme contenu, a des
  // places differentes. L'ordre des photos dans un livre automatique est
  // celui de leur depot, pas un recit — les deplacer ne trahit rien.
  const solitaires = [];
  for (let gauche = 0; gauche + 1 < resultat.length; gauche += 2) {
    const droite = gauche + 1;
    const aGauche = estPleinePage(resultat[gauche]);
    const aDroite = estPleinePage(resultat[droite]);
    if (aGauche !== aDroite) {
      solitaires.push({ pleine: aGauche ? gauche : droite, autre: aGauche ? droite : gauche });
    }
  }

  for (let i = 0; i + 1 < solitaires.length; i += 2) {
    const accueil = solitaires[i];
    const donneur = solitaires[i + 1];
    const a = accueil.autre;
    const b = donneur.pleine;
    [resultat[a], resultat[b]] = [resultat[b], resultat[a]];
    // page_index suit la POSITION, jamais la page : c'est lui qui decide
    // quelle moitie d'une photo sur double page est affichee (voir
    // pageRenderer : parite de l'index).
    resultat[a] = { ...resultat[a], page_index: a };
    resultat[b] = { ...resultat[b], page_index: b };
  }

  // ENSUITE SEULEMENT, on accorde les registres.
  for (let gauche = 0; gauche + 1 < resultat.length; gauche += 2) {
    const droite = gauche + 1;
    const aGauche = estPleinePage(resultat[gauche]);
    const aDroite = estPleinePage(resultat[droite]);

    if (aGauche && aDroite) {
      // Deux pleines pages face a face : le fond perdu prend tout son sens.
      resultat[gauche] = ajuster(resultat[gauche], 0);
      resultat[droite] = ajuster(resultat[droite], 0);
    } else if (aGauche) {
      resultat[gauche] = ajuster(resultat[gauche], 1);
    } else if (aDroite) {
      resultat[droite] = ajuster(resultat[droite], 1);
    }
  }
  return resultat;
}

/**
 * @param {object} input
 * @param {Array} input.items - book_content_items du livre (kind, text, url, contribution_id, display_order, id, metadata)
 * @param {object} input.template - book_templates row (allowed_layouts, id)
 * @param {Array} input.layouts - layout_definitions actifs
 * @param {number} input.pageCount - nombre de pages demande pour le livre (couverture non comprise)
 * @param {number} [input.variant] - graine de regeneration (0 par defaut)
 * @param {number} [input.fixedPages] - pages fixes non composees (garde/titre)
 * @param {string} [input.mood] - ambiance de composition, jamais persistee (voir routes/composition.js POST /compose) — absente = comportement standard, non-regressif
 * @param {string} [input.formatId] - 'livret'|'standard'|'luxe' (voir layoutScoring.scoreOrientation, adequation photo<->emplacement) — absent = ratio de page par defaut
 * @returns {{ pages: Array<{page_index:number, layout_id:string|null, content:object}>, overflow: boolean, underflow: boolean, pageBudget: number, totalWeight: number }}
 */
function compose(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const layouts = Array.isArray(input.layouts) ? input.layouts : [];
  const allowedSlugs = Array.isArray(input.template?.allowed_layouts) ? input.template.allowed_layouts : [];
  const fixedPages = clampInt(input.fixedPages, DEFAULT_FIXED_PAGES);
  const variant = Number.isInteger(input.variant) ? input.variant : 0;
  const seedBase = `${input.template?.id || 'no-template'}:${variant}`;
  const mood = input.mood || undefined;
  const formatId = input.formatId || undefined;

  const pagesAvailable = Math.max(0, clampInt(input.pageCount, 0) - fixedPages);

  const units = buildUnitsFromItems(items);
  const { profile } = detectContentProfile(items);
  // Le moteur vise le nombre de pages DEMANDE : avec assez de contenu, le
  // livre se remplit entierement au lieu de s'arreter des que le contenu est
  // place (voir buildPages, "REPARTIR plutot qu'EMPILER").
  //
  // La cible est le nombre de pages ENTIER, pas `pagesAvailable`. Les
  // `fixedPages` (garde + page de titre) sont une RESERVATION DE BUDGET que
  // rien ne materialise : aucune page de garde ni de titre n'est produite nulle
  // part (seules les couvertures s'ajoutent, et elles sont hors budget — voir
  // coverComposer). Viser le budget ampute laissait donc systematiquement 2
  // pages blanches en fin de livre, alors qu'il y avait de quoi les remplir :
  // 47 photos pour 30 pages s'arretaient a 28 (2026-09-15).
  //
  // `pagesAvailable` reste la reference pour overflow/underflow : ces deux
  // signaux n'ont pas change de sens, et d'autres ecrans s'en servent.
  const { pages: contentPages } = buildPages({
    units, layouts, allowedSlugs, profile, seedBase, mood, formatId,
    targetPages: clampInt(input.pageCount, 0)
  });

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

  // UNE DOUBLE PAGE SE LIT D'UN SEUL REGARD (2026-09-21).
  //
  // Jusqu'ici, la sous-presentation etait tiree au hasard PAR PAGE. Une
  // photo pleine page a fond perdu pouvait donc faire face a une photo
  // posee dans sa marge blanche : deux registres differents cote a cote,
  // qui donnent l'impression d'une erreur plutot que d'un choix.
  //
  // Signale le 2026-09-21, captures a l'appui : « quand c'est une seule
  // page, l'image prend toute la page ; du coup ce n'est pas beau quand en
  // face tu as deux ou trois images qui, elles, respectent le cadre ».
  //
  // Les deux registres sont beaux — mais pas ensemble. Le fond perdu dit
  // « immersion », le cadre dit « album ». On les accorde donc par PAIRE :
  //
  //   deux photos pleine page face a face  -> les deux a fond perdu
  //   une photo pleine page face a autre chose -> elle prend sa marge
  //
  // Les pages se font face par parite : 0 avec 1, 2 avec 3 — meme
  // convention que l'atelier (leftPageIndex = spread * 2) et que le rendu
  // des photos sur double page.
  const pages = harmoniserLesDoublesPages(
    contentPages.map((page, index) => ({ ...page, page_index: index })),
    layouts
  );
  const totalWeight = units.reduce((sum, unit) => sum + (unit.weight || 1), 0);

  return { pages, overflow, underflow, pageBudget: pagesAvailable, totalWeight };
}

module.exports = {
  compose,
  // Expose la regle d accord des doubles pages : c est une decision
  // visuelle qui merite ses propres tests, sans rejouer tout le moteur.
  __harmoniserPourLesTests: harmoniserLesDoublesPages,
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
  MIN_PRINTABLE_PAGES,
  MAX_PRINTABLE_PAGES,
  GUARANTEED_FALLBACK_SLUGS
};
