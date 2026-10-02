const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');
const { t } = require('../services/i18n/t');
const { resolveLanguage } = require('../services/i18n/resolveLanguage');
const { submitPrintOrderToGelato, isGelatoLiveOrdersEnabled } = require('../services/printing/gelatoOrderService');
const gelatoClient = require('../services/printing/gelatoClient');
const { removePrintFilesForOrder } = require('../services/printing/printFileStorage');
const { logEvent } = require('../services/events/eventLog');
const { calculateBookPrice } = require('../services/pricing/calculateBookPrice');
const {
  PDF_PRICE_CENTS, PACK_DISCOUNT_PERCENT, DEFAULT_COUNTRY, PRICING_CONFIG,
  resolveCurrencyForCountry, convertEurCentsTo
} = require('../services/pricing/pricingConfig');
const { resolveCountry } = require('../services/pricing/resolveCountry');
const { resolveCountryIso2 } = require('../services/printing/countryCodes');

// Envois a l'imprimeur EN COURS, par commande.
//
// Sans ce verrou, deux requetes simultanees sur la meme commande creent
// DEUX brouillons chez Gelato : la garde d'idempotence de
// gelatoOrderService s'appuie sur metadata.gelatoOrderId, que cette route
// remet justement a null avant de renvoyer: les deux appels la lisent donc
// vide et partent tous les deux. Constate le 2026-09-17 — la meme commande
// apparaissait deux fois dans le tableau de bord Gelato, a la seconde pres.
//
// Portee : ce processus. C'est suffisant pour le cas reel (un double clic,
// ou un rendu relance pendant qu'un autre tourne) et pour un deploiement a
// une seule instance, qui est le notre. Un verrou reparti demanderait une
// colonne dediee en base ; a faire le jour ou plusieurs instances servent
// la meme commande.
// Les envois a l imprimeur en cours, et depuis quand.
//
// C'etait un Set : il ne disait que « oui/non ». Un verrou qui fuit
// bloquait alors tout nouvel envoi sur la commande, sans que rien ne
// permette de le voir ni de le relacher autrement qu'en redemarrant le
// serveur. Une Map retient DEPUIS QUAND, ce qui suffit a distinguer un
// envoi qui travaille d un verrou oublie (2026-09-19).
const gelatoSubmissionsEnCours = new Map();
const gelatoTracking = require('../services/printing/gelatoTracking');
const emails = require('../services/email/transactionalEmails');
const { emailValide } = require('../services/email/brevoClient');
const { generateInvoiceForOrder, signedInvoiceUrl } = require('../services/invoicing/invoiceService');
let Stripe = null;

try {
  Stripe = require('stripe');
} catch (_error) {
  Stripe = null;
}

