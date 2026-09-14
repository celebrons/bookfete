const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');
const { submitPrintOrderToGelato, isGelatoLiveOrdersEnabled } = require('../services/printing/gelatoOrderService');
const gelatoClient = require('../services/printing/gelatoClient');
const gelatoTracking = require('../services/printing/gelatoTracking');
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
  return {
    fullName: cleanString(address.fullName, 120),
    line1: cleanString(address.line1, 180),
    line2: cleanString(address.line2, 180),
    postalCode: cleanString(address.postalCode, 24),
    city: cleanString(address.city, 120),
    country: cleanString(address.country, 120) || 'France',
    phone: cleanString(address.phone, 40)
  };
};

const isAddressValid = (address) => (
  Boolean(address?.fullName && address?.line1 && address?.postalCode && address?.city && address?.country)
);

// Tarif d'impression par type d'album (books.print_format, voir
// coverFormat.js pour les 3 memes ids et leurs dimensions physiques).
// Hypothese de travail (aucun cout d'impression reel connu a ce jour) :
// un seul endroit a ajuster si les vrais couts different.
const FORMAT_PRICING = {
  livret: { baseCents: 3400, perPageCents: 60, minCents: 4900 },
  standard: { baseCents: 4900, perPageCents: 85, minCents: 6900 },
  luxe: { baseCents: 6900, perPageCents: 130, minCents: 9900 }
};
const DEFAULT_PRINT_FORMAT = 'standard';

const resolveFormatPricing = (printFormat) => FORMAT_PRICING[printFormat] || FORMAT_PRICING[DEFAULT_PRINT_FORMAT];

