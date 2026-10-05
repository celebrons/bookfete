// backend/services/printing/gelatoOrderService.js
//
// Soumet une VRAIE commande (payee) a l'impression chez Gelato : genere le
// fichier d'impression combine (voir gelatoPrintFile.js, structure validee
// a 0 erreur le 2026-09-10 sur les 3 formats via l'outil officiel Gelato),
// l'heberge (print-files), et cree la commande Gelato correspondante.
//
// SECURITE — pilote par le mode global test/production (voir
// services/settings/appMode.js, bouton de l'espace admin depuis le
// 2026-10-04) : tant que ce mode n'est pas 'production', chaque soumission
// reste un brouillon Gelato (orderType:'draft', jamais facture/imprime/
// expedie reellement) — choix explicite de l'utilisateur (2026-09-10,
// AskUserQuestion) pour valider le pipeline sur de vraies commandes payees
// SANS risque de production accidentelle. Passer en 'production' declenche
// une vraie production/facturation automatique pour CHAQUE commande
// Impression/Pack payee a partir de ce moment — decision business, jamais a
// activer sans confirmation explicite et recente de l'utilisateur pour ce
// changement precis (meme principe que gelatoClient.js pour un appel
// isole). Avant le 2026-10-04 cette meme decision vivait dans la variable
// d'environnement GELATO_LIVE_ORDERS, reglable seulement par SSH+redemarrage.
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
const { resolveGelatoProduct, resolveGelatoPageCount } = require('./gelatoCatalog');
const { buildGelatoPrintReadyPdf } = require('./gelatoPrintFile');
const { uploadPrintFile } = require('./printFileStorage');
const { getAppModeSync } = require('../settings/appMode');
const { resolveCountryIso2 } = require('./countryCodes');
const gelatoClient = require('./gelatoClient');

// Meme ordre que ORDER_STATUSES/ORDER_STATUS_SEQUENCE (routes/orders.js et
// frontend/utils/orderWorkflow.js) : sert uniquement a ne jamais faire
// RECULER une commande. Redeclare ici plutot qu'importe depuis le routeur,
// qui monterait tout un Express pour lire un tableau.
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
  const lastName = spaceIndex > 0 ? fullName.slice(spaceIndex + 1) : 'Bookipix';

  return {
    firstName,
    lastName,
    addressLine1: address?.line1 || '',
    addressLine2: address?.line2 || undefined,
    city: address?.city || '',
    postCode: address?.postalCode || '',
    // Exige par Gelato pour US/CA/AU (verifie aupres de leur documentation,
    // 2026-10-05) — sanitizeAddress (routes/orders.js) le rend obligatoire
    // a la saisie pour ces memes pays, donc toujours present ici quand il
    // compte vraiment ; undefined ailleurs, jamais une chaine vide envoyee
    // a l'API pour un pays qui n'en a pas besoin.
    state: address?.state || undefined,
    country: resolveCountryIso2(address?.country),
    email: ownerEmail || undefined,
    phone: address?.phone || undefined
  };
}

function isGelatoLiveOrdersEnabled() {
  return getAppModeSync() === 'production';
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
  const isLive = isGelatoLiveOrdersEnabled();
  // Capture en dehors du bloc ou elle est creee : si createOrder reussit
  // mais que l'ecriture Supabase qui suit echoue (reseau, table verrouillee),
  // le bloc catch doit savoir qu'une VRAIE commande existe deja chez Gelato
  // — sinon une nouvelle tentative repartirait de zero et en creerait une
  // SECONDE (le garde-fou d'idempotence en tete de fonction ne lit que
  // metadata.gelatoOrderId, jamais ecrit dans ce scenario precis).
  let gelatoOrderCree = null;

  try {
    const [interiorPages, items, layouts, template] = await Promise.all([
      // listPagesForRender, pas listPages : le FICHIER envoye a l imprimeur
      // doit contenir exactement les pages FACTUREES. Une page laissee vierge
      // n a pas de ligne en base ; la compter par lignes envoyait un livre plus
      // court que celui paye (2026-09-14).
      bookContentService.listPagesForRender(book.id, book.page_count),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts(),
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null)
    ]);

    if (interiorPages.length === 0) {
      throw new Error("Le livre n'a aucune page interieure composee.");
    }

    const format = resolveRenderFormat(book.print_format);
    const gelatoProduct = resolveGelatoProduct(book.print_format);
    const pageCount = resolveGelatoPageCount(interiorPages.length, book.print_format);

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
    gelatoOrderCree = gelatoOrder;

    const nextMetadata = {
      ...(order.metadata || {}),
      gelatoOrderId: gelatoOrder.id,
      gelatoOrderType: isLive ? 'order' : 'draft',
      gelatoSubmittedAt: nowIso,
      gelatoFileUrl: fileUrl,
      gelatoError: null
    };

    // L'ENVOI REUSSI CHANGE LE STATUT, PAS SEULEMENT LES METADONNEES.
    //
    // Jusqu'ici cette fonction n'ecrivait que `metadata` : la commande
    // restait affichee « Payee » alors que le livre etait deja chez
    // l'imprimeur, et il fallait attendre qu'un affichage du suivi
    // interroge Gelato pour que le statut bouge enfin. D'ou « on ne sait
    // pas que ca a ete envoye » (2026-09-20).
    //
    // Jamais de recul : si la commande est deja plus avancee (imprimee,
    // expediee), on ne la ramene pas en arriere.
    const rangCourant = ORDER_STATUS_SEQUENCE.indexOf(order.status);
    const rangEnvoye = ORDER_STATUS_SEQUENCE.indexOf('sent_to_printer');
    const avance = rangCourant === -1 || rangCourant < rangEnvoye;

    await db.from('orders').update({
      ...(avance ? { status: 'sent_to_printer' } : {}),
      metadata: nextMetadata,
      updated_at: nowIso
    }).eq('id', order.id);

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
      gelatoErrorAt: nowIso,
      // VOIR gelatoOrderCree plus haut : si la commande a ete creee chez
      // Gelato juste avant que l'echec ne survienne (ex. l'ecriture
      // Supabase qui suit createOrder), on enregistre quand meme son id ICI
      // — sinon une nouvelle tentative croirait n'avoir jamais ete envoyee
      // et en creerait une seconde chez Gelato, un vrai doublon facture le
      // jour ou GELATO_LIVE_ORDERS=1.
      ...(gelatoOrderCree ? {
        gelatoOrderId: gelatoOrderCree.id,
        gelatoOrderType: isLive ? 'order' : 'draft',
        gelatoSubmittedAt: nowIso
      } : {})
    };
    // PAS de `.catch()` directement sur la requete : le constructeur de
    // requetes Supabase est « thenable » (il a `.then`) mais n'expose PAS
    // `.catch`. Ecrire `.eq(...).catch(...)` levait donc « .catch is not a
    // function » — et cette erreur-la remplacait la VRAIE erreur Gelato
    // qu'on essayait justement d'enregistrer. Le defaut ne se voyait que
    // le jour ou une soumission echouait, c'est-a-dire au pire moment
    // (constate le 2026-09-15 dans le journal serveur).
    try {
      await db.from('orders').update({ metadata: nextMetadata, updated_at: nowIso }).eq('id', order.id);
    } catch (_persistError) {
      // Ne jamais masquer l'erreur d'origine : c'est elle qui explique
      // pourquoi la soumission a echoue.
    }
    return { skipped: false, error: errorMessage, gelatoOrderId: gelatoOrderCree?.id || null };
  }
}

module.exports = { submitPrintOrderToGelato, isGelatoLiveOrdersEnabled, mapShippingAddress };
