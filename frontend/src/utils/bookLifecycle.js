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
    label: 'En cours d edition',
    shortLabel: 'Edition',
    tone: 'is-editing'
  },
  preview_available: {
    label: 'Apercu disponible',
    shortLabel: 'Apercu',
    tone: 'is-preview'
  },
  finalized: {
    label: 'Finalise',
    shortLabel: 'Finalise',
    tone: 'is-finalized'
  },
  sent_to_printer: {
    label: 'Envoye a l imprimeur',
    shortLabel: 'Imprimeur',
    tone: 'is-printer'
  },
  printed: {
    label: 'Imprime',
    shortLabel: 'Imprime',
    tone: 'is-printed'
  },
  shipped: {
    label: 'Envoye',
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

export const getNextBookLifecycleStatus = (status) => {
  const normalized = normalizeBookLifecycleStatus(status) || 'editing';
  const currentIndex = BOOK_LIFECYCLE_ORDER.indexOf(normalized);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= BOOK_LIFECYCLE_ORDER.length) {
    return null;
  }

  return BOOK_LIFECYCLE_ORDER[nextIndex];
};
