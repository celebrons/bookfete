// backend/services/composition/manualPageBuilder.js
//
// Decision/validation pure pour l'atelier de creation personnalisee (edition
// manuelle page par page) : transforme un choix explicite de l'utilisateur
// (un layout + une liste ordonnee d'items) en un book_pages.content valide —
// meme forme exacte qu'une page produite par layoutEngine.js (un seul
// bloc), donc rendue par pageRenderer.js sans aucune distinction entre une
// page automatique et une page manuelle.
//
// Reutilise layoutCapacity.isStructurallyCompatible (memes regles de
// compatibilite structurelle que l'algorithme automatique) plutot que d'en
// reecrire une variante : un emplacement photo refuse un texte, un
// emplacement texte refuse un texte trop long pour sa classe de longueur —
// exactement les memes garanties, jamais un deuxieme jeu de regles qui
// pourrait diverger.
//
// Fonctions pures, aucun acces reseau/disque — la route appelante resout le
// layout et les items (avec verification d'appartenance au livre) avant
// d'appeler ce module.

const { isStructurallyCompatible } = require('./layoutCapacity');
const { classifyTextLength } = require('./textLength');

// Meme convention deja utilisee ailleurs dans ce backend (ex.
// routes/orders.js, createUserScopedClient) : une Error normale avec un
// .status attache, lue par le catch de la route (`error.status || 500`) —
// jamais une classe d'erreur dediee supplementaire.
function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

// Traduit une liste d'items (book_content_items reels, dans l'ordre choisi
// par l'utilisateur) en "unites" minimales — juste ce dont
// matchesSlotSequence a besoin (kind + classe de longueur pour un texte).
// Jamais de regroupement par contribution ici (contrairement a
// layoutEngine.buildUnitsFromItems) : l'utilisateur choisit des items
// individuels explicitement, pas une file a segmenter.
function toUnits(items) {
  return items.map((item) => ({
    kind: item.kind,
    itemIds: [item.id],
    textLengthClass: item.kind === 'texte' ? classifyTextLength((item.text || '').length) : undefined
  }));
}

/**
 * @param {object} input
 * @param {object} input.layout - layout_definitions row (deja charge, actif)
 * @param {Array} input.items - book_content_items reels, dans l'ordre choisi
 *   par l'utilisateur (deja verifies comme appartenant au livre par
 *   l'appelant) — un item par emplacement du layout.
 * @returns {object} content pret pour book_pages.content (un seul bloc)
 * @throws {Error} (avec .status = 400) si les items ne correspondent pas aux
 *   emplacements du layout — jamais un plantage generique
 */
function buildManualPageContent({ layout, items }) {
  if (!layout) {
    throw validationError('Format de page invalide.');
  }
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (safeItems.length === 0) {
    throw validationError('Aucun contenu selectionne pour cette page.');
  }

  const slots = layout.capacity?.slots;
  if (!Array.isArray(slots) || slots.length === 0) {
    throw validationError("Ce format ne peut pas etre utilise dans l'atelier.");
  }
  if (safeItems.length !== slots.length) {
    throw validationError(`Ce format attend exactement ${slots.length} element(s), ${safeItems.length} fourni(s).`);
  }

  const units = toUnits(safeItems);
  if (!isStructurallyCompatible(layout, units)) {
    throw validationError(
      'Le contenu choisi ne correspond pas aux emplacements de ce format (photo/texte, ou texte trop long pour cet emplacement).'
    );
  }

  const itemIds = safeItems.map((item) => item.id);
  const kind = layout.kind === 'photo' || layout.kind === 'texte' ? layout.kind : 'mixte';

  return {
    kind,
    itemIds,
    blocks: [
      {
        itemIds,
        kind,
        layoutId: layout.id,
        presentationVariant: 0
      }
    ]
  };
}

module.exports = {
  buildManualPageContent
};