const ORDER_TYPES = new Set(['pdf', 'print', 'pack']);
const ORDER_STATUSES = new Set([
  'draft',
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
// Ordre de progression d'une commande — miroir de ORDER_STATUS_SEQUENCE
// (frontend/src/utils/orderWorkflow.js), meme convention de duplication
// assumee que les autres petites tables partagees de ce projet. Sert au
// suivi de production a ne jamais faire RECULER un statut (voir
// GET /:orderId/tracking). 'draft'/'cancelled'/'failed' sont hors sequence
// a dessein : ce ne sont pas des etapes d'avancement.
const ORDER_STATUS_SEQUENCE = [
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
// Etats definitifs : une fois atteints, plus rien ne les remplace (voir
// shouldAdvance, GET /:orderId/tracking) — ni un recul dans la sequence
// normale, ni une annulation/echec qui arriverait apres coup.
const ORDER_STATUS_TERMINAL = new Set(['delivered', 'cancelled', 'failed']);
const ORDER_STATUS_REQUIRES_PAID = new Set([
  'pdf_generating',
  'pdf_ready',
  'print_queued',
  'sent_to_printer',
  'printed',
  'shipped',
  'delivered'
]);
const ORDER_STATUS_PAID_OR_AFTER = new Set([
  'paid',
  'pdf_generating',
  'pdf_ready',
  'print_queued',
  'sent_to_printer',
  'printed',
  'shipped',
  'delivered'
]);

const STATUS_TO_BOOK_LIFECYCLE = {
  pdf_ready: 'finalized',
  sent_to_printer: 'sent_to_printer',
  printed: 'printed',
  shipped: 'shipped',
  delivered: 'shipped'
};

const BOOK_LIFECYCLE_ORDER = [
  'editing',
  'preview_available',
  'finalized',
  'sent_to_printer',
  'printed',
  'shipped'
];

const getNowIso = () => new Date().toISOString();
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_ENABLED = process.env.STRIPE_ENABLED === '1';
const STRIPE_CHECKOUT_SUCCESS_URL = process.env.STRIPE_CHECKOUT_SUCCESS_URL || '';
const STRIPE_CHECKOUT_CANCEL_URL = process.env.STRIPE_CHECKOUT_CANCEL_URL || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_WEBHOOK_ALLOW_UNSIGNED = process.env.STRIPE_WEBHOOK_ALLOW_UNSIGNED === '1';
const MAX_STRIPE_EVENT_IDS = 25;
const stripeClient = (STRIPE_ENABLED && Stripe && STRIPE_SECRET_KEY)
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

// Stripe indique lui-meme son mode dans le prefixe de la cle secrete
// (`sk_test_...` bac a sable, `sk_live_...` vrais paiements) — c'est la
// source la plus fiable disponible ici, et elle ne demande aucune variable
// d'environnement supplementaire a tenir a jour. Utilise par DELETE
// /:orderId pour laisser effacer librement une commande de test tout en
// protegeant une commande reellement payee.
//
// Par prudence, une cle absente ou de forme inconnue est traitee comme du
// LIVE : en cas de doute, on protege la commande plutot que de la laisser
// supprimer. Relu a CHAQUE appel (et non fige au chargement du module) pour
// que basculer la cle prenne effet sans redemarrage, et pour rester testable.
const isStripeLiveMode = () => !/^sk_test_/.test(process.env.STRIPE_SECRET_KEY || '');

const extractBearerToken = (req) => {
  const authHeader = req.headers?.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
};

const createUserScopedClient = (req) => {
  const token = extractBearerToken(req);
  if (!token) {
    const error = new Error('Token utilisateur manquant');
    error.status = 401;
    throw error;
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );
};

const ensureStripeClient = () => {
  if (!STRIPE_ENABLED) {
    const error = new Error('Stripe est desactive');
    error.status = 400;
    throw error;
  }
  if (!Stripe) {
    const error = new Error('Module Stripe non installe sur le serveur');
    error.status = 500;
    throw error;
  }
  if (!stripeClient) {
    const error = new Error('Configuration Stripe incomplete');
    error.status = 500;
    throw error;
  }
  return stripeClient;
};

const fillCheckoutUrlTemplate = (template, context) => {
  if (!template) return '';
  return String(template)
    .replace(/\{BOOK_ID\}/g, context.bookId)
    .replace(/\{ORDER_ID\}/g, context.orderId)
    .replace(/\{CHECKOUT_SESSION_ID\}/g, '{CHECKOUT_SESSION_ID}');
};

const cleanString = (value, maxLength = 240) => {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
};

const normalizeBookLifecycleStatus = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return BOOK_LIFECYCLE_ORDER.includes(normalized) ? normalized : null;
};

const getBookLifecycleStatusFromBook = (book) => {
  const coverConfig = book?.cover_config && typeof book.cover_config === 'object'
    ? book.cover_config
    : {};

  const explicit = normalizeBookLifecycleStatus(
    coverConfig.lifecycleStatus || book?.lifecycle_status || book?.production_status
  );
  if (explicit) return explicit;

  if (coverConfig.finalPdfReadyAt) return 'finalized';
  if (coverConfig.previewAvailableAt) return 'preview_available';
  if (String(book?.statut || '').toLowerCase() === 'termine') return 'finalized';
  return 'editing';
};

const getLifecycleRank = (status) => {
  const normalized = normalizeBookLifecycleStatus(status) || 'editing';
  return BOOK_LIFECYCLE_ORDER.indexOf(normalized);
};

const getApiSafeOrder = (order) => ({
  ...order,
  shipping_address: order?.shipping_address || null,
  metadata: order?.metadata || {},
  snapshot: order?.snapshot || {}
});

const createOrderNumber = () => {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `CMD-${y}${m}${d}-${stamp}-${rand}`;
};

const sanitizeAddress = (rawAddress) => {
  const address = rawAddress && typeof rawAddress === 'object' ? rawAddress : {};
  const email = cleanString(address.email, 180).toLowerCase();
  return {
    fullName: cleanString(address.fullName, 120),
    line1: cleanString(address.line1, 180),
    line2: cleanString(address.line2, 180),
    postalCode: cleanString(address.postalCode, 24),
    city: cleanString(address.city, 120),
    country: cleanString(address.country, 120) || 'France',
    phone: cleanString(address.phone, 40),
    // EMAIL PORTE PAR LA COMMANDE, et pas seulement par le compte.
    //
    // C'est ce qui permet d'ecrire au client sans qu'il ait cree un compte
    // classique (decision produit 2026-09-15 : « ne pas imposer un compte
    // avec mot de passe, demander simplement son adresse e-mail »). C'est
    // aussi la seule adresse dont dispose le webhook Stripe, qui n'est pas
    // authentifie : sans elle, la confirmation de paiement n'aurait aucun
    // destinataire.
    //
    // Retenue seulement si elle ressemble a une adresse : une chaine
    // fantaisiste brulerait du quota d'envoi et de la reputation pour rien.
    // `emailValide` vient du client d'envoi : une seule definition de ce
    // qu'est une adresse acceptable, partagee par la validation et l'envoi.
    ...(emailValide(email) ? { email } : {})
  };
};

const isAddressValid = (address) => (
  Boolean(address?.fullName && address?.line1 && address?.postalCode && address?.city && address?.country)
);

// Grille tarifaire : voir services/pricing/pricingConfig.js (source unique,
// chantier "tarification dynamique" 2026-09-27) — remplace l'ancienne
// FORMAT_PRICING ad hoc (base + prix/page + plancher) qui ne correspondait
// pas a la grille commerciale reelle (base a 30 pages + palier tous les
// 2 pages). DEFAULT_PRINT_FORMAT garde son nom/role d'avant : repli quand
// books.print_format est absent/inconnu, utilise par plusieurs routes de ce
// fichier (formats/prix + creation de commande).
const DEFAULT_PRINT_FORMAT = 'standard';

// Prix de DEPART d'un format : celui du livre (hors livraison) au plancher
// produit (30 pages). C'est ce que "a partir de XX EUR" doit annoncer —
// calcule avec la MEME formule que le prix reel d'une commande
// (computeOrderPricing/calculateBookPrice), jamais un tarif d'affichage
// saisi a part qui finirait par diverger.
const startingPriceCents = (printFormat, pages, country) => calculateBookPrice({ format: printFormat, pageCount: pages, country }).bookPriceCents;

// book.page_count (pas book.pages, une colonne heritee de l'ancien flux IA
// jamais mise a jour par le moteur de composition actuel) : la vraie valeur,
// obligatoire pour composer le livre (voir routes/composition.js), donc le
// seul nombre qui correspond reellement au livre imprime.
//
// Livraison (retour utilisateur, 2026-09-27) : AJOUTEE ICI pour la premiere
// fois — jusqu'a ce chantier, `total_cents` ne portait que le prix du livre,
// aucune livraison n'etait facturee. `shippingCents` n'est PAS multiplie par
// la quantite (un forfait par COMMANDE, pas par exemplaire — coherent avec
// les exemples du cahier des charges) ; `unitCents` garde son sens d'avant
// (prix du livre par exemplaire), seul `totalCents` change de definition
// pour inclure vraiment le total paye.
const computeOrderPricing = ({ book, type, quantity, country = DEFAULT_COUNTRY }) => {
  const pages = Number(book?.page_count || 0);
  const safePages = Number.isFinite(pages) && pages > 0 ? pages : 64;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const requestedFormat = book?.print_format || DEFAULT_PRINT_FORMAT;

  const pricing = calculateBookPrice({ format: requestedFormat, pageCount: safePages, country });
  const printFormat = pricing.format;
  const printUnitCents = pricing.bookPriceCents;
  const currency = pricing.currency;
  // PDF_PRICE_CENTS : hors grille (aucun exemplaire physique, aucune
  // livraison) — 7,99€ (retour utilisateur 2026-09-27), TOUJOURS calcule en
  // euros puis converti (meme principe que le prix du livre imprime, voir
  // calculateBookPrice.js — jamais une deuxieme formule par devise).
  const pdfUnitCents = convertEurCentsTo(PDF_PRICE_CENTS, currency);

  let unitCents = pdfUnitCents;
  let shippingCents = 0;
  if (type === 'print') {
    unitCents = printUnitCents;
    shippingCents = pricing.shippingPriceCents;
  } else if (type === 'pack') {
    // PDF + imprime, moins PACK_DISCOUNT_PERCENT sur ce total (hors
    // livraison) — retour utilisateur 2026-09-27, remplace l'ancien
    // supplement fixe (+20 EUR) qui ignorait le prix reel du PDF/du format.
    const pdfPlusPrintCents = pdfUnitCents + printUnitCents;
    unitCents = Math.round(pdfPlusPrintCents * (100 - PACK_DISCOUNT_PERCENT) / 100);
    shippingCents = pricing.shippingPriceCents;
  }

  return {
    quantity: safeQuantity,
    unitCents,
    shippingCents,
    totalCents: (unitCents * safeQuantity) + shippingCents,
    currency,
    country: pricing.country,
    breakdown: {
      pages: safePages,
      printFormat,
      printUnitCents,
      pdfUnitCents,
      bookPriceCents: pricing.bookPriceCents,
      shippingPriceCents: shippingCents,
      pricingVersion: pricing.pricingVersion,
      currency,
      country: pricing.country
    }
  };
};

const canUseStatusForOrderType = (status, type) => {
  if (type === 'pdf') {
    return !['print_queued', 'sent_to_printer', 'printed', 'shipped', 'delivered'].includes(status);
  }

  if (type === 'print') {
    return !['pdf_generating', 'pdf_ready'].includes(status);
  }

  return true;
};

const setStatusTimestamps = (payload, status, nowIso) => {
  if (status === 'paid') payload.paid_at = nowIso;
  if (status === 'pdf_ready') payload.pdf_ready_at = nowIso;
  if (status === 'sent_to_printer') payload.sent_to_printer_at = nowIso;
  if (status === 'printed') payload.printed_at = nowIso;
  if (status === 'shipped') payload.shipped_at = nowIso;
  if (status === 'delivered') payload.delivered_at = nowIso;
};

const mergeMetadata = (existingMetadata, nextMetadata) => ({
  ...(existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}),
  ...(nextMetadata && typeof nextMetadata === 'object' ? nextMetadata : {})
});

const ORDER_ALLOWED_TRANSITIONS = {
  draft: new Set(['awaiting_payment', 'cancelled', 'failed']),
  awaiting_payment: new Set(['paid', 'cancelled', 'failed']),
  // 'sent_to_printer' directement depuis 'paid' : l'envoi a l'imprimeur part
  // tout seul apres le paiement et fait desormais avancer la commande
  // lui-meme (voir gelatoOrderService). 'print_queued' reste accepte pour
  // les commandes anterieures.
  paid: new Set(['pdf_generating', 'pdf_ready', 'print_queued', 'sent_to_printer', 'cancelled', 'failed']),
  pdf_generating: new Set(['pdf_ready', 'failed', 'cancelled']),
  pdf_ready: new Set(['print_queued', 'sent_to_printer', 'printed', 'shipped', 'delivered']),
  print_queued: new Set(['sent_to_printer', 'failed']),
  sent_to_printer: new Set(['printed', 'failed']),
  printed: new Set(['shipped', 'failed']),
  shipped: new Set(['delivered', 'failed']),
  delivered: new Set([]),
  cancelled: new Set([]),
  failed: new Set(['pdf_generating', 'print_queued', 'cancelled'])
};

const canTransitionOrderStatus = (currentStatus, nextStatus) => {
  const from = String(currentStatus || '').trim().toLowerCase();
  const to = String(nextStatus || '').trim().toLowerCase();
  if (!from || !to) return false;
  if (from === to) return true;
  if (to === 'pdf_generating' && ORDER_STATUS_PAID_OR_AFTER.has(from)) {
    return true;
  }
  const allowedTargets = ORDER_ALLOWED_TRANSITIONS[from];
  return Boolean(allowedTargets?.has(to));
};

const normalizeStripeEventIds = (metadata) => {
  const candidate = metadata && typeof metadata === 'object'
    ? metadata.stripeEventIds
    : null;
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate
    .map((value) => cleanString(String(value || ''), 180))
    .filter(Boolean)
    .slice(-MAX_STRIPE_EVENT_IDS);
};

const appendStripeEventIdToMetadata = (metadata, eventId) => {
  const normalizedEventId = cleanString(String(eventId || ''), 180);
  const eventIds = normalizeStripeEventIds(metadata);
  if (!normalizedEventId) {
    return eventIds;
  }
  if (eventIds.includes(normalizedEventId)) {
    return eventIds;
  }
  return [...eventIds, normalizedEventId].slice(-MAX_STRIPE_EVENT_IDS);
};

const resolveOrderByStripeSession = async ({ db, session, ownerIdHint = '' }) => {
  const metadataOrderId = cleanString(String(session?.metadata?.orderId || ''), 120);
  const metadataOwnerId = cleanString(String(session?.metadata?.ownerId || ownerIdHint || ''), 120);

  if (metadataOrderId && metadataOwnerId) {
    const { data: directOrder, error: directOrderError } = await db
      .from('orders')
      .select('*')
      .eq('id', metadataOrderId)
      .eq('owner_id', metadataOwnerId)
      .maybeSingle();

    if (!directOrderError && directOrder) {
      return directOrder;
    }
  }

  if (metadataOrderId) {
    const { data: idOnlyOrder, error: idOnlyOrderError } = await db
      .from('orders')
      .select('*')
      .eq('id', metadataOrderId)
      .maybeSingle();
    if (!idOnlyOrderError && idOnlyOrder) {
      return idOnlyOrder;
    }
  }

  const sessionId = cleanString(String(session?.id || ''), 240);
  if (!sessionId) {
    return null;
  }

  const { data: fallbackOrders, error: fallbackOrdersError } = await db
    .from('orders')
    .select('*')
    .contains('metadata', { stripeCheckoutSessionId: sessionId })
    .order('created_at', { ascending: false })
    .limit(1);

  if (fallbackOrdersError) {
    throw fallbackOrdersError;
  }

  return Array.isArray(fallbackOrders) && fallbackOrders[0]
    ? fallbackOrders[0]
    : null;
};

const persistStripePaymentForOrder = async ({
  db,
  order,
  session,
  source = 'confirm',
  eventId = ''
}) => {
  const nowIso = getNowIso();
  const normalizedOrderStatus = String(order?.status || '').toLowerCase();
  const normalizedPaymentStatus = String(session?.payment_status || '').toLowerCase();
  if (normalizedPaymentStatus !== 'paid') {
    const error = new Error('Paiement Stripe non confirme');
    error.status = 409;
    throw error;
  }

  const normalizedEventId = cleanString(String(eventId || ''), 180);
  const existingEventIds = normalizeStripeEventIds(order?.metadata);
  const eventAlreadyProcessed = Boolean(
    normalizedEventId
    && existingEventIds.includes(normalizedEventId)
    && ORDER_STATUS_PAID_OR_AFTER.has(normalizedOrderStatus)
    && String(order?.metadata?.stripePaymentStatus || '').toLowerCase() === 'paid'
  );
  if (eventAlreadyProcessed) {
    return order;
  }

  const nextMetadata = mergeMetadata(order?.metadata, {
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent || null,
    stripePaymentStatus: session.payment_status,
    stripeConfirmedAt: nowIso,
    stripeConfirmationSource: source
  });
  nextMetadata.stripeEventIds = appendStripeEventIdToMetadata(nextMetadata, normalizedEventId);

  const updatePayload = {
    metadata: nextMetadata,
    updated_at: nowIso
  };
  if (['draft', 'awaiting_payment'].includes(normalizedOrderStatus)) {
    updatePayload.status = 'paid';
    updatePayload.payment_reference = cleanString(String(session.payment_intent || session.id), 120);
    updatePayload.paid_at = nowIso;
  }

  const { data: updatedOrder, error: updateError } = await db
    .from('orders')
    .update(updatePayload)
    .eq('id', order.id)
    .eq('owner_id', order.owner_id)
    .select('*')
    .single();

  if (updateError || !updatedOrder) {
    throw updateError || new Error('Impossible de mettre a jour la commande');
  }

  // Verrouille le livre des le TOUT PREMIER paiement reussi (retour
  // utilisateur, 2026-09-28 — voir sql/phase24_book_payment_lock.sql) :
  // rien n'empechait avant ca d'ajouter des pages apres coup, alors que le
  // fichier d'impression suit le livre au moment de l'envoi a Gelato, pas
  // au moment du paiement. `.is('locked_at', null)` rend l'ecriture
  // idempotente (n'ecrase jamais une date de verrouillage deja posee par un
  // paiement precedent) et jamais bloquante pour la reponse au paiement.
  if (updatePayload.status === 'paid' && updatedOrder.book_id) {
    db.from('books')
      .update({ locked_at: nowIso })
      .eq('id', updatedOrder.book_id)
      .is('locked_at', null)
      .then(() => {}, (error) => {
        console.error('Verrouillage du livre apres paiement impossible :', error?.message || error);
      });
  }

  return updatedOrder;
};

// Declenche la soumission Gelato pour une commande Impression/Pack qui
// vient d'etre payee — jamais bloquant pour la reponse HTTP (fire-and-forget,
// meme principe que la generation PDF existante plus bas dans ce fichier
// cote frontend) : idempotent via gelatoOrderService (verifie
// order.metadata.gelatoOrderId), donc sans risque a appeler plusieurs fois
// pour la meme commande (webhook + route de confirmation peuvent toutes
// deux declencher ce chemin). N'agit que sur 'print'/'pack' — jamais 'pdf'.
// LE MEME VERROU QUE L ENVOI MANUEL.
//
// Il y avait DEUX chemins vers l imprimeur : le bouton « envoi de test »,
// verrouille et consigne au journal, et celui-ci, declenche par la
// confirmation de paiement — sans verrou et sans trace.
//
// Le 2026-09-19, les deux ont tourne en parallele sur la meme commande :
// Gelato a recu DEUX brouillons (bd63c9ef a 20:54:43, b4ac19b5 a 20:55:26)
// pour CMD-260919-MU8V6KLU-528, et notre journal n'en connaissait qu un.
// Le second etait invisible. En mode facturable, ce serait deux livres
// imprimes et deux factures.
//
// Un seul verrou pour les deux chemins, et une trace dans les deux cas.
// Une seule nouvelle tentative automatique (meme principe et meme limite
// que PDF_EXPORT_MAX_ATTEMPTS, routes/books.js, retour utilisateur
// 2026-09-27 : "une nouvelle tentative automatique, un statut explicite, et
// une alerte, pas un echec silencieux"). Un envoi Gelato est couteux (rendu
// des pages + televersement d'un fichier de plusieurs dizaines de Mo) : une
// cause structurelle (adresse invalide, catalogue Gelato indisponible) ne
// sera pas resolue par un deuxieme essai identique, mais une cause
// transitoire (reseau, API Gelato indisponible un instant) a de bonnes
// chances de passer. Sans risque de doublon : submitPrintOrderToGelato est
// idempotente (voir son commentaire d'en-tete et le correctif du
// 2026-09-30 qui couvre aussi l'echec juste apres une creation reussie).
const GELATO_SUBMIT_MAX_ATTEMPTS = 2;

const triggerGelatoSubmissionIfNeeded = ({ db, order, ownerEmail }) => {
  const type = String(order?.type || '').toLowerCase();
  if (type !== 'print' && type !== 'pack') return;

  if (gelatoSubmissionsEnCours.has(order.id)) {
    console.log(`Soumission Gelato deja en cours pour la commande ${order.id} : on ne relance pas.`);
    logEvent({
      type: 'gelato.submit.skipped',
      level: 'warn',
      actor: ownerEmail,
      orderId: order.id,
      bookId: order.book_id,
      message: 'Envoi a l\'imprimeur ignore : un envoi est deja en cours',
      metadata: { raison: 'verrou' }
    });
    return;
  }

  gelatoSubmissionsEnCours.set(order.id, {
    debutLe: getNowIso(),
    demandeur: ownerEmail || null,
    bookId: order.book_id || null
  });

  logEvent({
    type: 'gelato.submit.started',
    actor: ownerEmail,
    orderId: order.id,
    bookId: order.book_id,
    message: 'Envoi a l\'imprimeur declenche par le paiement',
    metadata: { origine: 'paiement' }
  });

  (async () => {
    try {
      const { data: book, error: bookError } = await db
        .from('books')
        .select('*')
        .eq('id', order.book_id)
        .single();
      if (bookError || !book) {
        console.error('Soumission Gelato: livre introuvable pour la commande', order.id);
        return;
      }

      let result = null;
      for (let tentative = 1; tentative <= GELATO_SUBMIT_MAX_ATTEMPTS; tentative += 1) {
        // eslint-disable-next-line no-await-in-loop
        result = await submitPrintOrderToGelato({ db: supabase, book, order, ownerEmail });
        if (!result.error) break;
        console.error(`Soumission Gelato echouee (tentative ${tentative}/${GELATO_SUBMIT_MAX_ATTEMPTS}) pour la commande`, order.id, ':', result.error);
      }

      if (result.error) {
        logEvent({
          type: 'gelato.submit.failed',
          level: 'error',
          actor: ownerEmail,
          orderId: order.id,
          bookId: order.book_id,
          message: 'Envoi a l\'imprimeur echoue (declenche par le paiement)',
          metadata: { origine: 'paiement', erreur: String(result.error).slice(0, 300), tentatives: GELATO_SUBMIT_MAX_ATTEMPTS }
        });

        // Alerte admin (meme principe que PDF_EXPORT_MAX_ATTEMPTS,
        // routes/books.js) : jamais bloquante (voir REGLE ABSOLUE en tete de
        // transactionalEmails.js), et la commande reste "payee" — elle n'a
        // simplement pas ete transmise, une nouvelle tentative reste
        // possible sans creer de doublon chez Gelato (voir gelatoOrderCree
        // dans gelatoOrderService.js).
        try {
          await emails.envoyerAlerteAdmin({
            sujet: `Envoi imprimeur echoue - commande ${order.order_number || order.id}`,
            lignes: [
              `L'envoi chez Gelato n'a pas abouti apres ${GELATO_SUBMIT_MAX_ATTEMPTS} tentative(s).`,
              'La commande reste "payee", sans fichier chez l\'imprimeur.'
            ],
            details: [
              ['Commande', order.order_number || order.id],
              ['orderId', order.id],
              ['bookId', order.book_id],
              ['Erreur', String(result.error).slice(0, 300)]
            ]
          });
        } catch (alertError) {
          console.error('Erreur alerte admin envoi Gelato echoue:', alertError.message);
        }
      } else if (!result.skipped) {
        console.log(`Commande Gelato ${result.gelatoOrderType} creee (${result.gelatoOrderId}) pour la commande Celebrons ${order.id}`);
        logEvent({
          type: 'gelato.submitted',
          actor: ownerEmail,
          orderId: order.id,
          bookId: order.book_id,
          message: `Fichier depose chez Gelato (${result.gelatoOrderType})`,
          metadata: { origine: 'paiement', gelatoOrderId: result.gelatoOrderId, gelatoOrderType: result.gelatoOrderType }
        });
      }
    } catch (error) {
      console.error('Erreur inattendue lors de la soumission Gelato pour la commande', order.id, ':', error.message);
      logEvent({
        type: 'gelato.submit.failed',
        level: 'error',
        actor: ownerEmail,
        orderId: order.id,
        bookId: order.book_id,
        message: 'Envoi a l\'imprimeur interrompu (declenche par le paiement)',
        metadata: { origine: 'paiement', erreur: String(error.message).slice(0, 300) }
      });
    } finally {
      // TOUJOURS relacher, quelle que soit l'issue. Un verrou pris et jamais
      // rendu bloquerait tout envoi ulterieur sur cette commande jusqu'au
      // redemarrage du serveur — un remede pire que le mal qu'il soigne.
      gelatoSubmissionsEnCours.delete(order.id);
    }
  })();
};

// Emet la facture d'une commande qui vient d'etre payee et l'envoie par
// email (PDF en piece jointe) — jamais bloquant pour la reponse HTTP (meme
// principe que triggerGelatoSubmissionIfNeeded juste au-dessus). Sans verrou
// en memoire ici : generateInvoiceForOrder est deja idempotente par
// elle-meme (verification + contrainte UNIQUE en base sur invoices.order_id,
// voir invoiceService.js) — appelable sans risque depuis le webhook Stripe
// ET la route de confirmation navigateur, qui peuvent toutes deux declencher
// ce chemin pour la meme commande.
const triggerInvoiceIfNeeded = ({ order, ownerEmail }) => {
  if (!order?.id) return;

  (async () => {
    try {
      const invoice = await generateInvoiceForOrder(order);
      // invoice._pdfBuffer n'existe que lorsque CET appel vient d'emettre la
      // facture (voir invoiceService.js) : une facture deja existante
      // (relecture idempotente) n'a pas de buffer joint, et on n'a alors
      // rien de plus a envoyer — l'email est deja parti lors de l'emission
      // d'origine.
      if (!invoice?._pdfBuffer) return;

      const resultat = await emails.envoyerFacture({ order, invoice, pdfBuffer: invoice._pdfBuffer, ownerEmail });
      if (!resultat.sent && resultat.skipped !== 'destinataire_inconnu') {
        console.error(`Envoi de la facture ${invoice.invoice_number} echoue pour la commande ${order.id} :`, resultat.error || resultat.skipped);
        logEvent({
          type: 'invoice.email.failed',
          level: 'error',
          actor: ownerEmail,
          orderId: order.id,
          message: `Facture ${invoice.invoice_number} generee mais non envoyee par email`,
          metadata: { erreur: String(resultat.error || resultat.skipped).slice(0, 300) }
        });
      }
    } catch (error) {
      console.error('Emission de facture impossible pour la commande', order.id, ':', error.message);
      logEvent({
        type: 'invoice.failed',
        level: 'error',
        actor: ownerEmail,
        orderId: order.id,
        message: 'Emission de facture impossible',
        metadata: { erreur: String(error.message).slice(0, 300) }
      });
    }
  })();
};

// POST /api/orders/:orderId/gelato-test
// Envoi MANUEL d'une commande a Gelato en mode test, SANS paiement
// prealable (2026-09-11, demande utilisateur : pouvoir tester en ligne sur
// Render avec de vraies photos). Reutilise exactement le meme service que
// le chemin de production (gelatoOrderService.submitPrintOrderToGelato,
// donc le meme fichier d'impression valide a 0 erreur par l'outil Gelato)
// — jamais un second pipeline en parallele.
//
// SECURITE : refuse net si GELATO_LIVE_ORDERS === '1'. Dans ce cas, une
// soumission creerait une VRAIE commande facturee/imprimee : cette route
// de test ne doit jamais pouvoir declencher ca par inadvertance. Sinon,
// gelatoOrderService produit un brouillon (orderType:'draft') : visible
// dans le tableau de bord Gelato, jamais facture ni imprime.
router.post('/:orderId/gelato-test', authenticate, async (req, res) => {
  try {
    if (isGelatoLiveOrdersEnabled()) {
      return res.status(409).json({
        error: t(req, "GELATO_LIVE_ORDERS=1 : le mode production est actif, l'envoi de test est desactive pour ne pas creer une vraie commande facturee.", 'GELATO_LIVE_ORDERS=1: production mode is active, the test send is disabled so as not to create a real billed order.')
      });
    }

    if (gelatoSubmissionsEnCours.has(req.params.orderId)) {
      return res.status(409).json({
        error: t(req, "Un envoi a l'imprimeur est deja en cours pour cette commande. Attendez qu'il se termine.", 'A submission to the printer is already in progress for this order. Wait for it to finish.')
      });
    }

    const db = createUserScopedClient(req);
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: t(req, 'Commande introuvable', 'Order not found') });
    }

    const type = String(order.type || '').toLowerCase();
    if (type !== 'print' && type !== 'pack') {
      return res.status(400).json({ error: t(req, "Seules les commandes Impression ou Pack peuvent etre envoyees a l'imprimeur.", 'Only Print or Pack orders can be sent to the printer.') });
    }
    if (!isAddressValid(order.shipping_address)) {
      return res.status(400).json({ error: t(req, 'Adresse de livraison incomplete : Gelato la refuserait.', 'Incomplete shipping address: Gelato would reject it.') });
    }

    const { data: book, error: bookError } = await db
      .from('books')
      .select('*')
      .eq('id', order.book_id)
      .single();
    if (bookError || !book) {
      return res.status(404).json({ error: t(req, 'Livre introuvable', 'Book not found') });
    }

    // Deja envoye ? L'idempotence de gelatoOrderService est indexee sur la
    // COMMANDE, alors que le format d'impression vit sur le LIVRE : apres un
    // changement de format (ou toute modification du livre), renvoyer un test
    // est precisement ce qu'on veut — sinon l'utilisateur recoit "deja
    // envoye" et ne peut plus rien tester (retour utilisateur 2026-09-11).
    //
    // Un BROUILLON est donc rejouable ; une vraie commande (issue du chemin
    // paiement, orderType 'order') ne l'est JAMAIS : la reprendre
    // reimprimerait et refacturerait.
    const previousGelatoOrderId = order.metadata?.gelatoOrderId || null;
    const previousOrderType = order.metadata?.gelatoOrderType || 'draft';

    if (previousGelatoOrderId && previousOrderType !== 'draft') {
      return res.json({
        status: 'done',
        skipped: true,
        gelatoOrderId: previousGelatoOrderId,
        gelatoOrderType: previousOrderType
      });
    }

    // LE MENAGE NE BLOQUE PLUS LA REPONSE.
    //
    // Supprimer le brouillon precedent est un appel RESEAU a Gelato. Il
    // etait attendu avant de repondre au client : quand Gelato tardait,
    // le navigateur abandonnait au bout de quinze secondes avec « le
    // serveur met trop de temps a repondre » et l envoi paraissait
    // echoue, alors qu'il n'avait meme pas commence (2026-09-19).
    //
    // C'est du best effort : le pire cas est un brouillon orphelin dans
    // le tableau de bord Gelato, sans consequence. Ca n'a rien a faire
    // sur le chemin critique.
    if (previousGelatoOrderId) {
      gelatoClient.deleteOrder(previousGelatoOrderId).catch((error) => {
        console.warn('Suppression du brouillon Gelato precedent impossible', previousGelatoOrderId, ':', error.message);
      });
    }

    // ASYNCHRONE, volontairement (mesure 2026-09-11 : ~15 s par page pour
    // la capture haute resolution, soit plusieurs MINUTES pour un livre
    // complet). Attendre la fin dans la reponse HTTP ferait expirer la
    // requete cote navigateur et cote proxy Render, alors meme que le
    // serveur finit correctement son travail. On marque donc le depart,
    // on repond tout de suite, et le client suit l'avancement en relisant
    // la commande (meme principe que l'export PDF deja en place).
    const startedAt = getNowIso();
    const initialProgress = { phase: 'starting', done: 0, total: 0, updatedAt: startedAt };

    // Prix RECALCULE sur l'etat actuel du livre (2026-09-11, demande
    // utilisateur : "il faut recalculer et renvoyer avec le vrai prix meme
    // pour le test"). Le produit envoye a Gelato est resolu depuis
    // book.print_format au moment de l'envoi : sans ce recalcul, une
    // commande testee apres un changement de format afficherait encore le
    // prix et la pagination de l'ancien format — incoherent avec ce qui
    // part reellement en production. Meme fonction que la creation de
    // commande (computeOrderPricing), jamais un second calcul parallele.
    const refreshedPricing = computeOrderPricing({
      book,
      type,
      quantity: order.quantity || 1
    });

    // JAMAIS pour une commande DEJA PAYEE (retour utilisateur, 2026-09-28) :
    // ce recalcul a ete pense pour un BROUILLON qu'on peut retester
    // librement, pas pour reecrire ce que Stripe a reellement encaisse. Sans
    // ce garde-fou, unit_cents/total_cents (et le snapshot fige a la
    // commande) divergeaient silencieusement du montant paye des le premier
    // envoi de test suivant un paiement — une facture qui en decoulerait
    // aurait alors ete fausse. Le prix stocke reste donc intact pour une
    // commande payee ; seules les metadonnees liees a l'envoi Gelato
    // (gelatoOrderId, progression...) continuent d'etre mises a jour.
    const estDejaPayee = ORDER_STATUS_PAID_OR_AFTER.has(String(order.status || '').toLowerCase());

    // Metadonnees remises a zero pour ce nouvel essai : sans effacer
    // gelatoOrderId, le garde-fou d'idempotence de gelatoOrderService
    // court-circuiterait immediatement la soumission. L'ancien brouillon est
    // ARCHIVE (jamais perdu silencieusement) : utile pour retrouver ce qui a
    // ete envoye lors des essais precedents.
    const previousDrafts = Array.isArray(order.metadata?.gelatoPreviousDrafts)
      ? order.metadata.gelatoPreviousDrafts
      : [];
    const baseMetadata = {
      ...(order.metadata || {}),
      gelatoOrderId: null,
      gelatoOrderType: null,
      gelatoFileUrl: null,
      gelatoError: null,
      gelatoTestStartedAt: startedAt,
      ...(previousGelatoOrderId
        ? {
          gelatoPreviousDrafts: [
            ...previousDrafts,
            { gelatoOrderId: previousGelatoOrderId, replacedAt: startedAt, printFormat: book.print_format }
          ]
        }
        : {})
    };

    await supabase
      .from('orders')
      .update({
        // Le prix et l'instantane suivent le livre reellement envoye — mais
        // UNIQUEMENT tant que rien n'a ete paye (voir estDejaPayee ci-dessus).
        ...(estDejaPayee ? {} : {
          unit_cents: refreshedPricing.unitCents,
          total_cents: refreshedPricing.totalCents,
          quantity: refreshedPricing.quantity,
          snapshot: {
            ...(order.snapshot || {}),
            printFormat: book.print_format || 'standard',
            pages: Number(book.page_count || 0) || null,
            repricedAt: startedAt
          }
        }),
        metadata: {
          ...baseMetadata,
          ...(estDejaPayee ? {} : { pricing: refreshedPricing.breakdown }),
          gelatoProgress: initialProgress
        },
        updated_at: startedAt
      })
      .eq('id', order.id);

    // L'objet transmis au service doit refleter ce reset, sinon il verrait
    // encore l'ancien gelatoOrderId (il recoit `order`, pas la ligne relue).
    const orderForSubmission = { ...order, metadata: baseMetadata };

    // Progression persistee en base : c'est le seul moyen pour le client de
    // suivre un travail qui dure plusieurs minutes dans un processus
    // detache. Ecriture "au fil de l'eau" mais peu frequente en pratique
    // (une page rendue toutes les ~15 s), donc pas de limitation
    // supplementaire necessaire. Jamais bloquant : une ecriture de
    // progression qui echoue ne doit pas interrompre la generation.
    const writeProgress = (progress) => {
      supabase
        .from('orders')
        .update({
          metadata: {
            ...baseMetadata,
            ...(estDejaPayee ? {} : { pricing: refreshedPricing.breakdown }),
            gelatoProgress: { ...progress, updatedAt: getNowIso() }
          }
        })
        .eq('id', order.id)
        .then(() => {}, () => {});
    };

    // Le verrou est pris AVANT de repondre et relache dans le `finally` du
    // travail detache : il couvre donc toute la duree du rendu (plusieurs
    // minutes), pas seulement celle de la requete HTTP.
    gelatoSubmissionsEnCours.set(order.id, {
      debutLe: startedAt,
      demandeur: req.user.email || null,
      bookId: order.book_id || null
    });
    logEvent({
      type: 'gelato.submit.started',
      actor: req.user.email,
      orderId: order.id,
      bookId: order.book_id,
      ownerId: order.owner_id,
      message: 'Envoi a l\'imprimeur demande',
      metadata: { format: book.print_format, pages: book.page_count }
    });

    (async () => {
      try {
        const result = await submitPrintOrderToGelato({
          db: supabase, book, order: orderForSubmission, ownerEmail: req.user.email, onProgress: writeProgress
        });
        if (result.error) {
          console.error('Envoi de test Gelato echoue pour la commande', order.id, ':', result.error);
          logEvent({
            type: 'gelato.submit.failed',
            level: 'error',
            actor: req.user.email,
            orderId: order.id,
            bookId: order.book_id,
            ownerId: order.owner_id,
            message: 'Envoi a l\'imprimeur echoue',
            metadata: { erreur: String(result.error).slice(0, 300) }
          });
        } else {
          console.log(`Envoi de test Gelato : brouillon ${result.gelatoOrderId} cree pour la commande ${order.id}`);
          logEvent({
            type: 'gelato.submitted',
            actor: req.user.email,
            orderId: order.id,
            bookId: order.book_id,
            ownerId: order.owner_id,
            message: `Fichier depose chez Gelato (${result.gelatoOrderType})`,
            metadata: { gelatoOrderId: result.gelatoOrderId, gelatoOrderType: result.gelatoOrderType }
          });
        }
      } catch (error) {
        console.error('Erreur inattendue lors de l\'envoi de test Gelato', order.id, ':', error.message);

        // AU JOURNAL AUSSI. Seul un echec RENVOYE par submitPrintOrder
        // etait consigne ; une exception ne laissait rien. Le 2026-09-19,
        // trois envois ont demarre sans qu aucun resultat n apparaisse :
        // impossible de savoir, depuis l application, ce qui les avait
        // interrompus.
        logEvent({
          type: 'gelato.submit.failed',
          level: 'error',
          actor: req.user.email,
          orderId: order.id,
          bookId: order.book_id,
          ownerId: order.owner_id,
          message: 'Envoi a l\'imprimeur interrompu',
          metadata: { erreur: String(error.message).slice(0, 300) }
        });

        await supabase
          .from('orders')
          .update({ metadata: { ...(order.metadata || {}), gelatoError: error.message }, updated_at: getNowIso() })
          .eq('id', order.id);
      } finally {
        gelatoSubmissionsEnCours.delete(order.id);
      }
    })();

    return res.status(202).json({ status: 'started', startedAt });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/:orderId/tracking
// Suivi REEL de production (2026-09-11) : interroge Gelato pour savoir ou en
// est vraiment la commande (en production / imprimee / expediee + numero de
// suivi), la ou l'application se contentait jusqu'ici d'afficher un statut
// local qui n'avancait jamais tout seul pour une commande imprimee.
//
// Deux garanties :
//  - le statut n'est persiste QUE s'il AVANCE (comparaison via
//    ORDER_STATUS_SEQUENCE) : un aller-retour d'API ne peut jamais faire
//    reculer une commande deja expediee ;
//  - jamais bloquant : si Gelato est injoignable ou renvoie un statut
//    inconnu, on renvoie le dernier etat connu avec `stale: true` plutot
//    qu'une erreur (l'ecran de suivi doit toujours afficher quelque chose).
router.get('/:orderId/tracking', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req);
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: t(req, 'Commande introuvable', 'Order not found') });
    }

    const gelatoOrderId = order.metadata?.gelatoOrderId || null;
    // DIRE QUE C'EST PARTI CHEZ L'IMPRIMEUR (2026-09-20).
    //
    // L'ecran de suivi ne montrait qu'un statut : rien ne disait que le
    // livre avait ete transmis, ni quand, ni sous quel numero — « aujourd'hui
    // on ne sait pas que ca a ete envoye ». Ces trois informations existaient
    // deja en base (posees par gelatoOrderService) mais ne sortaient jamais
    // de la reponse.
    const localState = {
      status: order.status,
      gelatoOrderId,
      gelatoStatus: order.metadata?.gelatoFulfillmentStatus || null,
      gelatoSubmittedAt: order.metadata?.gelatoSubmittedAt || null,
      gelatoError: order.metadata?.gelatoError || null,
      tracking: order.metadata?.tracking || { carrier: null, code: null, url: null },
      delivery: order.metadata?.delivery || { minDate: null, maxDate: null },
      updatedAt: order.updated_at || null
    };

    // Commande PDF, ou impression pas encore soumise a l'imprimeur : rien a
    // demander a Gelato, l'etat local EST l'etat reel.
    if (!gelatoOrderId) {
      return res.json({ ...localState, source: 'local', stale: false });
    }

    let gelatoOrder = null;
    // UN 404 N'EST PAS UNE PANNE : c'est Gelato qui dit que cette commande
    // n'existe plus. Constate le 2026-09-30 sur une vraie commande (brouillon
    // supprime depuis le tableau de bord Gelato pour tester le parcours
    // d'annulation) : getOrder renvoyait 404, et jusqu'ici CETTE reponse
    // prenait le meme chemin qu'un reseau indisponible — « stale: true » —
    // et l'ecran de suivi restait fige indefiniment sur le dernier statut
    // connu, sans jamais dire que le livre n'etait plus chez l'imprimeur.
    let supprimeeChezGelato = false;
    try {
      gelatoOrder = await gelatoClient.getOrder(gelatoOrderId);
    } catch (error) {
      if (error.status === 404) {
        supprimeeChezGelato = true;
      } else {
        console.error('Suivi Gelato indisponible pour la commande', order.id, ':', error.message);
        return res.json({ ...localState, source: 'cache', stale: true });
      }
    }

    const rawStatus = supprimeeChezGelato ? 'canceled' : gelatoTracking.readGelatoFulfillmentStatus(gelatoOrder);
    const mappedStatus = gelatoTracking.mapGelatoStatus(rawStatus);
    const tracking = supprimeeChezGelato ? localState.tracking : gelatoTracking.extractTracking(gelatoOrder);
    const delivery = supprimeeChezGelato ? localState.delivery : gelatoTracking.extractDelivery(gelatoOrder);

    // Avancee seulement : un statut inconnu (mappedStatus null) ou anterieur
    // laisse la commande exactement ou elle est. EXCEPTION explicite pour
    // annulation/echec : `cancelled`/`failed` sont hors sequence a dessein
    // (ce ne sont pas des etapes d'avancement, voir ORDER_STATUS_SEQUENCE
    // plus haut) et un rang de -1 les faisait donc TOUJOURS rejeter, quel
    // que soit l'etat courant — la commande ci-dessus restait « Envoye a
    // l'imprimeur » alors que Gelato l'avait supprimee. Jamais applique
    // si la commande a deja atteint un etat definitif (ORDER_STATUS_TERMINAL) :
    // un livre deja livre ne redevient pas « annule » sur un B403/404 tardif.
    const currentRank = ORDER_STATUS_SEQUENCE.indexOf(order.status);
    const nextRank = mappedStatus ? ORDER_STATUS_SEQUENCE.indexOf(mappedStatus) : -1;
    const estAnnulationOuEchec = mappedStatus === 'cancelled' || mappedStatus === 'failed';
    const shouldAdvance = Boolean(mappedStatus) && !ORDER_STATUS_TERMINAL.has(order.status) && (
      estAnnulationOuEchec || (nextRank > -1 && nextRank > currentRank)
    );

    // Un brouillon confirme depuis le tableau de bord Gelato devient une
    // vraie commande sans que notre base le sache. On enregistre donc le
    // type REEL a chaque consultation du suivi — jamais a l'envers : une
    // commande devenue `order` ne peut plus redevenir `draft` chez nous,
    // sinon une reponse inattendue desarmerait la protection.
    const typeReel = supprimeeChezGelato ? null : gelatoTracking.readGelatoOrderType(gelatoOrder);
    const typeConnu = order.metadata?.gelatoOrderType || null;
    const typeRetenu = typeConnu === 'order' ? 'order' : (typeReel || typeConnu);

    const nowIso = getNowIso();
    const nextMetadata = {
      ...(order.metadata || {}),
      gelatoFulfillmentStatus: rawStatus || null,
      gelatoOrderType: typeRetenu,
      gelatoCheckedAt: nowIso,
      tracking,
      delivery,
      // Trace distincte du cas 404 : un vrai statut "canceled" renvoye par
      // Gelato et une suppression constatee via 404 aboutissent au meme
      // mappedStatus ('cancelled'), mais seule cette valeur dit COMMENT on
      // l'a su — utile pour comprendre un statut annule sans reponse Gelato
      // correspondante dans le journal.
      ...(supprimeeChezGelato ? { gelatoDeletedAt: nowIso } : {})
    };

    if (shouldAdvance) {
      logEvent({
        type: 'status.changed',
        actor: 'gelato',
        orderId: order.id,
        bookId: order.book_id,
        ownerId: order.owner_id,
        message: supprimeeChezGelato
          ? `Commande supprimee chez Gelato (404) : statut ${order.status} -> cancelled`
          : `Statut : ${order.status} -> ${mappedStatus}`,
        metadata: {
          avant: order.status,
          apres: mappedStatus,
          source: 'gelato',
          gelatoStatus: rawStatus,
          supprimeeChezGelato,
          // Qui regardait le suivi au moment ou Gelato a repondu.
          consulteePar: req.user.email || null
        }
      });
    }

    const { data: updated } = await supabase
      .from('orders')
      .update({
        ...(shouldAdvance ? { status: mappedStatus } : {}),
        metadata: nextMetadata,
        updated_at: nowIso
      })
      .eq('id', order.id)
      .select('*')
      .single();

    return res.json({
      status: updated?.status || (shouldAdvance ? mappedStatus : order.status),
      gelatoOrderId,
      gelatoStatus: rawStatus || null,
      // Signale explicitement un statut que nous ne savons pas traduire :
      // l'ecran affiche alors la chaine brute plutot que d'inventer.
      gelatoStatusUnknown: Boolean(rawStatus && !mappedStatus),
      gelatoSubmittedAt: order.metadata?.gelatoSubmittedAt || null,
      gelatoError: null,
      tracking,
      delivery,
      updatedAt: nowIso,
      source: 'gelato',
      stale: false
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/:orderId/invoice
// URL signee (courte duree) de la facture, si elle existe deja — jamais
// generee ici (la generation part uniquement du paiement, voir
// triggerInvoiceIfNeeded). 404 explicite tant qu'aucune facture n'existe :
// laisse au frontend le choix d'afficher "pas encore disponible" plutot que
// d'echouer silencieusement.
router.get('/:orderId/invoice', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req);
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('id')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();
    if (orderError || !order) {
      return res.status(404).json({ error: t(req, 'Commande introuvable', 'Order not found') });
    }

    // RLS (invoices_owner_select) garantit deja qu'on ne peut lire QUE ses
    // propres factures ; la verification de commande ci-dessus reste la
    // premiere ligne de defense, la plus lisible.
    const { data: invoice, error: invoiceError } = await db
      .from('invoices')
      .select('invoice_number, issued_at, storage_path, totals')
      .eq('order_id', order.id)
      .maybeSingle();
    if (invoiceError || !invoice || !invoice.storage_path) {
      return res.status(404).json({ error: t(req, 'Aucune facture disponible pour cette commande.', 'No invoice available for this order.') });
    }

    const url = await signedInvoiceUrl(invoice.storage_path);
    return res.json({
      invoiceNumber: invoice.invoice_number,
      issuedAt: invoice.issued_at,
      totalCents: invoice.totals?.totalCents ?? null,
      url
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/gelato/status
// Le frontend a besoin de savoir si l'envoi de test est possible (cle API
// configuree, mode production desactive) pour n'afficher le bouton que
// quand il peut reellement servir — jamais un bouton qui echouera a coup sur.
router.get('/gelato/status', authenticate, (_req, res) => {
  res.json({
    configured: Boolean(process.env.GELATO_API_KEY),
    liveOrders: isGelatoLiveOrdersEnabled(),
    testAvailable: Boolean(process.env.GELATO_API_KEY) && !isGelatoLiveOrdersEnabled()
  });
});

const isForwardLifecycleTransition = (currentStatus, nextStatus) => (
  getLifecycleRank(nextStatus) >= getLifecycleRank(currentStatus)
);

const syncBookLifecycleFromOrder = async ({ db, ownerId, bookId, orderStatus }) => {
  const lifecycleTarget = STATUS_TO_BOOK_LIFECYCLE[orderStatus];
  if (!lifecycleTarget) return;

  const { data: book, error: bookError } = await db
    .from('books')
    .select('id, owner_id, cover_config, lifecycle_status, production_status, statut')
    .eq('id', bookId)
    .eq('owner_id', ownerId)
    .single();

  if (bookError || !book) return;

  const coverConfig = book.cover_config && typeof book.cover_config === 'object'
    ? { ...book.cover_config }
    : {};
  const currentLifecycle = getBookLifecycleStatusFromBook(book);
  if (!isForwardLifecycleTransition(currentLifecycle, lifecycleTarget)) return;

  const nowIso = getNowIso();
  coverConfig.lifecycleStatus = lifecycleTarget;
  coverConfig.lifecycleUpdatedAt = nowIso;

  if (lifecycleTarget === 'preview_available' && !coverConfig.previewAvailableAt) {
    coverConfig.previewAvailableAt = nowIso;
  }
  if (lifecycleTarget === 'finalized' && !coverConfig.finalPdfReadyAt) {
    coverConfig.finalPdfReadyAt = nowIso;
  }
  if (lifecycleTarget === 'sent_to_printer' && !coverConfig.sentToPrinterAt) {
    coverConfig.sentToPrinterAt = nowIso;
  }
  if (lifecycleTarget === 'printed' && !coverConfig.printedAt) {
    coverConfig.printedAt = nowIso;
  }
  if (lifecycleTarget === 'shipped' && !coverConfig.shippedAt) {
    coverConfig.shippedAt = nowIso;
  }

  await db
    .from('books')
    .update({ cover_config: coverConfig })
    .eq('id', bookId)
    .eq('owner_id', ownerId);
};

const parseUnsignedWebhookEvent = (rawBody) => {
  const rawText = Buffer.isBuffer(rawBody)
    ? rawBody.toString('utf8')
    : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}));
  const parsed = JSON.parse(rawText || '{}');
  return parsed && typeof parsed === 'object' ? parsed : {};
};

const buildStripeWebhookEvent = (req) => {
  const stripe = ensureStripeClient();
  const signature = req.headers?.['stripe-signature'];

  if (STRIPE_WEBHOOK_SECRET) {
    if (!signature) {
      const error = new Error('Signature Stripe manquante');
      error.status = 400;
      throw error;
    }
    if (!Buffer.isBuffer(req.body)) {
      const error = new Error('Body webhook invalide (Buffer attendu)');
      error.status = 400;
      throw error;
    }
    try {
      return stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (erreurDeSignature) {
      // 400 et non 500. Stripe REESSAIE un evenement pendant trois jours
      // tant qu il recoit une erreur serveur, et affiche « votre serveur a
      // echoue » — alors que la seule chose qui ne va pas est le secret de
      // signature. Un 400 arrete les tentatives et dit la verite : cet
      // evenement-la ne sera jamais accepte tel quel.
      const error = new Error(`Signature Stripe invalide : ${erreurDeSignature.message}`);
      error.status = 400;
      throw error;
    }
  }

  if (!STRIPE_WEBHOOK_ALLOW_UNSIGNED) {
    const error = new Error('Configuration webhook Stripe incomplete (STRIPE_WEBHOOK_SECRET)');
    error.status = 400;
    throw error;
  }

  return parseUnsignedWebhookEvent(req.body);
};

// Enregistre une tentative de paiement Stripe echouee/abandonnee — jamais
// de changement de statut (voir le commentaire au point d'appel), seulement
// un historique sur la commande + une alerte admin. Jamais bloquant pour la
// reponse au webhook : Stripe reessaie un 5xx pendant trois jours, un
// probleme d'enregistrement local ne doit pas provoquer ces relances.
const recordFailedCheckoutSession = async ({ db, session, eventType }) => {
  try {
    if (!session) return;

    const order = await resolveOrderByStripeSession({ db, session });
    if (!order) return; // Aucune commande associee (session de test, etc.) : rien a faire.

    // Une commande DEJA payee ne doit jamais etre re-ouverte par un
    // evenement d'echec arrivant en retard (ex. la session a fini par
    // expirer cote Stripe APRES qu'un paiement reussi ait deja ete traite
    // par un autre evenement) — la tentative qu'on enregistre ici est
    // forcement anterieure a ce paiement reussi.
    if (ORDER_STATUS_PAID_OR_AFTER.has(String(order.status || '').toLowerCase())) {
      return;
    }

    const nowIso = getNowIso();
    const raison = eventType === 'checkout.session.expired' ? 'expired' : 'async_payment_failed';
    const historique = Array.isArray(order.metadata?.paymentFailures) ? order.metadata.paymentFailures : [];
    const nextMetadata = mergeMetadata(order.metadata, {
      // Borne a 10 : une commande jamais finalisee ne doit pas faire
      // grossir cette liste indefiniment si le client re-essaie souvent.
      paymentFailures: [...historique, { at: nowIso, sessionId: session.id || '', reason: raison }].slice(-10)
    });

    await db
      .from('orders')
      .update({ metadata: nextMetadata, updated_at: nowIso })
      .eq('id', order.id);

    await emails.envoyerAlerteAdmin({
      sujet: `Paiement Stripe echoue - commande ${order.order_number || order.id}`,
      lignes: [
        raison === 'expired'
          ? "Le client n'a pas termine son paiement avant l'expiration de la session Stripe (session Checkout non finalisee)."
          : 'Le paiement (methode de paiement asynchrone) a ete refuse par Stripe apres coup.',
        'La commande reste "en attente de paiement" : elle n\'a ete transmise ni au PDF ni a Gelato, et peut etre relancee normalement depuis le compte du client.'
      ],
      details: [
        ['Commande', order.order_number || order.id],
        ['Session Stripe', session.id || '—'],
        ['Raison', raison],
        ['Tentatives echouees enregistrees', String(nextMetadata.paymentFailures.length)]
      ]
    });
  } catch (error) {
    console.error('Erreur enregistrement paiement Stripe echoue:', error);
  }
};

const handleStripeWebhook = async (req, res) => {
  try {
    const event = buildStripeWebhookEvent(req);
    const eventType = cleanString(String(event?.type || ''), 120);

    if (!eventType) {
      return res.status(400).json({ error: 'Evenement Stripe invalide' });
    }

    // Echec/abandon de paiement (retour utilisateur, 2026-09-27 — "une
    // commande dont le paiement echoue ne doit jamais etre envoyee a
    // Gelato, et doit rester dans un etat coherent plutot que bloquee entre
    // deux statuts"). AVANT ce correctif, ces deux evenements etaient
    // simplement ignores (branche isCheckoutCompleted ci-dessous, jamais
    // atteinte pour eux) : la tentative echouee ne laissait aucune trace,
    // ni pour le client ni pour l'equipe.
    //
    // Le statut de la commande, lui, NE CHANGE PAS ICI : elle reste
    // 'awaiting_payment' (ou 'draft'), deja l'etat coherent et deja
    // resumable ('Payer la commande en attente' existe des l'ecran de
    // paiement) — Gelato/le PDF ne sont declenches nulle part avant que
    // payment_status soit reellement 'paid' (voir persistStripePaymentForOrder
    // ci-dessus, et le controle equivalent de la route de confirmation), donc
    // rien de cote n'a jamais pu partir pour une tentative qui echoue. Ce qui
    // manquait etait la VISIBILITE : un historique sur la commande + une
    // alerte, pas un silence qui ressemble a "jamais essaye".
    const isCheckoutFailed = (
      eventType === 'checkout.session.expired'
      || eventType === 'checkout.session.async_payment_failed'
    );
    if (isCheckoutFailed) {
      await recordFailedCheckoutSession({
        db: supabase,
        session: event?.data?.object,
        eventType
      });
      return res.json({ received: true, status: 'payment_failure_recorded' });
    }

    const isCheckoutCompleted = (
      eventType === 'checkout.session.completed'
      || eventType === 'checkout.session.async_payment_succeeded'
    );
    if (!isCheckoutCompleted) {
      return res.json({ received: true, ignored: eventType });
    }

    const session = event?.data?.object;
    if (!session || String(session?.payment_status || '').toLowerCase() !== 'paid') {
      return res.json({ received: true, ignored: 'payment_not_paid' });
    }

    const order = await resolveOrderByStripeSession({
      db: supabase,
      session
    });
    if (!order) {
      return res.status(202).json({
        received: true,
        ignored: 'order_not_found'
      });
    }

    const updatedOrder = await persistStripePaymentForOrder({
      db: supabase,
      order,
      session,
      source: 'webhook',
      eventId: event?.id || ''
    });

    // Webhook = server-side, le point le plus fiable pour declencher la
    // soumission Gelato (independant du navigateur du client, contrairement
    // a la route de confirmation ci-dessous) — voir triggerGelatoSubmissionIfNeeded.
    triggerGelatoSubmissionIfNeeded({ db: supabase, order: updatedOrder });

    // Contrairement a envoyerPaiementRecu juste en dessous, appeler ce
    // chemin depuis les DEUX endroits (ici et la route de confirmation
    // navigateur) est volontaire et sans risque : generateInvoiceForOrder
    // est idempotente par elle-meme (voir triggerInvoiceIfNeeded), donc la
    // facture n'est jamais emise ni envoyee deux fois.
    triggerInvoiceIfNeeded({ order: updatedOrder });

    // Confirmation de paiement, envoyee ICI et nulle part ailleurs.
    //
    // Le webhook est le SEUL point ou le paiement est certain : la route de
    // confirmation cote navigateur peut ne jamais etre atteinte (onglet
    // ferme, reseau coupe) et n'est donc pas une source fiable. Brancher les
    // deux enverrait deux fois le meme email au meme client.
    //
    // Pas d'adresse de compte ici : le webhook n'est pas authentifie. On
    // s'appuie sur l'adresse portee par la commande (voir
    // transactionalEmails.destinataireDe) — si elle manque, rien ne part,
    // plutot qu'un email a une adresse devinee.
    emails.envoyerPaiementRecu({ order: updatedOrder }).catch(() => {});

    return res.json({
      received: true,
      orderId: updatedOrder.id,
      status: updatedOrder.status
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

// GET /api/orders/email/status
// L'envoi d'emails est-il reellement actif ? Repond SANS envoyer quoi que ce
// soit : c'est ce qui permet a l'interface de dire « configure » ou « pas
// encore » sans bruler un email pour le savoir.
router.get('/email/status', authenticate, (req, res) => {
  res.json({
    enabled: emails.isEmailEnabled(),
    from: (process.env.EMAIL_FROM || "").trim() || null,
    siteUrl: emails.siteUrl(),
    // Adresse du compte : ce bouton de test reste volontairement limite a
    // elle (voir la route ci-dessous) — tester plusieurs adresses reelles se
    // fait avec scripts/tester-emails.js, pas depuis l'interface.
    suggestedTo: req.user?.email || null
  });
});

// POST /api/orders/email/test
// Envoie un VRAI email d'essai. Declenche explicitement par l'utilisateur,
// jamais automatiquement : un envoi est irreversible et sort du produit.
//
// Destinataire : l'adresse du compte connecte, et elle seule. Accepter une
// adresse libre ferait de cette route un relais ouvert — on pourrait
// envoyer du courrier a n'importe qui depuis notre domaine. Pour tester
// avec plusieurs vraies adresses (factures/commandes/inscriptions...), voir
// scripts/tester-emails.js --a a@x.fr,b@x.fr,c@x.fr (SSH, pas expose ici).
router.post('/email/test', authenticate, async (req, res) => {
  try {
    const destinataire = req.user?.email;
    if (!destinataire) {
      return res.status(400).json({ error: t(req, "Aucune adresse email connue pour ce compte.", 'No known email address for this account.') });
    }
    if (!emails.isEmailEnabled()) {
      return res.status(422).json({
        error: t(req, "L'envoi d'emails n'est pas configure : posez BREVO_API_KEY dans le fichier .env du backend, puis redemarrez-le.", 'Email sending is not configured: set BREVO_API_KEY in the backend .env file, then restart it.'),
        enabled: false
      });
    }

    const resultat = await emails.envoyerEssai({ to: destinataire, lang: resolveLanguage(req) });
    if (!resultat.sent) {
      return res.status(502).json({ error: resultat.error || resultat.skipped, to: destinataire });
    }
    res.json({ sent: true, to: destinataire, id: resultat.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/formats
// Les trois formats, avec dimensions reelles et prix de depart — a afficher
// AVANT que le livre existe (choix du format dans le parcours de creation).
//
// Pourquoi une route plutot qu'une table recopiee cote client : le prix vient
// de la MEME formule que celui facture a la commande (computeOrderPricing).
// Un tarif recopie dans le navigateur finirait par diverger du prix reel, et
// c'est exactement le genre d'ecart qui se paie en confiance.
//
// Publique (pas de authenticate) : le choix du format arrive avant toute
// session dans le parcours, et il n'y a la aucune donnee personnelle.
//
// `?page_count=` optionnel (retour utilisateur, 2026-09-27, §10) : quand un
// livre existe deja avec une vraie pagination, chaque format renvoie EN PLUS
// son prix a CETTE pagination (currentPriceCents) — "Livret 34 pages 33,70€"
// est plus utile que "a partir de 29,90€" des que le nombre de pages reel est
// connu. Un seul appel plutot que 3 (un par format) : BookPreviewFinalLuxe.js
// appelait jusqu'ici price-estimate trois fois pour construire ce meme
// tableau. Absent/invalide -> comportement inchange (formats sans
// currentPriceCents, seulement startingPriceCents).
router.get('/formats', (req, res) => {
  const { MIN_BOOK_PAGES, MAX_BOOK_PAGES } = require('../services/composition/bookContentService');
  const { COVER_FORMATS } = require('../services/composition/coverFormat');
  const { resolveShippingCents } = require('../services/pricing/pricingConfig');

  // Pays/devise du visiteur (chantier international, 2026-10-02) : lu sur
  // X-App-Country (voir resolveCountry.js — meme mecanisme que la langue),
  // puisqu'aucune adresse n'existe encore a ce stade (page Tarifs, choix
  // du format a la creation du livre, avant tout paiement).
  const country = resolveCountry(req);
  const currency = resolveCurrencyForCountry(country);

  // reliure : matiere reelle de la couverture (voir coverFormat.js — Standard
  // et Luxe partagent le MEME format papier, seule la matiere les distingue).
  // nom : nom de produit, jamais traduit (meme convention que "Célébrons"
  // lui-meme) — seule l'accroche change de langue (chantier bilingue,
  // phase 6 : ce catalogue etait reste en francais dans toutes les phases
  // precedentes, voir le commentaire laisse dans CreateBookSansIA.js).
  const LIBELLES = {
    livret: { nom: 'Livret', accroche: t(req, 'Simple & élégant', 'Simple & elegant'), reliure: 'souple' },
    standard: {
      nom: 'Standard',
      accroche: t(req, 'Le meilleur équilibre entre élégance, qualité et prix', 'The best balance of elegance, quality and price'),
      recommande: true,
      reliure: 'souple'
    },
    luxe: { nom: 'Luxe', accroche: t(req, 'Premium & intemporel', 'Premium & timeless'), reliure: 'rigide' }
  };

  const requestedPageCount = Number(req.query.page_count);
  const currentPageCount = Number.isFinite(requestedPageCount)
    && requestedPageCount >= MIN_BOOK_PAGES
    && requestedPageCount <= MAX_BOOK_PAGES
    ? requestedPageCount
    : null;

  const formats = Object.keys(LIBELLES).map((formatId) => {
    const dims = COVER_FORMATS[formatId];
    return {
      formatId,
      ...LIBELLES[formatId],
      widthMm: dims.trimWidthMm,
      heightMm: dims.trimHeightMm,
      // "a partir de" : le prix au plancher produit, pas un prix moyen.
      minPages: MIN_BOOK_PAGES,
      startingPriceCents: startingPriceCents(formatId, MIN_BOOK_PAGES, country),
      // Increment par tranche de 2 pages, converti dans la devise resolue —
      // expose ici (chantier international, 2026-10-02) pour que le
      // frontend n'ait plus besoin de sa propre copie (TarifsLuxe.js en
      // gardait une recopiee a la main, risque de desynchronisation deja
      // signale dans son propre commentaire).
      pricePer2PagesCents: convertEurCentsTo(PRICING_CONFIG[formatId].pricePer2PagesCents, currency),
      // Tarif REEL du pays resolu ci-dessus (chantier international,
      // 2026-10-02 — relevé auprès de l'API Gelato, voir pricingConfig.js).
      // Deja dans la bonne devise, jamais une conversion a la volee.
      shippingPriceCents: resolveShippingCents(formatId, country),
      ...(currentPageCount ? {
        currentPageCount,
        currentPriceCents: startingPriceCents(formatId, currentPageCount, country)
      } : {})
    };
  });

  res.json({
    formats,
    defaultFormatId: DEFAULT_PRINT_FORMAT,
    country,
    currency,
    pdfPriceCents: convertEurCentsTo(PDF_PRICE_CENTS, currency),
    packDiscountPercent: PACK_DISCOUNT_PERCENT
  });
});

router.get('/', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req);
    const { data, error } = await db
      .from('orders')
      .select('*')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json((data || []).map(getApiSafeOrder));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/book/:bookId', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req);
    const { data, error } = await db
      .from('orders')
      .select('*')
      .eq('owner_id', req.user.id)
      .eq('book_id', req.params.bookId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json((data || []).map(getApiSafeOrder));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/book/:bookId/price-estimate?print_format=&page_count=
// Estimation de prix en lecture seule, jamais persistee : print_format/
// page_count passes en query *surchargent* les valeurs reelles du livre
// pour l'estimation (Configuration peut ainsi afficher le prix de chaque
// format avant de le choisir, et reagir a une pagination pas encore
// sauvegardee) sans jamais ecrire en base. Reutilise computeOrderPricing
// telle quelle : jamais une deuxieme implementation du calcul de prix.
// Client Supabase "simple" (pas createUserScopedClient) : lecture seule,
// deja filtree explicitement par owner_id ci-dessous, meme convention que
// getBook() dans routes/composition.js.
router.get('/book/:bookId/price-estimate', authenticate, async (req, res) => {
  try {
    const { data: book, error } = await supabase
      .from('books')
      .select('*')
      .eq('id', req.params.bookId)
      .eq('owner_id', req.user.id)
      .single();

    if (error || !book) {
      return res.status(404).json({ error: t(req, 'Livre introuvable', 'Book not found') });
    }

    const overriddenPageCount = req.query.page_count !== undefined ? Number(req.query.page_count) : null;
    const mergedBook = {
      ...book,
      print_format: req.query.print_format || book.print_format,
      page_count: Number.isFinite(overriddenPageCount) && overriddenPageCount > 0
        ? overriddenPageCount
        : book.page_count
    };

    // type/quantity optionnels (defaut 'print'/1, comportement inchange pour
    // tout appelant existant — Configuration ne les passe jamais) : ajoutes
    // pour que BookCheckoutLuxe.js puisse simuler le VRAI prix du type de
    // commande et de la quantite choisis, au lieu de son propre calcul local
    // (qui ignorait print_format et lisait la colonne morte `book.pages`).
    const allowedTypes = ['pdf', 'print', 'pack'];
    const type = allowedTypes.includes(req.query.type) ? req.query.type : 'print';
    const quantity = Math.max(1, Number.parseInt(req.query.quantity, 10) || 1);

    // Pays/devise (chantier international, 2026-10-02) : l'adresse de
    // livraison reelle n'existe pas encore a ce stade (simple previsualisation,
    // avant la commande) — lu sur X-App-Country, meme mecanisme que /formats.
    const country = resolveCountry(req);
    const pricing = computeOrderPricing({ book: mergedBook, type, quantity, country });
    return res.json({
      printFormat: pricing.breakdown.printFormat,
      pageCount: pricing.breakdown.pages,
      unitCents: pricing.unitCents,
      // bookPriceCents/shippingCents distingues explicitement (retour
      // utilisateur, 2026-09-27, §3 : "ne jamais faire 44,30€ livraison
      // incluse") — totalCents les incluait deja tous les deux mais sans
      // les distinguer, ce qui forcait chaque appelant a reconstituer le
      // detail a la main.
      bookPriceCents: pricing.breakdown.bookPriceCents,
      shippingCents: pricing.shippingCents,
      totalCents: pricing.totalCents,
      currency: pricing.currency,
      country: pricing.country
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// RATTRAPAGE D'UN PAIEMENT QUE LE NAVIGATEUR N'A PAS PU ANNONCER.
//
// Jusqu'ici, un paiement n'etait enregistre que si le client revenait sur
// la page de commande apres Stripe. Autrement dit, la trace d'un paiement
// dependait d'un onglet de navigateur.
//
// Le 2026-09-19, ca a casse pour de bon : un client a paye 94,50 EUR, est
// tombe sur une page blanche, et la commande est restee « en attente de
// paiement ». Stripe avait l'argent, nous n'avions rien. Un onglet ferme
// trop tot, un reseau qui lache ou un telephone qui se verrouille
// produisaient la meme chose.
//
// Desormais, il suffit d'ouvrir la commande : le serveur demande a Stripe
// ou en est la session et enregistre le paiement s'il a eu lieu. La page
// de retour reste le chemin normal, elle n'est plus le seul.
//
// Jamais bloquant : si Stripe ne repond pas, on rend la commande telle
// qu'elle est plutot que de refuser de l'afficher.
const rattraperLePaiementStripe = async ({ db, order, ownerEmail }) => {
  const statut = String(order?.status || '').toLowerCase();
  if (statut !== 'awaiting_payment') return order;

  const sessionId = cleanString(String(order?.metadata?.stripeCheckoutSessionId || ''), 240);
  if (!sessionId) return order;

  try {
    const session = await ensureStripeClient().checkout.sessions.retrieve(sessionId);
    if (String(session?.payment_status || '').toLowerCase() !== 'paid') return order;

    // La session doit bien designer CETTE commande : une session collee
    // dans la mauvaise fiche ne doit rien payer.
    const sessionOrderId = String(session.metadata?.orderId || '');
    if (sessionOrderId && sessionOrderId !== String(order.id)) return order;

    const rattrapee = await persistStripePaymentForOrder({
      db, order, session, source: 'rattrapage'
    });

    logEvent({
      type: 'order.payment.recovered',
      level: 'warn',
      actor: ownerEmail,
      orderId: order.id,
      bookId: order.book_id,
      message: 'Paiement Stripe retrouve et enregistre apres coup',
      metadata: { sessionId, montantCents: session.amount_total || null }
    });

    triggerGelatoSubmissionIfNeeded({ db, order: rattrapee, ownerEmail });
    triggerInvoiceIfNeeded({ order: rattrapee, ownerEmail });
    return rattrapee;
  } catch (error) {
    console.error('Rattrapage du paiement Stripe impossible:', error.message);
    return order;
  }
};

router.get('/:orderId', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req);
    const { data, error } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: t(req, 'Commande introuvable', 'Order not found') });
    }

    // Ouvrir la commande suffit a rattraper un paiement que le navigateur
    // n'a pas pu annoncer (voir rattraperLePaiementStripe).
    const commande = await rattraperLePaiementStripe({
      db, order: data, ownerEmail: req.user.email
    });

    return res.json(getApiSafeOrder(commande));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/orders/:orderId
// Supprime une commande pour pouvoir RECOMMENCER un test (demande
// utilisateur 2026-09-11 : "je dois pouvoir supprimer les commandes pour les
// besoins des tests... sans blocage"). Sans ca, une commande en attente
// bloque la creation d'une nouvelle (voir BookCheckoutLuxe) et le parcours
// saute directement a l'ecran de suivi : impossible de reessayer un autre
// type, un autre format ou un autre paiement.
//
// Deux refus, volontairement etroits pour ne genrer aucun scenario de test :
//   - une commande reellement partie en PRODUCTION chez l'imprimeur
//     (metadata.gelatoOrderType === 'order') : elle sera imprimee et
//     facturee, effacer la ligne locale ferait perdre la trace d'un
//     engagement bien reel. Ne peut pas arriver tant que GELATO_LIVE_ORDERS
//     n'est pas a '1'.
//   - une commande payee alors que Stripe tourne en mode LIVE : de l'argent
//     a vraiment change de main. En mode test (`sk_test_`), aucun blocage.
// Tout le reste (brouillon, en attente de paiement, payee en mode test,
// echouee, annulee) est librement supprimable.
router.delete('/:orderId', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req);
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: t(req, 'Commande introuvable', 'Order not found') });
    }

    const gelatoOrderType = order.metadata?.gelatoOrderType || null;
    if (gelatoOrderType === 'order') {
      return res.status(409).json({
        error: t(req, "Cette commande est partie en production chez l'imprimeur : elle ne peut pas etre supprimee.", 'This order has gone into production at the printer: it cannot be deleted.')
      });
    }

    // Nos metadonnees ne suffisent pas : un brouillon confirme depuis le
    // tableau de bord Gelato devient une vraie commande, facturee et
    // imprimee, sans que rien ne nous en informe. C'est exactement ce qui
    // s'est produit le 2026-09-18. On demande donc son etat a Gelato avant
    // de laisser supprimer quoi que ce soit.
    //
    // Si Gelato est injoignable, on REFUSE : entre risquer d'effacer le
    // suivi d'un livre paye et faire patienter, le choix est vite fait
    // (meme regle que pour une commande payee sans cle Stripe lisible).
    const gelatoOrderId = order.metadata?.gelatoOrderId || null;
    if (gelatoOrderId) {
      let typeChezGelato = null;
      try {
        const distant = await gelatoClient.getOrder(gelatoOrderId);
        typeChezGelato = gelatoTracking.readGelatoOrderType(distant);
      } catch (error) {
        return res.status(409).json({
          error: t(req, "Impossible de verifier aupres de l'imprimeur si cette commande est partie en production. Par prudence, elle n'est pas supprimee. Reessayez plus tard.", 'Unable to check with the printer whether this order has gone into production. As a precaution, it has not been deleted. Try again later.')
        });
      }

      if (typeChezGelato === 'order') {
        // On corrige nos metadonnees au passage : la prochaine tentative
        // sera refusee sans meme appeler Gelato.
        await supabase
          .from('orders')
          .update({ metadata: { ...(order.metadata || {}), gelatoOrderType: 'order' }, updated_at: getNowIso() })
          .eq('id', order.id);

        return res.status(409).json({
          error: t(req, "Cette commande est partie en production chez l'imprimeur : elle ne peut pas etre supprimee.", 'This order has gone into production at the printer: it cannot be deleted.')
        });
      }
    }

    const status = String(order.status || '').toLowerCase();
    if (ORDER_STATUS_PAID_OR_AFTER.has(status) && isStripeLiveMode()) {
      return res.status(409).json({
        error: t(
          req,
          'Cette commande a ete reellement payee (Stripe en mode live) : elle ne peut pas etre supprimee.',
          'This order has actually been paid (Stripe live mode): it cannot be deleted.'
        )
      });
    }

    // Menage chez Gelato : le brouillon courant ET ceux archives par les
    // renvois precedents (voir /gelato-test) encombreraient le tableau de
    // bord alors que plus rien ne les reference. Best effort, comme partout
    // ailleurs pour cette suppression : un echec cote Gelato ne doit pas
    // empecher l'utilisateur de nettoyer sa propre commande (pire cas, un
    // brouillon orphelin, sans consequence ni cout).
    const draftIds = [
      ...(gelatoOrderType === 'draft' && order.metadata?.gelatoOrderId ? [order.metadata.gelatoOrderId] : []),
      ...(Array.isArray(order.metadata?.gelatoPreviousDrafts)
        ? order.metadata.gelatoPreviousDrafts.map((entry) => entry?.gelatoOrderId).filter(Boolean)
        : [])
    ];
    const deletedDrafts = [];
    for (const draftId of draftIds) {
      try {
        await gelatoClient.deleteOrder(draftId);
        deletedDrafts.push(draftId);
      } catch (error) {
        console.warn('Suppression du brouillon Gelato impossible', draftId, ':', error.message);
      }
    }

    // `.select()` n'est PAS decoratif ici : sous RLS, une suppression que la
    // base refuse ne leve aucune erreur — elle supprime zero ligne et rend la
    // main comme si tout allait bien. Sans relire ce qui a reellement ete
    // supprime, la route repondait « supprimee » alors que la commande etait
    // toujours la (constate le 2026-09-16 : aucune policy `delete` sur
    // public.orders, voir sql/phase20_orders_delete_policy.sql).
    const { data: deletedRows, error: deleteError } = await db
      .from('orders')
      .delete()
      .eq('id', order.id)
      .eq('owner_id', req.user.id)
      .select('id');

    if (deleteError) throw deleteError;

    if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
      return res.status(409).json({
        error: t(req, "La base a refuse la suppression sans message d'erreur. Il manque probablement la regle 'delete' sur la table orders (sql/phase20_orders_delete_policy.sql).", "The database refused the deletion without an error message. The 'delete' policy on the orders table is probably missing (sql/phase20_orders_delete_policy.sql).")
      });
    }

    // APRES la suppression effective, jamais avant : si la base avait refuse
    // (voir juste au-dessus), on effacerait le fichier d'impression d'une
    // commande toujours vivante — que Gelato peut encore avoir a telecharger.
    //
    // Ce fichier (~46 Mo) n'a plus rien a referencer une fois la commande
    // partie ; sans ce menage, chaque essai en laissait un derriere lui
    // (555 Mo mesures le 2026-09-17 pour un seul livre). Best effort, comme
    // la suppression des brouillons Gelato plus haut.
    const menage = await removePrintFilesForOrder(order.id);

    logEvent({
      type: 'order.deleted',
      level: 'warn',
      actor: req.user.email,
      orderId: order.id,
      bookId: order.book_id,
      ownerId: order.owner_id,
      message: `Commande ${order.order_number} supprimee`,
      metadata: {
        statut: order.status,
        type: order.type,
        brouillonsGelatoSupprimes: deletedDrafts.length,
        fichiersImpressionSupprimes: menage.removed
      }
    });

    return res.json({
      deleted: true,
      orderId: order.id,
      orderNumber: order.order_number,
      deletedGelatoDrafts: deletedDrafts,
      deletedPrintFiles: menage.removed
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    // Demarrage sans compte (2026-09-12) : tout se fait librement en session
    // anonyme — creer le livre, deposer les photos, composer, voir l'apercu.
    // La commande est le SEUL point de passage qui exige un vrai compte, et
    // c'est ici qu'il faut le tenir : sans email ni mot de passe, l'acheteur
    // ne pourrait ni retrouver sa commande, ni recevoir son suivi, ni
    // reclamer quoi que ce soit. C'est aussi le moment naturel pour le
    // demander — la valeur a deja ete vue.
    // CE QU'ON EXIGE VRAIMENT, C'EST UNE ADRESSE E-MAIL (2026-09-20).
    //
    // La regle produit n'a jamais ete « avoir un compte » au sens classique :
    // c'est « pouvoir retrouver sa commande et la suivre », et cela tient a
    // une seule chose, une adresse verifiee. Depuis le passage a
    // l'authentification par code (services/emailOtp.js), un visiteur peut
    // attacher son adresse a sa session anonyme SANS mot de passe — son
    // identifiant ne change pas, son livre reste en place.
    //
    // Se fonder sur `is_anonymous` serait donc fragile : selon la facon dont
    // le fournisseur d'authentification bascule ce drapeau apres la
    // verification d'une adresse, un acheteur parfaitement identifiable
    // pourrait rester bloque en boucle devant le meme message. L'adresse,
    // elle, est le fait observable — et sans session valide, `authenticate`
    // a deja refuse la requete bien avant.
    const emailDuCompte = String(req.user?.email || '').trim();
    if (!emailDuCompte) {
      return res.status(403).json({
        error: t(req, 'Indiquez votre adresse e-mail pour commander : elle vous permettra de retrouver votre livre et de suivre sa fabrication.', 'Provide your email address to order: it will let you find your book again and track its production.'),
        requiresAccount: true
      });
    }

    const db = createUserScopedClient(req);
    const type = String(req.body?.type || '').trim().toLowerCase();
    const quantity = Number(req.body?.quantity || 1);
    const shippingAddress = sanitizeAddress(req.body?.shippingAddress);
    const notes = cleanString(req.body?.notes || '', 600);
    // Pays/devise REELLEMENT factures (chantier international, 2026-10-02) :
    // pour 'print'/'pack', l'adresse de livraison vient d'etre saisie et
    // c'est elle qui decide ce que Gelato facture — jamais le header, qui ne
    // reflete qu'un choix fait plus tot dans le parcours (page Tarifs), avant
    // de connaitre la vraie destination. Pour 'pdf' (aucune adresse,
    // aucune livraison), seul le header existe : voir resolveCountry.js.
    const orderCountry = type === 'pdf'
      ? resolveCountry(req)
      : resolveCountryIso2(shippingAddress.country);
    // Facturation (retour utilisateur, 2026-09-27) : "meme que la livraison"
    // par defaut cote frontend — body.billingAddress n'est envoye QUE quand
    // la case a ete decochee, donc son absence signifie "identique". Jamais
    // bloquant pour la creation de commande (aucun usage aval aujourd'hui,
    // contrairement a l'adresse de livraison qui conditionne l'impression) :
    // simplement enregistree pour reference, dans metadata (pas de nouvelle
    // colonne SQL, meme choix que le snapshot de prix).
    const billingSameAsShipping = !req.body?.billingAddress;
    const billingAddress = billingSameAsShipping
      ? shippingAddress
      : sanitizeAddress(req.body.billingAddress);
    // Acceptation des CGV (retour utilisateur, 2026-09-28) : c'est elle qui
    // rend opposable l'exclusion du droit de retractation (art. L221-28 du
    // Code de la consommation, voir frontend CGVLuxe.js §5) — elle doit donc
    // etre ECRITE et ANTERIEURE au paiement. Le bouton "Payer" cote client
    // est deja desactive sans elle (defense en profondeur, pas la seule
    // barriere) : verifiee ici aussi, cote serveur, avant toute creation de
    // commande.
    const cgvAccepted = req.body?.cgvAccepted === true;

    if (!ORDER_TYPES.has(type)) {
      return res.status(400).json({ error: t(req, 'Type de commande invalide', 'Invalid order type') });
    }

    if (!cgvAccepted) {
      return res.status(400).json({ error: t(req, "L'acceptation des conditions générales de vente est requise.", 'Acceptance of the terms and conditions is required.') });
    }

    if ((type === 'print' || type === 'pack') && !isAddressValid(shippingAddress)) {
      return res.status(400).json({ error: t(req, 'Adresse de livraison incomplete', 'Incomplete shipping address') });
    }

    const { data: book, error: bookError } = await db
      .from('books')
      .select('*')
      .eq('id', req.body?.bookId)
      .eq('owner_id', req.user.id)
      .single();

    if (bookError || !book) {
      return res.status(404).json({ error: t(req, 'Livre introuvable', 'Book not found') });
    }

    const lifecycleStatus = getBookLifecycleStatusFromBook(book);
    if (getLifecycleRank(lifecycleStatus) < getLifecycleRank('finalized')) {
      return res.status(400).json({
        error: t(req, 'Le livre doit etre finalise avant de lancer une commande', 'The book must be finalized before placing an order')
      });
    }

    // GARDE-FOU DE FACTURATION (2026-09-14). Le prix se calcule sur
    // `book.page_count`, mais le fichier envoye a l'imprimeur est construit a
    // partir des pages REELLEMENT composees (gelatoOrderService :
    // interiorPages.length). Si le livre contient des pages de contenu
    // au-dela du nombre declare, le client paierait un nombre de pages et en
    // recevrait un autre.
    //
    // Constate sur un livre reel : 30 pages facturees, 40 envoyees a
    // l'impression. La cause est corrigee (la composition synchronise
    // desormais page_count), mais un livre deja dans cet etat ne doit pas
    // pouvoir partir en commande sans que ce soit dit.
    //
    // On ne compte QUE les pages porteuses de contenu : une page vide n'a pas
    // de ligne en base, donc "moins de lignes que page_count" est normal et
    // ne doit jamais declencher ce garde-fou.
    if (type === 'print' || type === 'pack') {
      const { data: pageRows } = await db
        .from('book_pages')
        .select('page_index,content')
        .eq('book_id', book.id);
      const declared = Number(book.page_count || 0);
      const auDela = (pageRows || []).filter((row) => (
        row.page_index >= declared
        && Array.isArray(row.content?.itemIds)
        && row.content.itemIds.filter(Boolean).length > 0
      ));
      if (auDela.length > 0) {
        return res.status(422).json({
          error: t(
            req,
            `Votre livre contient ${auDela.length} page(s) de contenu au-dela des ${declared} pages annoncees. `
              + 'Relancez une composition ou ajustez le nombre de pages : le prix et le fichier envoye a '
              + "l'imprimeur doivent porter sur le meme livre.",
            `Your book contains ${auDela.length} page(s) of content beyond the ${declared} announced pages. `
              + 'Re-run a composition or adjust the page count: the price and the file sent to '
              + 'the printer must cover the same book.'
          ),
          pageCountMismatch: true,
          declaredPageCount: declared,
          realPageCount: declared + auDela.length
        });
      }
    }

    const pricing = computeOrderPricing({ book, type, quantity, country: orderCountry });
    // bookPriceCents/shippingPriceCents/pricingVersion/currency FIGES ici
    // (retour utilisateur, 2026-09-27, §18/§19 — etendu a la devise par le
    // chantier international, 2026-10-02) : une commande deja creee ne relit
    // plus jamais services/pricing/pricingConfig.js — changer les tarifs OU
    // les taux de change demain ne doit jamais modifier le prix (ni la
    // devise) d'une commande deja passee. Pas de nouvelle colonne SQL :
    // snapshot est deja un jsonb ecrit ici.
    const snapshot = {
      bookId: book.id,
      title: book.title || 'Livre sans titre',
      eventType: book.event_type || null,
      recipientName: book.recipient_name || null,
      pages: Number(book.page_count || 0) || null,
      printFormat: book.print_format || 'standard',
      lifecycleStatus,
      bookPriceCents: pricing.breakdown.bookPriceCents,
      shippingPriceCents: pricing.breakdown.shippingPriceCents,
      totalPriceCents: pricing.totalCents,
      currency: pricing.currency,
      country: pricing.country,
      pricingVersion: pricing.breakdown.pricingVersion,
      createdAt: getNowIso()
    };

    const nowIso = getNowIso();
    const newOrder = {
      owner_id: req.user.id,
      book_id: book.id,
      book_title: cleanString(book.title || 'Livre sans titre', 220),
      order_number: createOrderNumber(),
      type,
      status: 'awaiting_payment',
      quantity: pricing.quantity,
      currency: pricing.currency,
      unit_cents: pricing.unitCents,
      total_cents: pricing.totalCents,
      shipping_address: type === 'pdf' ? null : shippingAddress,
      metadata: {
        notes,
        pricing: pricing.breakdown,
        ...(type === 'pdf' ? {} : { billingAddress, billingSameAsShipping }),
        // Preuve d'acceptation des CGV : deja verifiee obligatoire plus
        // haut (400 sinon), donc toujours vraie ici — horodatee au moment
        // de la creation de la commande, qui est aussi le moment le plus
        // proche du paiement effectif.
        cgvAccepted,
        cgvAcceptedAt: nowIso
      },
      snapshot,
      created_at: nowIso,
      updated_at: nowIso
    };

    const { data, error } = await db
      .from('orders')
      .insert([newOrder])
      .select('*')
      .single();

    if (error) throw error;
    return res.status(201).json(getApiSafeOrder(data));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:orderId/pay', authenticate, async (req, res) => {
  return res.status(410).json({
    error: t(req, 'Paiement direct desactive. Utilisez Stripe Checkout.', 'Direct payment disabled. Use Stripe Checkout.')
  });
});

router.post('/:orderId/checkout-session', authenticate, async (req, res) => {
  try {
    const stripe = ensureStripeClient();
    const db = createUserScopedClient(req);
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: t(req, 'Commande introuvable', 'Order not found') });
    }

    if (!['draft', 'awaiting_payment'].includes(order.status)) {
      return res.status(409).json({ error: t(req, 'Commande deja en paiement ou traitee', 'Order already in payment or processed') });
    }

    const context = {
      bookId: String(order.book_id || ''),
      orderId: String(order.id || '')
    };
    const successUrl = fillCheckoutUrlTemplate(
      STRIPE_CHECKOUT_SUCCESS_URL,
      context
    ) || `${FRONTEND_BASE_URL}/book/${context.bookId}/checkout?payment=success&orderId=${context.orderId}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = fillCheckoutUrlTemplate(
      STRIPE_CHECKOUT_CANCEL_URL,
      context
    ) || `${FRONTEND_BASE_URL}/book/${context.bookId}/checkout?payment=cancel&orderId=${context.orderId}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: req.user.email || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orderId: String(order.id),
        ownerId: String(req.user.id),
        bookId: String(order.book_id || ''),
        orderNumber: String(order.order_number || '')
      },
      // Livre + livraison en DEUX lignes distinctes (retour utilisateur,
      // 2026-09-27, §3/§13 : "ne jamais faire 44,30€ livraison incluse") —
      // avant ce chantier, order.unit_cents ne portait que le livre et la
      // livraison n'etait de toute facon pas facturee du tout. Montant fige
      // au moment de la commande (order.snapshot), jamais recalcule ici.
      line_items: [
        {
          quantity: Number(order.quantity || 1),
          price_data: {
            currency: String(order.currency || 'EUR').toLowerCase(),
            unit_amount: Number(order.unit_cents || order.total_cents || 0),
            product_data: {
              name: `${t(req, 'Livre souvenir', 'Memory book')} - ${order.book_title || t(req, 'Sans titre', 'Untitled')}`,
              description: `${t(req, 'Commande', 'Order')} ${order.order_number || ''} (${order.type || 'pdf'})`
            }
          }
        },
        ...(Number(order.snapshot?.shippingPriceCents) > 0 ? [{
          quantity: 1,
          price_data: {
            currency: String(order.currency || 'EUR').toLowerCase(),
            unit_amount: Number(order.snapshot.shippingPriceCents),
            product_data: {
              name: t(req, 'Livraison', 'Shipping')
            }
          }
        }] : [])
      ]
    });

    const nowIso = getNowIso();
    const mergedMetadata = mergeMetadata(order.metadata, {
      stripeCheckoutSessionId: checkoutSession.id,
      stripeCheckoutCreatedAt: nowIso
    });

    await db
      .from('orders')
      .update({
        metadata: mergedMetadata,
        updated_at: nowIso
      })
      .eq('id', order.id)
      .eq('owner_id', req.user.id);

    return res.json({
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
});

router.post('/:orderId/stripe/confirm', authenticate, async (req, res) => {
  try {
    const stripe = ensureStripeClient();
    const db = createUserScopedClient(req);
    const sessionId = cleanString(req.body?.sessionId || '', 240);

    if (!sessionId) {
      return res.status(400).json({ error: t(req, 'sessionId requis', 'sessionId required') });
    }

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: t(req, 'Commande introuvable', 'Order not found') });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).json({ error: t(req, 'Session Stripe introuvable', 'Stripe session not found') });
    }

    const sessionOrderId = String(session.metadata?.orderId || '');
    if (sessionOrderId && sessionOrderId !== String(order.id)) {
      return res.status(400).json({ error: t(req, 'Session Stripe non associee a cette commande', 'Stripe session not associated with this order') });
    }

    if (String(session.payment_status || '').toLowerCase() !== 'paid') {
      return res.status(409).json({ error: t(req, 'Paiement Stripe non confirme', 'Stripe payment not confirmed') });
    }

    const updatedOrder = await persistStripePaymentForOrder({
      db,
      order,
      session,
      source: 'confirm'
    });

    // Filet de securite si le webhook n'est pas encore arrive (ou n'est pas
    // configure en local) — idempotent cote gelatoOrderService, donc sans
    // risque de doublon si le webhook la declenche aussi.
    triggerGelatoSubmissionIfNeeded({ db, order: updatedOrder, ownerEmail: req.user.email });
    // Filet identique pour la facture (idempotente, voir triggerInvoiceIfNeeded).
    triggerInvoiceIfNeeded({ order: updatedOrder, ownerEmail: req.user.email });

    return res.json(getApiSafeOrder(updatedOrder));
  } catch (error) {
    // Une session que Stripe ne connait pas n est pas une panne de notre
    // serveur. Depuis que la page de commande tente ce rattrapage a chaque
    // ouverture, une vieille session laisserait sinon une erreur serveur au
    // journal a chaque visite — et noierait les vraies.
    const stripeRefuse = String(error?.type || '').startsWith('Stripe');
    const status = error.status || (stripeRefuse ? (error.statusCode || 400) : 500);
    return res.status(status).json({ error: error.message });
  }
});

router.post('/:orderId/status', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req);
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const nextMetadata = req.body?.metadata;

    if (!ORDER_STATUSES.has(nextStatus)) {
      return res.status(400).json({ error: t(req, 'Statut de commande invalide', 'Invalid order status') });
    }

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: t(req, 'Commande introuvable', 'Order not found') });
    }

    if (!canUseStatusForOrderType(nextStatus, order.type)) {
      return res.status(400).json({ error: t(req, 'Statut incompatible avec ce type de commande', 'Status incompatible with this order type') });
    }
    if (!canTransitionOrderStatus(order.status, nextStatus)) {
      return res.status(409).json({
        error: t(
          req,
          `Transition de statut invalide (${order.status} -> ${nextStatus})`,
          `Invalid status transition (${order.status} -> ${nextStatus})`
        )
      });
    }
    if (nextStatus === 'paid') {
      return res.status(403).json({
        error: t(req, 'Statut paid reserve a la confirmation Stripe', "'paid' status is reserved for Stripe confirmation")
      });
    }
    if (ORDER_STATUS_REQUIRES_PAID.has(nextStatus) && !ORDER_STATUS_PAID_OR_AFTER.has(order.status)) {
      return res.status(409).json({
        error: t(req, 'Paiement requis avant de lancer la production', 'Payment required before starting production')
      });
    }
    if (nextStatus === order.status) {
      return res.json(getApiSafeOrder(order));
    }

    const nowIso = getNowIso();
    const updatePayload = {
      status: nextStatus,
      updated_at: nowIso,
      metadata: mergeMetadata(order.metadata, nextMetadata)
    };
    setStatusTimestamps(updatePayload, nextStatus, nowIso);

    const { data, error } = await db
      .from('orders')
      .update(updatePayload)
      .eq('id', order.id)
      .eq('owner_id', req.user.id)
      .select('*')
      .single();

    if (error) throw error;

    await syncBookLifecycleFromOrder({
      db,
      ownerId: req.user.id,
      bookId: order.book_id,
      orderStatus: nextStatus
    });

    // Email d'etape. APRES l'ecriture, jamais avant : on n'annonce que ce qui
    // est reellement enregistre. Et jamais attendu par la reponse — un email
    // lent ou en panne ne doit pas retarder ni faire echouer un changement de
    // statut deja effectue. Seuls les statuts qui ont un message dedie
    // declenchent quelque chose (voir emailTemplates.ETAPES).
    emails.envoyerEtapeFabrication({
      order: data,
      ownerEmail: req.user?.email,
      statut: nextStatus,
      suivi: data?.metadata?.tracking
    }).catch(() => {});

    return res.json(getApiSafeOrder(data));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
