const BOOK_LIFECYCLE_ORDER = [
  'editing',
  'preview_available',
  'finalized',
  'sent_to_printer',
  'printed',
  'shipped'
];

const BOOK_LIFECYCLE_CONFIG = {
  editing: {
    label: 'Edition en cours',
    shortLabel: 'Edition',
    tone: 'is-editing'
  },
  preview_available: {
    label: 'Apercu genere',
    shortLabel: 'Apercu',
    tone: 'is-preview'
  },
  finalized: {
    label: 'Valide definitivement',
    shortLabel: 'Valide',
    tone: 'is-finalized'
  },
  sent_to_printer: {
    label: 'Commande en production',
    shortLabel: 'Commande',
    tone: 'is-printer'
  },
  printed: {
    label: 'Imprime',
    shortLabel: 'Imprime',
    tone: 'is-printed'
  },
  shipped: {
    label: 'Expedie',
    shortLabel: 'Envoye',
    tone: 'is-shipped'
  }
};

export { BOOK_LIFECYCLE_ORDER };

export const getBookLifecycleConfig = (status) => {
  const normalized = normalizeBookLifecycleStatus(status) || 'editing';
  return BOOK_LIFECYCLE_CONFIG[normalized] || BOOK_LIFECYCLE_CONFIG.editing;
};

export const normalizeBookLifecycleStatus = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return BOOK_LIFECYCLE_ORDER.includes(normalized) ? normalized : null;
};

export const getBookLifecycleStatusFromBook = (book) => {
  const explicit = normalizeBookLifecycleStatus(
    book?.cover_config?.lifecycleStatus
      || book?.lifecycle_status
      || book?.production_status
  );

  if (explicit) {
    return explicit;
  }

  if (book?.cover_config?.finalPdfReadyAt) {
    return 'finalized';
  }

  if (book?.cover_config?.previewAvailableAt) {
    return 'preview_available';
  }

  if (String(book?.statut || '').toLowerCase() === 'termine') {
    return 'finalized';
  }

  return 'editing';
};

export const getBookLifecycleRank = (status) => {
  const normalized = normalizeBookLifecycleStatus(status) || 'editing';
  return BOOK_LIFECYCLE_ORDER.indexOf(normalized);
};

export const isBookLifecycleAtLeast = (status, targetStatus) => (
  getBookLifecycleRank(status) >= getBookLifecycleRank(targetStatus)
);

// Coeur partage de l'ecriture d'un statut de cycle de vie — ecrit dans
// cover_config.lifecycleStatus (+ le timestamp associe la premiere fois),
// meme mecanisme deja utilise par BookPageLuxe.js avant cette extraction.
// Extrait ici car desormais 3 appelants en ont besoin (BookPageLuxe.js,
// BookPreviewFinalLuxe.js pour 'preview_available'/'finalized') — jamais
// une 3e reimplementation. Ne gere pas la notification/etat de chargement
// (specifique a chaque ecran) : l'appelant enrobe l'appel comme il veut,
// voir BookPageLuxe.js:setBookLifecycleStatus pour l'exemple avec notice.
//
// @param {string} nextStatus
// @param {{ book: object, onUpdateBook: (updates:object) => Promise, onlyForward?: boolean }} options
// @returns {Promise<boolean>} true si applique (ou deja au bon statut), false si refuse/invalide
export const applyLifecycleStatus = async (nextStatus, { book, onUpdateBook, onlyForward = false } = {}) => {
  const normalizedStatus = normalizeBookLifecycleStatus(nextStatus);
  if (!normalizedStatus || !book || !onUpdateBook) {
    return false;
  }

  const currentStatus = getBookLifecycleStatusFromBook(book);
  if (currentStatus === normalizedStatus) {
    return true;
  }

  if (onlyForward && !isBookLifecycleAtLeast(normalizedStatus, currentStatus)) {
    return false;
  }

  const currentCoverConfig = (book?.cover_config && typeof book.cover_config === 'object')
    ? book.cover_config
    : {};
  const nowIso = new Date().toISOString();
  const nextCoverConfig = {
    ...currentCoverConfig,
    lifecycleStatus: normalizedStatus,
    lifecycleUpdatedAt: nowIso
  };

  if (normalizedStatus === 'preview_available' && !nextCoverConfig.previewAvailableAt) {
    nextCoverConfig.previewAvailableAt = nowIso;
  }
  if (normalizedStatus === 'finalized' && !nextCoverConfig.finalPdfReadyAt) {
    nextCoverConfig.finalPdfReadyAt = nowIso;
  }
  if (normalizedStatus === 'finalized' && !nextCoverConfig.finalValidatedAt) {
    nextCoverConfig.finalValidatedAt = nowIso;
  }
  if (normalizedStatus === 'sent_to_printer' && !nextCoverConfig.sentToPrinterAt) {
    nextCoverConfig.sentToPrinterAt = nowIso;
  }
  if (normalizedStatus === 'printed' && !nextCoverConfig.printedAt) {
    nextCoverConfig.printedAt = nowIso;
  }
  if (normalizedStatus === 'shipped' && !nextCoverConfig.shippedAt) {
    nextCoverConfig.shippedAt = nowIso;
  }

  await onUpdateBook({ cover_config: nextCoverConfig });
  return true;
};

export const getNextBookLifecycleStatus = (status) => {
  const normalized = normalizeBookLifecycleStatus(status) || 'editing';
  const currentIndex = BOOK_LIFECYCLE_ORDER.indexOf(normalized);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= BOOK_LIFECYCLE_ORDER.length) {
    return null;
  }

  return BOOK_LIFECYCLE_ORDER[nextIndex];
};
