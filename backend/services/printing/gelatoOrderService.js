// backend/services/printing/gelatoOrderService.js
//
// Soumet une VRAIE commande (payee) a l'impression chez Gelato : genere le
// fichier d'impression combine (voir gelatoPrintFile.js, structure validee
// a 0 erreur le 2026-09-10 sur les 3 formats via l'outil officiel Gelato),
// l'heberge (print-files), et cree la commande Gelato correspondante.
//
// SECURITE — GELATO_LIVE_ORDERS (meme convention que STRIPE_ENABLED,
// routes/orders.js) : tant que cette variable d'environnement n'est pas
// exactement '1', chaque soumission reste un brouillon Gelato
// (orderType:'draft', jamais facture/imprime/expedie reellement) — choix
// explicite de l'utilisateur (2026-09-10, AskUserQuestion) pour valider le
// pipeline sur de vraies commandes payees SANS risque de production
// accidentelle. Passer a '1' declenche une vraie production/facturation
// automatique pour CHAQUE commande Impression/Pack payee a partir de ce
// moment — decision business, jamais a activer sans confirmation explicite
// et recente de l'utilisateur pour ce changement precis (meme principe que
// gelatoClient.js pour un appel isole).
//
// Idempotence : si order.metadata.gelatoOrderId existe deja, ne resoumet
// rien (retourne l'etat existant) — appele depuis 2 points d'entree
// possibles (webhook Stripe + route de confirmation cote client), tous
// deux peuvent potentiellement s'executer plus d'une fois pour la meme
// commande.

const bookContentService = require('../composition/bookContentService');
const templateCatalog = require('../composition/templateCatalog');
const { resolveCoverFormat, COVER_FORMATS, DEFAULT_COVER_FORMAT_ID } = require('../composition/coverFormat');
const { resolveFormatDensity } = require('../composition/formatDensity');
const { resolveGelatoProduct, clampToValidGelatoPageCount } = require('./gelatoCatalog');
const { buildGelatoPrintReadyPdf } = require('./gelatoPrintFile');
const { uploadPrintFile } = require('./printFileStorage');
const { resolveCountryIso2 } = require('./countryCodes');
const gelatoClient = require('./gelatoClient');

function resolveRenderFormat(formatId) {
  const normalized = Object.prototype.hasOwnProperty.call(COVER_FORMATS, formatId) ? formatId : DEFAULT_COVER_FORMAT_ID;
  return { formatId: normalized, ...resolveCoverFormat(formatId), ...resolveFormatDensity(formatId) };
}

// order.shipping_address (voir routes/orders.js: sanitizeAddress) ->
// forme attendue par gelatoClient.buildOrderPayload. "fullName" n'est
// jamais separe prenom/nom cote formulaire (un seul champ) — coupe au
// premier espace, repli complet sur firstName si aucun espace (un champ
// vide chez Gelato serait pire qu'un lastName duplique).
function mapShippingAddress(address, ownerEmail) {
  const fullName = String(address?.fullName || '').trim();
  const spaceIndex = fullName.indexOf(' ');
  const firstName = spaceIndex > 0 ? fullName.slice(0, spaceIndex) : (fullName || 'Client');
  const lastName = spaceIndex > 0 ? fullName.slice(spaceIndex + 1) : 'Celebrons';

  return {
    firstName,
    lastName,
    addressLine1: address?.line1 || '',
    addressLine2: address?.line2 || undefined,
    city: address?.city || '',
    postCode: address?.postalCode || '',
    country: resolveCountryIso2(address?.country),
    email: ownerEmail || undefined,
    phone: address?.phone || undefined
  };
}

function isGelatoLiveOrdersEnabled() {
  return process.env.GELATO_LIVE_ORDERS === '1';
}

/**
 * @param {object} input - { db, book, order, ownerEmail }
 * @returns {Promise<{skipped:boolean, gelatoOrderId?:string, gelatoOrderType?:string, error?:string}>}
 */
async function submitPrintOrderToGelato({ db, book, order, ownerEmail, onProgress }) {
  if (order?.metadata?.gelatoOrderId) {
    return { skipped: true, reason: 'already_submitted', gelatoOrderId: order.metadata.gelatoOrderId };
  }

  const nowIso = new Date().toISOString();

  try {
    const [interiorPages, items, layouts, template] = await Promise.all([
      bookContentService.listPages(book.id),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts(),
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null)
    ]);

    if (interiorPages.length === 0) {
      throw new Error("Le livre n'a aucune page interieure composee.");
    }

    const format = resolveRenderFormat(book.print_format);
    const gelatoProduct = resolveGelatoProduct(book.print_format);
    const pageCount = clampToValidGelatoPageCount(interiorPages.length, book.print_format);

    const outputPath = require('path').join(
      require('../composition/pdfService').PDF_PREVIEW_DIR,
      `gelato-order-${order.id}-${Date.now()}.pdf`
    );
    const built = await buildGelatoPrintReadyPdf({
      book, items, layouts, template, format, interiorPages,
      gelatoProductUid: gelatoProduct.productUid,
      pageCount,
      outputPath,
      onProgress
    });

    // Phases restantes apres le rendu : l'envoi du fichier puis la creation
    // de la commande. Courtes par rapport au rendu, mais annoncees pour que
    // l'utilisateur ne voie pas la barre figee a 100% sans explication.
    if (typeof onProgress === 'function') onProgress({ phase: 'uploading' });
    const fileUrl = await uploadPrintFile(built.outputPath, `orders/${order.id}/print-ready.pdf`);
    if (typeof onProgress === 'function') onProgress({ phase: 'submitting' });

    const isLive = isGelatoLiveOrdersEnabled();
    const payload = gelatoClient.buildOrderPayload({
      orderReferenceId: order.order_number || order.id,
      orderType: isLive ? 'order' : 'draft',
      shippingAddress: mapShippingAddress(order.shipping_address, ownerEmail),
      productUid: gelatoProduct.productUid,
      pageCount,
      quantity: order.quantity || 1,
      interiorFileUrl: fileUrl
    });

    const gelatoOrder = await gelatoClient.createOrder(payload);

    const nextMetadata = {
      ...(order.metadata || {}),
      gelatoOrderId: gelatoOrder.id,
      gelatoOrderType: isLive ? 'order' : 'draft',
      gelatoSubmittedAt: nowIso,
      gelatoFileUrl: fileUrl,
      gelatoError: null
    };

    await db.from('orders').update({ metadata: nextMetadata, updated_at: nowIso }).eq('id', order.id);

    return {
      skipped: false,
      gelatoOrderId: gelatoOrder.id,
      gelatoOrderType: nextMetadata.gelatoOrderType
    };
  } catch (error) {
    const errorMessage = String(error?.message || 'Erreur inconnue lors de la soumission Gelato').slice(0, 500);
    const nextMetadata = {
      ...(order.metadata || {}),
      gelatoError: errorMessage,
      gelatoErrorAt: nowIso
    };
    await db.from('orders').update({ metadata: nextMetadata, updated_at: nowIso }).eq('id', order.id).catch(() => {});
    return { skipped: false, error: errorMessage };
  }
}

module.exports = { submitPrintOrderToGelato, isGelatoLiveOrdersEnabled, mapShippingAddress };
