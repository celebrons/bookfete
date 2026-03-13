const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');
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

const computeOrderPricing = ({ book, type, quantity }) => {
  const pages = Number(book?.pages || 0);
  const safePages = Number.isFinite(pages) && pages > 0 ? pages : 64;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const printUnitCents = Math.max(6900, 4900 + Math.round(safePages * 85));
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

router.post('/', authenticate, async (req, res) => {
  try {
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

    const pricing = computeOrderPricing({ book, type, quantity });
    const snapshot = {
      bookId: book.id,
      title: book.title || 'Livre sans titre',
      eventType: book.event_type || null,
      recipientName: book.recipient_name || null,
      pages: Number(book.pages || 0) || null,
      finition: book.finition || null,
      papier: book.papier || null,
      styleNarratif: book.style_narratif || null,
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
