import i18n from '../i18n';
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

// Traduits a l'appel via i18n.t() (chantier bilingue, 2026-10-01) : voir
// bookLifecycle.js/getBookLifecycleConfig pour la meme raison.
const JOURNEY_STATUS_TONES = {
  editing: 'is-editing',
  preview_available: 'is-preview',
  finalized: 'is-finalized',
  awaiting_payment: 'is-awaiting',
  paid: 'is-paid',
  pdf_generating: 'is-progress',
  pdf_ready: 'is-ready',
  print_queued: 'is-printer',
  sent_to_printer: 'is-printer',
  printed: 'is-printed',
  shipped: 'is-shipped',
  delivered: 'is-ready',
  cancelled: 'is-muted',
  failed: 'is-error'
};

const buildPrimaryAction = (key) => ({
  key,
  label: i18n.t(`dashboard:journeyAction.${key}.label`),
  note: i18n.t(`dashboard:journeyAction.${key}.note`)
});

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

export const getJourneyStatusConfig = (status) => {
  const normalized = JOURNEY_STATUS_TONES[status] ? status : 'editing';
  return {
    label: i18n.t(`dashboard:journeyStatus.${normalized}`),
    tone: JOURNEY_STATUS_TONES[normalized]
  };
};

export const getJourneyPrimaryAction = (status, latestOrder = null) => {
  const orderType = String(latestOrder?.type || '').toLowerCase();
  switch (status) {
    case 'editing':
      return buildPrimaryAction('continue_editing');
    case 'preview_available':
      return buildPrimaryAction('view_preview');
    case 'finalized':
      return buildPrimaryAction('open_checkout');
    case 'awaiting_payment':
      return buildPrimaryAction('pay_pending_order');
    case 'paid':
      if (orderType === 'print') {
        return buildPrimaryAction('follow_order');
      }
      return buildPrimaryAction('follow_pdf_generation');
    case 'pdf_generating':
      return buildPrimaryAction('follow_pdf_generation');
    case 'pdf_ready':
      return buildPrimaryAction('download_pdf');
    case 'print_queued':
    case 'sent_to_printer':
    case 'printed':
    case 'shipped':
      return buildPrimaryAction('follow_order');
    case 'delivered':
      return buildPrimaryAction('open_orders');
    case 'cancelled':
    case 'failed':
      return buildPrimaryAction('relaunch_order');
    default:
      return buildPrimaryAction('continue_editing');
  }
};