// book.page_count (pas book.pages, une colonne heritee de l'ancien flux IA
// jamais mise a jour par le moteur de composition actuel) : la vraie valeur,
// obligatoire pour composer le livre (voir routes/composition.js), donc le
// seul nombre qui correspond reellement au livre imprime.
const computeOrderPricing = ({ book, type, quantity }) => {
  const pages = Number(book?.page_count || 0);
  const safePages = Number.isFinite(pages) && pages > 0 ? pages : 64;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const printFormat = book?.print_format && FORMAT_PRICING[book.print_format] ? book.print_format : DEFAULT_PRINT_FORMAT;
  const pricing = resolveFormatPricing(printFormat);
  const printUnitCents = Math.max(pricing.minCents, pricing.baseCents + Math.round(safePages * pricing.perPageCents));
  const pdfUnitCents = 3900;

  let unitCents = pdfUnitCents;
  if (type === 'print') {
    unitCents = printUnitCents;
  } else if (type === 'pack') {
    unitCents = printUnitCents + 2000;
  }

  return {
    quantity: safeQuantity,
    unitCents,
    totalCents: unitCents * safeQuantity,
    breakdown: {
      pages: safePages,
      printFormat,
      printUnitCents,
      pdfUnitCents
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
  paid: new Set(['pdf_generating', 'pdf_ready', 'print_queued', 'cancelled', 'failed']),
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

  return updatedOrder;
};

// Declenche la soumission Gelato pour une commande Impression/Pack qui
// vient d'etre payee — jamais bloquant pour la reponse HTTP (fire-and-forget,
// meme principe que la generation PDF existante plus bas dans ce fichier
// cote frontend) : idempotent via gelatoOrderService (verifie
// order.metadata.gelatoOrderId), donc sans risque a appeler plusieurs fois
// pour la meme commande (webhook + route de confirmation peuvent toutes
// deux declencher ce chemin). N'agit que sur 'print'/'pack' — jamais 'pdf'.
const triggerGelatoSubmissionIfNeeded = ({ db, order, ownerEmail }) => {
  const type = String(order?.type || '').toLowerCase();
  if (type !== 'print' && type !== 'pack') return;

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

      const result = await submitPrintOrderToGelato({ db: supabase, book, order, ownerEmail });
      if (result.error) {
        console.error('Soumission Gelato echouee pour la commande', order.id, ':', result.error);
      } else if (!result.skipped) {
        console.log(`Commande Gelato ${result.gelatoOrderType} creee (${result.gelatoOrderId}) pour la commande Celebrons ${order.id}`);
      }
    } catch (error) {
      console.error('Erreur inattendue lors de la soumission Gelato pour la commande', order.id, ':', error.message);
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
        error: "GELATO_LIVE_ORDERS=1 : le mode production est actif, l'envoi de test est desactive pour ne pas creer une vraie commande facturee."
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
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    const type = String(order.type || '').toLowerCase();
    if (type !== 'print' && type !== 'pack') {
      return res.status(400).json({ error: "Seules les commandes Impression ou Pack peuvent etre envoyees a l'imprimeur." });
    }
    if (!isAddressValid(order.shipping_address)) {
      return res.status(400).json({ error: 'Adresse de livraison incomplete : Gelato la refuserait.' });
    }

    const { data: book, error: bookError } = await db
      .from('books')
      .select('*')
      .eq('id', order.book_id)
      .single();
    if (bookError || !book) {
      return res.status(404).json({ error: 'Livre introuvable' });
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

    if (previousGelatoOrderId) {
      // Menage chez Gelato : le brouillon precedent n'a plus de raison
      // d'exister et encombrerait le tableau de bord a chaque essai. Best
      // effort — un echec de suppression ne doit jamais empecher le nouvel
      // envoi (le pire cas est un brouillon orphelin, sans consequence).
      try {
        await gelatoClient.deleteOrder(previousGelatoOrderId);
      } catch (error) {
        console.warn('Suppression du brouillon Gelato precedent impossible', previousGelatoOrderId, ':', error.message);
      }
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
        // Le prix et l'instantane suivent le livre reellement envoye.
        unit_cents: refreshedPricing.unitCents,
        total_cents: refreshedPricing.totalCents,
        quantity: refreshedPricing.quantity,
        snapshot: {
          ...(order.snapshot || {}),
          printFormat: book.print_format || 'standard',
          pages: Number(book.page_count || 0) || null,
          repricedAt: startedAt
        },
        metadata: {
          ...baseMetadata,
          pricing: refreshedPricing.breakdown,
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
          metadata: { ...baseMetadata, pricing: refreshedPricing.breakdown, gelatoProgress: { ...progress, updatedAt: getNowIso() } }
        })
        .eq('id', order.id)
        .then(() => {}, () => {});
    };

    (async () => {
      try {
        const result = await submitPrintOrderToGelato({
          db: supabase, book, order: orderForSubmission, ownerEmail: req.user.email, onProgress: writeProgress
        });
        if (result.error) {
          console.error('Envoi de test Gelato echoue pour la commande', order.id, ':', result.error);
        } else {
          console.log(`Envoi de test Gelato : brouillon ${result.gelatoOrderId} cree pour la commande ${order.id}`);
        }
      } catch (error) {
        console.error('Erreur inattendue lors de l\'envoi de test Gelato', order.id, ':', error.message);
        await supabase
          .from('orders')
          .update({ metadata: { ...(order.metadata || {}), gelatoError: error.message }, updated_at: getNowIso() })
          .eq('id', order.id);
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
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    const gelatoOrderId = order.metadata?.gelatoOrderId || null;
    const localState = {
      status: order.status,
      gelatoOrderId,
      gelatoStatus: order.metadata?.gelatoFulfillmentStatus || null,
      tracking: order.metadata?.tracking || { carrier: null, code: null, url: null },
      updatedAt: order.updated_at || null
    };

    // Commande PDF, ou impression pas encore soumise a l'imprimeur : rien a
    // demander a Gelato, l'etat local EST l'etat reel.
    if (!gelatoOrderId) {
      return res.json({ ...localState, source: 'local', stale: false });
    }

    let gelatoOrder = null;
    try {
      gelatoOrder = await gelatoClient.getOrder(gelatoOrderId);
    } catch (error) {
      console.error('Suivi Gelato indisponible pour la commande', order.id, ':', error.message);
      return res.json({ ...localState, source: 'cache', stale: true });
    }

    const rawStatus = gelatoTracking.readGelatoFulfillmentStatus(gelatoOrder);
    const mappedStatus = gelatoTracking.mapGelatoStatus(rawStatus);
    const tracking = gelatoTracking.extractTracking(gelatoOrder);

    // Avancee seulement : un statut inconnu (mappedStatus null) ou anterieur
    // laisse la commande exactement ou elle est.
    const currentRank = ORDER_STATUS_SEQUENCE.indexOf(order.status);
    const nextRank = mappedStatus ? ORDER_STATUS_SEQUENCE.indexOf(mappedStatus) : -1;
    const shouldAdvance = mappedStatus && nextRank > -1 && nextRank > currentRank;

    const nowIso = getNowIso();
    const nextMetadata = {
      ...(order.metadata || {}),
      gelatoFulfillmentStatus: rawStatus || null,
      gelatoCheckedAt: nowIso,
      tracking
    };

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
      tracking,
      updatedAt: nowIso,
      source: 'gelato',
      stale: false
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
    return stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  }

  if (!STRIPE_WEBHOOK_ALLOW_UNSIGNED) {
    const error = new Error('Configuration webhook Stripe incomplete (STRIPE_WEBHOOK_SECRET)');
    error.status = 400;
    throw error;
  }

  return parseUnsignedWebhookEvent(req.body);
};

const handleStripeWebhook = async (req, res) => {
  try {
    const event = buildStripeWebhookEvent(req);
    const eventType = cleanString(String(event?.type || ''), 120);

    if (!eventType) {
      return res.status(400).json({ error: 'Evenement Stripe invalide' });
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
      return res.status(404).json({ error: 'Livre introuvable' });
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

    const pricing = computeOrderPricing({ book: mergedBook, type, quantity });
    return res.json({
      printFormat: pricing.breakdown.printFormat,
      pageCount: pricing.breakdown.pages,
      unitCents: pricing.unitCents,
      totalCents: pricing.totalCents
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

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
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    return res.json(getApiSafeOrder(data));
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
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    const gelatoOrderType = order.metadata?.gelatoOrderType || null;
    if (gelatoOrderType === 'order') {
      return res.status(409).json({
        error: "Cette commande est partie en production chez l'imprimeur : elle ne peut pas etre supprimee."
      });
    }

    const status = String(order.status || '').toLowerCase();
    if (ORDER_STATUS_PAID_OR_AFTER.has(status) && isStripeLiveMode()) {
      return res.status(409).json({
        error: 'Cette commande a ete reellement payee (Stripe en mode live) : elle ne peut pas etre supprimee.'
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

    const { error: deleteError } = await db
      .from('orders')
      .delete()
      .eq('id', order.id)
      .eq('owner_id', req.user.id);

    if (deleteError) throw deleteError;

    return res.json({
      deleted: true,
      orderId: order.id,
      orderNumber: order.order_number,
      deletedGelatoDrafts: deletedDrafts
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
    if (req.user?.is_anonymous === true) {
      return res.status(403).json({
        error: 'Creez votre compte pour commander : il vous permettra de retrouver votre livre et de suivre sa fabrication.',
        requiresAccount: true
      });
    }

    const db = createUserScopedClient(req);
    const type = String(req.body?.type || '').trim().toLowerCase();
    const quantity = Number(req.body?.quantity || 1);
    const shippingAddress = sanitizeAddress(req.body?.shippingAddress);
    const notes = cleanString(req.body?.notes || '', 600);

    if (!ORDER_TYPES.has(type)) {
      return res.status(400).json({ error: 'Type de commande invalide' });
    }

    if ((type === 'print' || type === 'pack') && !isAddressValid(shippingAddress)) {
      return res.status(400).json({ error: 'Adresse de livraison incomplete' });
    }

    const { data: book, error: bookError } = await db
      .from('books')
      .select('*')
      .eq('id', req.body?.bookId)
      .eq('owner_id', req.user.id)
      .single();

    if (bookError || !book) {
      return res.status(404).json({ error: 'Livre introuvable' });
    }

    const lifecycleStatus = getBookLifecycleStatusFromBook(book);
    if (getLifecycleRank(lifecycleStatus) < getLifecycleRank('finalized')) {
      return res.status(400).json({
        error: 'Le livre doit etre finalise avant de lancer une commande'
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
          error: `Votre livre contient ${auDela.length} page(s) de contenu au-dela des ${declared} pages annoncees. `
            + 'Relancez une composition ou ajustez le nombre de pages : le prix et le fichier envoye a '
            + "l'imprimeur doivent porter sur le meme livre.",
          pageCountMismatch: true,
          declaredPageCount: declared,
          realPageCount: declared + auDela.length
        });
      }
    }

    const pricing = computeOrderPricing({ book, type, quantity });
    const snapshot = {
      bookId: book.id,
      title: book.title || 'Livre sans titre',
      eventType: book.event_type || null,
      recipientName: book.recipient_name || null,
      pages: Number(book.page_count || 0) || null,
      printFormat: book.print_format || 'standard',
      lifecycleStatus,
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
      currency: 'EUR',
      unit_cents: pricing.unitCents,
      total_cents: pricing.totalCents,
      shipping_address: type === 'pdf' ? null : shippingAddress,
      metadata: {
        notes,
        pricing: pricing.breakdown
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
    error: 'Paiement direct desactive. Utilisez Stripe Checkout.'
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
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    if (!['draft', 'awaiting_payment'].includes(order.status)) {
      return res.status(409).json({ error: 'Commande deja en paiement ou traitee' });
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
      line_items: [
        {
          quantity: Number(order.quantity || 1),
          price_data: {
            currency: String(order.currency || 'EUR').toLowerCase(),
            unit_amount: Number(order.unit_cents || order.total_cents || 0),
            product_data: {
              name: `Livre souvenir - ${order.book_title || 'Sans titre'}`,
              description: `Commande ${order.order_number || ''} (${order.type || 'pdf'})`
            }
          }
        }
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
      return res.status(400).json({ error: 'sessionId requis' });
    }

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session Stripe introuvable' });
    }

    const sessionOrderId = String(session.metadata?.orderId || '');
    if (sessionOrderId && sessionOrderId !== String(order.id)) {
      return res.status(400).json({ error: 'Session Stripe non associee a cette commande' });
    }

    if (String(session.payment_status || '').toLowerCase() !== 'paid') {
      return res.status(409).json({ error: 'Paiement Stripe non confirme' });
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

    return res.json(getApiSafeOrder(updatedOrder));
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
});

router.post('/:orderId/status', authenticate, async (req, res) => {
  try {
    const db = createUserScopedClient(req);
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const nextMetadata = req.body?.metadata;

    if (!ORDER_STATUSES.has(nextStatus)) {
      return res.status(400).json({ error: 'Statut de commande invalide' });
    }

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.orderId)
      .eq('owner_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    if (!canUseStatusForOrderType(nextStatus, order.type)) {
      return res.status(400).json({ error: 'Statut incompatible avec ce type de commande' });
    }
    if (!canTransitionOrderStatus(order.status, nextStatus)) {
      return res.status(409).json({
        error: `Transition de statut invalide (${order.status} -> ${nextStatus})`
      });
    }
    if (nextStatus === 'paid') {
      return res.status(403).json({
        error: 'Statut paid reserve a la confirmation Stripe'
      });
    }
    if (ORDER_STATUS_REQUIRES_PAID.has(nextStatus) && !ORDER_STATUS_PAID_OR_AFTER.has(order.status)) {
      return res.status(409).json({
        error: 'Paiement requis avant de lancer la production'
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

    return res.json(getApiSafeOrder(data));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.handleStripeWebhook = handleStripeWebhook;
module.exports.computeOrderPricing = computeOrderPricing;