// LES ENVOIS A L IMPRIMEUR, VUS DE L ESPACE D ADMINISTRATION.
//
// Demande du 2026-09-19 : voir les demandes en cours, leur statut, et
// pouvoir les arreter / nettoyer.
//
// Un envoi depose un fichier de ~46 Mo chez Gelato : c'est long. Au-dela
// d'une demi-heure, ce n'est plus un envoi qui travaille, c'est un verrou
// oublie — et tant qu il tient, la commande refuse tout nouvel envoi.
const VERROU_GELATO_SUSPECT_MS = 30 * 60 * 1000;

// Compte SYNCHRONE des envois EN COURS (jamais les echecs deja termines,
// voir listGelatoSubmissions plus bas) — reserve a server.js:travauxEnCours,
// qui decide s'il faut attendre avant un arret propre. Une commande deja
// echouee ne tourne plus : l'interrompre ne signifie rien, rien n'attend
// donc dessus. Mirroir de countActivePdfJobs (routes/books.js).
module.exports.countActiveGelatoSubmissions = () => gelatoSubmissionsEnCours.size;

module.exports.listGelatoSubmissions = async () => {
  const travaux = [];
  gelatoSubmissionsEnCours.forEach((info, orderId) => {
    const debut = Date.parse(info?.debutLe || '');
    const depuisMs = Number.isNaN(debut) ? null : Date.now() - debut;
    const bloquee = depuisMs !== null && depuisMs > VERROU_GELATO_SUSPECT_MS;

    travaux.push({
      genre: 'gelato',
      id: orderId,
      orderId,
      bookId: info?.bookId || null,
      demandeur: info?.demandeur || null,
      etat: bloquee ? 'bloquee' : 'en cours',
      bloquee,
      arretable: true,
      relancable: false,
      creeLe: info?.debutLe || null,
      demarreLe: info?.debutLe || null,
      fini: null,
      avancement: null,
      erreur: null,
      fichier: null
    });
  });

  // Commandes dont l'envoi a ECHOUE (les GELATO_SUBMIT_MAX_ATTEMPTS
  // tentatives automatiques epuisees) et qui n'ont jamais ete creees chez
  // Gelato depuis : sans cette liste, un echec disparaissait du panneau
  // "Travaux" des que son verrou se relachait — quelques secondes apres
  // l'echec, voir gelatoSubmissionsEnCours.delete dans le `finally` de
  // triggerGelatoSubmissionIfNeeded — alors que l'ecran client promet
  // "notre equipe le relance" (StepTracking.js). Il fallait pouvoir la
  // retrouver plus tard pour tenir cette promesse.
  try {
    const { data: echouees, error } = await supabase
      .from('orders')
      .select('id, book_id, metadata, updated_at')
      .in('type', ['print', 'pack'])
      .not('metadata->>gelatoError', 'is', null)
      .is('metadata->>gelatoOrderId', null);
    if (error) throw error;

    (echouees || [])
      .filter((order) => !gelatoSubmissionsEnCours.has(order.id))
      .forEach((order) => {
        travaux.push({
          genre: 'gelato',
          id: order.id,
          orderId: order.id,
          bookId: order.book_id || null,
          demandeur: null,
          etat: 'echouee',
          bloquee: false,
          arretable: false,
          relancable: true,
          creeLe: order.metadata?.gelatoErrorAt || order.updated_at || null,
          demarreLe: null,
          fini: order.metadata?.gelatoErrorAt || null,
          avancement: null,
          erreur: order.metadata?.gelatoError || null,
          fichier: null
        });
      });
  } catch (error) {
    // Jamais bloquant : le panneau affiche au moins les envois en cours.
    console.error('Lecture des envois Gelato echoues impossible:', error.message);
  }

  return travaux.sort((a, b) => Date.parse(b.creeLe || 0) - Date.parse(a.creeLe || 0));
};

