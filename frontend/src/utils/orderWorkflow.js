export const ORDER_STATUS_SEQUENCE = [
  'awaiting_payment',
  'paid',
  'pdf_generating',
  'pdf_ready',
  'print_queued',
  'sent_to_printer',
  'printed',
  'shipped',
  'delivered'
];

const ORDER_STATUS_CONFIG = {
  draft: { label: 'Brouillon', tone: 'is-draft' },
  awaiting_payment: { label: 'En attente paiement', tone: 'is-awaiting' },
  paid: { label: 'Payee', tone: 'is-paid' },
  pdf_generating: { label: 'Paiement valide - generation PDF', tone: 'is-progress' },
  pdf_ready: { label: 'PDF pret', tone: 'is-ready' },
  print_queued: { label: 'Mise en production', tone: 'is-progress' },
  sent_to_printer: { label: 'Envoye imprimeur', tone: 'is-progress' },
  printed: { label: 'Imprime', tone: 'is-progress' },
  shipped: { label: 'Expedie', tone: 'is-progress' },
  delivered: { label: 'Livre', tone: 'is-ready' },
  cancelled: { label: 'Annulee', tone: 'is-muted' },
  failed: { label: 'Echec', tone: 'is-error' }
};

export const getOrderStatusConfig = (status) => (
  ORDER_STATUS_CONFIG[status] || { label: status || 'Inconnu', tone: 'is-muted' }
);

// La commande est-elle payee (ou plus avancee) ?
export const isOrderPaid = (status) => {
  const rang = ORDER_STATUS_SEQUENCE.indexOf(String(status || '').toLowerCase());
  return rang > -1 && rang >= ORDER_STATUS_SEQUENCE.indexOf('paid');
};

// LE PDF NE SE LIT PAS DANS `status` (2026-09-20).
//
// `orders.status` est une colonne UNIQUE pour deux produits qui n'avancent
// pas au meme rythme. Sur un « Pack », l'envoi a l'imprimeur y ecrit
// `sent_to_printer` quelques secondes apres le paiement : chercher
// `pdf_ready` dans ce champ revient a demander au suivi d'impression ou en
// est le fichier. L'etat du PDF vit donc dans SES marqueurs a lui.
export const isPdfReady = (order) => {
  if (!order || !includesPdf(order.type)) return false;
  if (order?.metadata?.pdfReady === true) return true;
  // Commandes PDF seules d'avant cette date : leur statut fait foi.
  return String(order.status || '').toLowerCase() === 'pdf_ready';
};

export const pdfJobIdOf = (order) => String(order?.metadata?.pdfJobId || '').trim();

export const includesPdf = (orderType) => orderType === 'pdf' || orderType === 'pack';

export const includesPrint = (orderType) => orderType === 'print' || orderType === 'pack';

export const formatPriceCents = (value, currency = 'EUR') => {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency
  }).format(safeValue / 100);
};
