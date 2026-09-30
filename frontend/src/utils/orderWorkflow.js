import i18n from '../i18n';

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

// Cles de traduction, pas des libelles en dur (chantier bilingue,
// 2026-09-30) — namespace "checkout" (locales/{fr,en}/checkout.json). Cette
// fonction est appelee depuis des composants ET depuis du code hors React
// (aucun cas actuel, mais par prudence) : i18n.t() directement plutot que le
// hook useTranslation, qui exigerait un composant.
const ORDER_STATUS_KEYS = {
  draft: 'draft',
  awaiting_payment: 'awaitingPayment',
  paid: 'paid',
  pdf_generating: 'pdfGenerating',
  pdf_ready: 'pdfReady',
  print_queued: 'printQueued',
  sent_to_printer: 'sentToPrinter',
  printed: 'printed',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  failed: 'failed'
};

const ORDER_STATUS_TONES = {
  draft: 'is-draft',
  awaiting_payment: 'is-awaiting',
  paid: 'is-paid',
  pdf_generating: 'is-progress',
  pdf_ready: 'is-ready',
  print_queued: 'is-progress',
  sent_to_printer: 'is-progress',
  printed: 'is-progress',
  shipped: 'is-progress',
  delivered: 'is-ready',
  cancelled: 'is-muted',
  failed: 'is-error'
};

export const getOrderStatusConfig = (status) => {
  const key = ORDER_STATUS_KEYS[status];
  if (!key) return { label: status || i18n.t('checkout:orderStatus.unknown'), tone: 'is-muted' };
  return { label: i18n.t(`checkout:orderStatus.${key}`), tone: ORDER_STATUS_TONES[status] };
};

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

// Point d'entree UNIQUE pour afficher un montant en centimes (chantier
// bilingue FR/EN, 2026-09-30) — remplace 3 implementations qui coexistaient
// avant (celle-ci, utils/formatPrice.js, et une copie locale dans
// AtelierGenerateModal.js/TarifsLuxe.js), toutes codees en dur en 'fr-FR'.
// `locale` par defaut a 'fr-FR' : les ecrans pas encore traduits continuent
// d'afficher exactement comme avant ; un ecran traduit passe simplement
// `locale={i18n.language === 'en' ? 'en-US' : 'fr-FR'}` (voir useTranslation).
export const formatPriceCents = (value, currency = 'EUR', locale = 'fr-FR') => {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(safeValue / 100);
};

// Meme mise en forme, avec le signe +/- explicite — pour les indications
// breves de variation de prix ("+2,20 €", "-2,20 €" / "+€2.20", "-€2.20").
export const formatPriceCentsDelta = (value, currency = 'EUR', locale = 'fr-FR') => {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const sign = safeValue > 0 ? '+' : safeValue < 0 ? '-' : '';
  return `${sign}${formatPriceCents(Math.abs(safeValue), currency, locale)}`;
};