// Relacher le verrou d'un envoi.
//
// ATTENTION A CE QUE CA FAIT, ET A CE QUE CA NE FAIT PAS : le travail
// detache continue son chemin cote serveur, et surtout un fichier deja
// parti chez Gelato y reste — on ne rappelle pas un envoi. Ce que ca rend,
// c'est la possibilite de RELANCER la commande, qui etait bloquee.
//
// Le brouillon eventuellement cree chez Gelato se supprime par la route de
// suppression de commande, qui consulte Gelato avant de trancher.
module.exports.releaseGelatoSubmission = (orderId) => {
  const cle = String(orderId || '');
  if (!gelatoSubmissionsEnCours.has(cle)) return { relache: false, raison: 'aucun envoi en cours' };
  gelatoSubmissionsEnCours.delete(cle);
  return { relache: true };
};

// Relance MANUELLE d'un envoi imprimeur echoue, depuis l'administration
// (retour utilisateur 2026-09-30 : "une nouvelle tentative reste possible").
// L'ecran de suivi client promet deja "notre equipe le relance" des qu'un
// envoi echoue (StepTracking.js) — cette fonction est ce qui rend cette
// promesse vraie : sans elle, une commande dont les 2 tentatives
// automatiques ont echoue ne repartait plus jamais toute seule.
//
// Reutilise EXACTEMENT le meme chemin que l'envoi automatique
// (triggerGelatoSubmissionIfNeeded, donc le meme verrou et la meme
// idempotence via metadata.gelatoOrderId) — jamais un second pipeline.
module.exports.retryGelatoSubmission = async (orderId) => {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (error || !order) return { lancee: false, raison: 'commande introuvable' };

  const type = String(order.type || '').toLowerCase();
  if (type !== 'print' && type !== 'pack') {
    return { lancee: false, raison: "cette commande n'inclut pas d'impression" };
  }
  if (order.metadata?.gelatoOrderId) {
    return { lancee: false, raison: 'deja envoyee', gelatoOrderId: order.metadata.gelatoOrderId };
  }
  if (gelatoSubmissionsEnCours.has(order.id)) {
    return { lancee: false, raison: 'un envoi est deja en cours pour cette commande' };
  }

  // Email du client, pour la commande Gelato (facultatif : voir
  // mapShippingAddress dans gelatoOrderService.js) — jamais bloquant si on
  // ne le trouve pas.
  let ownerEmail = order.shipping_address?.email || order.metadata?.billingAddress?.email || null;
  if (!ownerEmail) {
    try {
      const { data } = await supabase.auth.admin.getUserById(order.owner_id);
      ownerEmail = data?.user?.email || null;
    } catch (_erreur) {
      // Compte introuvable/API indisponible : l'envoi part quand meme.
    }
  }

  triggerGelatoSubmissionIfNeeded({ db: supabase, order, ownerEmail });
  return { lancee: true };
};

// Expose pour les tests : verifier qu un doublon d envoi est impossible
// demande de declencher les deux chemins en meme temps.
module.exports.__triggerGelatoPourLesTests = triggerGelatoSubmissionIfNeeded;
module.exports.handleStripeWebhook = handleStripeWebhook;
module.exports.computeOrderPricing = computeOrderPricing;
