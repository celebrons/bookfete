const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');

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

    if (!['draft', 'awaiting_payment'].includes(order.status)) {
      return res.status(409).json({ error: 'Commande deja payee ou terminee' });
    }

    const nowIso = getNowIso();
    const paymentReference = cleanString(req.body?.paymentReference || '', 120) || `SIM-${Date.now()}`;

    const { data, error } = await db
      .from('orders')
      .update({
        status: 'paid',
        payment_reference: paymentReference,
        paid_at: nowIso,
        updated_at: nowIso
      })
      .eq('id', order.id)
      .eq('owner_id', req.user.id)
      .select('*')
      .single();

    if (error) throw error;
    return res.json(getApiSafeOrder(data));
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
