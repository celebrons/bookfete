// backend/services/composition/layoutCapacity.js
//
// Compatibilite structurelle entre le contenu restant (file ordonnee
// d'"unites" atomiques) et les layouts du catalogue (layout_definitions).
// Une unite est soit un bloc photo/texte isole, soit un bloc "contribution"
// (photo(s)+texte+nom d'un meme contributeur, toujours atomique), soit un
// fragment synthetique issu du decoupage d'un texte trop long (voir
// textLength.js) — voir layoutEngine.js pour groupIntoBlocks().
//
// layout_definitions.capacity.slots decrit une sequence ORDONNEE de slots
// ("photo" ou "text" avec ses classes de longueur autorisees) : l'ordre
// encode la mise en page (PHOTO_TEXT et TEXT_PHOTO ont la meme "forme" de
// contenu mais un ordre de slots inverse). Les layouts de kind
// 'contribution' n'utilisent pas `capacity` : ils gardent le comportement v1
// (min_items/max_items sur le nombre total d'items du bloc).
//
// L'orientation photo n'est volontairement PAS un critere de compatibilite
// structurelle ici (jamais de blocage dur sur un ratio particulier) : c'est
// un facteur de scoring doux (voir layoutScoring.js).
//
// Fonctions pures, aucun acces reseau/disque.

const { classifyTextLength } = require('./textLength');

// Plus grande capacite (nombre de slots) parmi les layouts v2 (FOUR_PHOTOS,
// TWO_PHOTOS_TEXT = 4 ; contribution-standard = 4 items). Ajustable si un
// futur layout demande plus de contenu simultanement.
const MAX_LOOKAHEAD_UNITS = 4;

function unitTextLengthClass(unit) {
  if (unit.kind !== 'texte') return null;
  return unit.textLengthClass || classifyTextLength(unit.textLength || 0);
}

// Un layout "capacity"-only (photo/texte/mixte) est compatible avec le
// prefixe de `units` s'il existe exactement autant d'unites que de slots,
// dans le meme ordre, chaque slot acceptant le kind (et, pour un slot texte,
// la classe de longueur) de l'unite correspondante.
function matchesSlotSequence(slots, units) {
  if (!Array.isArray(slots) || slots.length === 0) return false;
  if (units.length < slots.length) return false;

  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const unit = units[i];
    if (!unit) return false;

    if (slot.type === 'photo') {
      if (unit.kind !== 'photo') return false;
    } else if (slot.type === 'text') {
      if (unit.kind !== 'texte') return false;
      const allowed = Array.isArray(slot.lengthClass) && slot.lengthClass.length > 0
        ? slot.lengthClass
        : ['SHORT', 'MEDIUM', 'LONG'];
      if (!allowed.includes(unitTextLengthClass(unit))) return false;
    } else {
      return false;
    }
  }

  return true;
}

// Compatibilite d'un layout de kind 'contribution' : comportement v1 —
// nombre total d'items du bloc dans [min_items, max_items].
function matchesContribution(layout, units) {
  const unit = units[0];
  if (!unit || unit.kind !== 'contribution') return false;
  const itemCount = Array.isArray(unit.itemIds) ? unit.itemIds.length : 1;
  return itemCount >= (layout.min_items ?? 1) && itemCount <= (layout.max_items ?? itemCount);
}

/**
 * @param {object} layout - layout_definitions row
 * @param {Array} units - fenetre de contenu restant, dans l'ordre
 * @returns {boolean}
 */
function isStructurallyCompatible(layout, units) {
  if (!layout || !Array.isArray(units) || units.length === 0) return false;

  if (layout.kind === 'contribution') {
    return matchesContribution(layout, units);
  }

  const slots = layout.capacity?.slots;
  if (Array.isArray(slots) && slots.length > 0) {
    return matchesSlotSequence(slots, units);
  }

  // Repli pour tout layout sans `capacity` renseignee (ex. avant que la
  // migration SQL n'ait tourne, ou un layout v1 encore actif) : comportement
  // proche du v1, une seule unite homogene avec le kind du layout.
  const first = units[0];
  return Boolean(first) && first.kind === layout.kind
    && 1 >= (layout.min_items ?? 1) && 1 <= (layout.max_items ?? 1);
}

/**
 * Combien d'unites en tete de `units` seraient consommees si `layout` etait
 * choisi (0 si non compatible).
 */
function consumedCount(layout, units) {
  if (!isStructurallyCompatible(layout, units)) return 0;
  if (layout.kind === 'contribution') return 1;
  const slots = layout.capacity?.slots;
  if (Array.isArray(slots) && slots.length > 0) return slots.length;
  return 1;
}

/**
 * @param {Array} layouts - layout_definitions actifs, deja filtres par le
 *   style choisi (allowed_layouts) par l'appelant
 * @param {Array} queueWindow - prefixe contigu de la file de contenu restant
 *   (jusqu'a MAX_LOOKAHEAD_UNITS), dans l'ordre d'origine — jamais reordonne
 * @returns {Array} layouts compatibles avec un prefixe de queueWindow
 */
function resolveCandidates(layouts, queueWindow) {
  if (!Array.isArray(queueWindow) || queueWindow.length === 0) return [];
  return (layouts || []).filter((layout) => isStructurallyCompatible(layout, queueWindow));
}

module.exports = {
  isStructurallyCompatible,
  resolveCandidates,
  consumedCount,
  MAX_LOOKAHEAD_UNITS
};
