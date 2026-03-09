import { getBookLifecycleStatusFromBook } from './bookLifecycle';

const ORDER_JOURNEY_STATUSES = new Set([
  'awaiting_payment',
  'paid',
  'pdf_generating',
  'pdf_ready',
  'print_queued',
  'sent_to_printer',
  'printed',
  'shipped',
  'delivered',
  'cancelled',
  'failed'
]);

const JOURNEY_STATUS_CONFIG = {
  editing: {
    label: 'Edition en cours',
    tone: 'is-editing'
  },
  preview_available: {
    label: 'Apercu disponible',
    tone: 'is-preview'
  },
  finalized: {
    label: 'Valide definitivement',
    tone: 'is-finalized'
  },
  awaiting_payment: {
    label: 'En attente paiement',
    tone: 'is-awaiting'
  },
  paid: {
    label: 'Paiement valide',
    tone: 'is-paid'
  },
  pdf_generating: {
    label: 'Generation PDF',
    tone: 'is-progress'
  },
  pdf_ready: {
    label: 'PDF pret',
    tone: 'is-ready'
  },
  print_queued: {
    label: 'Mise en production',
    tone: 'is-printer'
  },
  sent_to_printer: {
    label: 'Envoye imprimeur',
    tone: 'is-printer'
  },
  printed: {
    label: 'Imprime',
    tone: 'is-printed'
  },
  shipped: {
    label: 'Expedie',
    tone: 'is-shipped'
  },
  delivered: {
    label: 'Livre',
    tone: 'is-ready'
  },
  cancelled: {
    label: 'Commande annulee',
    tone: 'is-muted'
  },
  failed: {
    label: 'Commande en erreur',
    tone: 'is-error'
  }
};

const JOURNEY_PRIMARY_ACTION = {
  continue_editing: {
    label: 'Continuer l edition',
    note: 'Revenir aux chapitres'
  },
  view_preview: {
    label: 'Voir l apercu',
    note: 'Verifier le rendu du livre'
  },
  open_checkout: {
    label: 'Commander',
    note: 'Choisir PDF, impression ou pack'
  },
  pay_pending_order: {
    label: 'Payer',
    note: 'Finaliser la commande en attente'
  },
  follow_pdf_generation: {
    label: 'Suivre la generation',
    note: 'Le PDF final se prepare'
  },
  download_pdf: {
    label: 'Telecharger le PDF',
    note: 'Interieur et couverture'
  },
  follow_order: {
    label: 'Suivre la commande',
    note: 'Production et livraison'
  },
  open_orders: {
    label: 'Voir la commande',
    note: 'Historique et details'
  },
  relaunch_order: {
    label: 'Relancer la commande',
    note: 'Revenir au checkout'
  }
};

const normalizeOrderStatus = (status) => (
  typeof status === 'string' ? status.trim().toLowerCase() : ''
);

const getOrderAwareStatus = (latestOrder) => {
  const orderStatus = normalizeOrderStatus(latestOrder?.status);
  if (!orderStatus || orderStatus === 'draft') {
    return '';
  }
  return ORDER_JOURNEY_STATUSES.has(orderStatus) ? orderStatus : '';
};

export const resolveBookJourneyStatus = ({ book, latestOrder = null }) => {
  const fromOrder = getOrderAwareStatus(latestOrder);
  if (fromOrder) {
    return fromOrder;
  }

  const lifecycleStatus = getBookLifecycleStatusFromBook(book);
  if (lifecycleStatus === 'preview_available') {
    return 'preview_available';
  }
  if (lifecycleStatus === 'finalized') {
    return 'finalized';
  }
  if (lifecycleStatus === 'sent_to_printer') {
    return 'sent_to_printer';
  }
  if (lifecycleStatus === 'printed') {
    return 'printed';
  }
  if (lifecycleStatus === 'shipped') {
    return 'shipped';
  }

  return 'editing';
};

export const getJourneyStatusConfig = (status) => (
  JOURNEY_STATUS_CONFIG[status] || JOURNEY_STATUS_CONFIG.editing
);

export const getJourneyPrimaryAction = (status, latestOrder = null) => {
  const orderType = String(latestOrder?.type || '').toLowerCase();
  switch (status) {
    case 'editing':
      return { key: 'continue_editing', ...JOURNEY_PRIMARY_ACTION.continue_editing };
    case 'preview_available':
      return { key: 'view_preview', ...JOURNEY_PRIMARY_ACTION.view_preview };
    case 'finalized':
      return { key: 'open_checkout', ...JOURNEY_PRIMARY_ACTION.open_checkout };
    case 'awaiting_payment':
      return { key: 'pay_pending_order', ...JOURNEY_PRIMARY_ACTION.pay_pending_order };
    case 'paid':
      if (orderType === 'print') {
        return { key: 'follow_order', ...JOURNEY_PRIMARY_ACTION.follow_order };
      }
      return { key: 'follow_pdf_generation', ...JOURNEY_PRIMARY_ACTION.follow_pdf_generation };
    case 'pdf_generating':
      return { key: 'follow_pdf_generation', ...JOURNEY_PRIMARY_ACTION.follow_pdf_generation };
    case 'pdf_ready':
      return { key: 'download_pdf', ...JOURNEY_PRIMARY_ACTION.download_pdf };
    case 'print_queued':
    case 'sent_to_printer':
    case 'printed':
    case 'shipped':
      return { key: 'follow_order', ...JOURNEY_PRIMARY_ACTION.follow_order };
    case 'delivered':
      return { key: 'open_orders', ...JOURNEY_PRIMARY_ACTION.open_orders };
    case 'cancelled':
    case 'failed':
      return { key: 'relaunch_order', ...JOURNEY_PRIMARY_ACTION.relaunch_order };
    default:
      return { key: 'continue_editing', ...JOURNEY_PRIMARY_ACTION.continue_editing };
  }
};

