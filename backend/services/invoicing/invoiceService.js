// backend/services/invoicing/invoiceService.js
//
// Emet la facture d'une commande payee : numero sequentiel (voir
// next_invoice_number en base, phase25_invoices.sql), PDF genere via
// pdfService (meme moteur que le livre/la couverture, mode "simple/rapide"),
// stocke dans le bucket PRIVE "invoices", et une ligne dans invoices
// (instantane complet — jamais recalcule apres coup).
//
// IDEMPOTENT : persistStripePaymentForOrder (routes/orders.js) peut etre
// declenche deux fois pour la meme commande (webhook Stripe + route de
// confirmation navigateur, en course l'une contre l'autre) — generateInvoice
// verifie d'abord qu'aucune facture n'existe deja pour cette commande, et la
// contrainte UNIQUE sur invoices.order_id (voir la migration) couvre la
// fenetre de course residuelle entre la verification et l'ecriture.
//
// JAMAIS BLOQUANT pour le paiement : toute erreur ici est capturee par
// l'appelant (voir routes/orders.js) exactement comme les autres effets de
// bord post-paiement (verrouillage du livre, soumission Gelato).

const fsp = require('fs/promises');
const supabase = require('../../config/supabase');
const pdfService = require('../composition/pdfService');
const { renderInvoiceHtml } = require('./invoiceTemplate');
const { sellerIdentity, isSellerIdentityComplete } = require('./sellerIdentity');

const INVOICES_BUCKET = 'invoices';

const FORMAT_LABELS = {
  livret: 'Livret · 20 × 20 cm',
  standard: 'Standard · 21 × 28 cm',
  luxe: 'Luxe · 21 × 28 cm'
};

let bucketVerifie = false;
async function ensureInvoicesBucket() {
  if (bucketVerifie) return;
  const { data: existant } = await supabase.storage.getBucket(INVOICES_BUCKET);
  if (!existant) {
    // PRIVE (public: false) : une facture porte l'adresse postale et le
    // montant paye par le client — plus sensible qu'un fichier d'impression
    // (print-files, public par necessite pour Gelato). Aucun acces direct
    // par URL ; voir GET /orders/:orderId/invoice (URL signee, courte duree).
    const { error } = await supabase.storage.createBucket(INVOICES_BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message || '')) {
      throw new Error(`Creation du bucket "${INVOICES_BUCKET}" impossible : ${error.message}`);
    }
  }
  bucketVerifie = true;
}

/**
 * Construit les lignes de la facture a partir de ce qui a ete REELLEMENT
 * facture (order.unit_cents/quantity/total_cents), jamais recalcule depuis
 * la grille tarifaire courante : une facture doit refleter ce qui a ete
 * paye, meme si les tarifs ont change depuis (meme principe que
 * order.snapshot, voir pricingConfig.js).
 */
function buildLineItems(order) {
  const quantity = Number(order.quantity) > 0 ? Number(order.quantity) : 1;
  const unitCents = Number(order.unit_cents) || 0;
  const totalCents = Number(order.total_cents) || unitCents * quantity;
  const montantProduit = unitCents * quantity;
  // La livraison n'a pas sa propre colonne sur la commande (voir
  // computeOrderPricing) : on la deduit du reste, ce qui garantit que les
  // lignes de la facture s'additionnent TOUJOURS exactement au montant reel
  // paye, quel que soit le type de commande.
  const shippingCents = Math.max(0, totalCents - montantProduit);

  const printFormat = order.snapshot?.printFormat || order.metadata?.pricing?.printFormat;
  const pages = order.snapshot?.pages || order.metadata?.pricing?.pages;
  const titreLivre = order.book_title || order.snapshot?.title;

  const libelles = {
    pdf: 'Livre photo — version PDF',
    pack: 'Livre photo imprimé + version PDF (pack)',
    print: 'Livre photo imprimé'
  };

  const detail = [
    titreLivre ? `« ${titreLivre} »` : null,
    order.type !== 'pdf' ? FORMAT_LABELS[printFormat] : null,
    pages ? `${pages} pages` : null
  ].filter(Boolean).join(' · ') || null;

  const lignes = [{
    label: libelles[order.type] || 'Livre photo',
    detail,
    quantity,
    unitCents,
    amountCents: montantProduit
  }];

  if (shippingCents > 0) {
    lignes.push({ label: 'Livraison', detail: null, quantity: 1, unitCents: shippingCents, amountCents: shippingCents });
  }

  return lignes;
}

/**
 * Identite de l'acheteur : adresse de facturation si distincte de la
 * livraison, sinon adresse de livraison, sinon (commande PDF, aucune des
 * deux) le compte reel — jamais une adresse devinee.
 */
async function resolveBuyer(order) {
  const adresseFacturation = order.metadata?.billingSameAsShipping === false
    ? order.metadata?.billingAddress
    : null;
  const adresse = adresseFacturation || order.shipping_address || null;

  let email = adresse?.email || null;
  let name = adresse?.fullName || null;

  if (!email || !name) {
    try {
      const { data } = await supabase.auth.admin.getUserById(order.owner_id);
      email = email || data?.user?.email || null;
      name = name || data?.user?.user_metadata?.full_name || null;
    } catch (_erreur) {
      // Compte introuvable/API indisponible : on garde ce qu'on a deja.
    }
  }

  return {
    // Jamais le nom de la marque a la place du client : a defaut de nom
    // reel, l'email identifie quand meme la bonne personne (toujours
    // connu — compte authentifie ou adresse de livraison) ; seul le
    // tout dernier repli ('Client') couvre l'improbable cas ou meme
    // l'email est indisponible (compte Supabase introuvable).
    name: name || email || 'Client',
    email,
    address: adresse
      ? { line1: adresse.line1, line2: adresse.line2 || null, postalCode: adresse.postalCode, city: adresse.city, country: adresse.country }
      : null
  };
}

async function issueInvoiceNumber(year) {
  const { data, error } = await supabase.rpc('next_invoice_number', { p_year: year });
  if (error) throw new Error(`Numerotation de facture impossible : ${error.message}`);
  const numero = Number(data);
  if (!Number.isFinite(numero) || numero < 1) {
    throw new Error(`Numero de facture invalide recu de la base : ${data}`);
  }
  return `F-${year}-${String(numero).padStart(6, '0')}`;
}

/**
 * Point d'entree. Retourne la ligne `invoices` (avec un buffer PDF attache
 * sous `_pdfBuffer`, jamais persiste, utile a l'appelant pour l'envoi
 * immediat par email sans re-telecharger depuis le stockage).
 */
async function generateInvoiceForOrder(order) {
  if (!order?.id || !order?.owner_id) {
    throw new Error('Commande incomplete : impossible d\'emettre une facture.');
  }

  const { data: existante } = await supabase.from('invoices').select('*').eq('order_id', order.id).maybeSingle();
  if (existante) return existante;

  if (!isSellerIdentityComplete()) {
    // On emet quand meme (le client ne doit pas attendre une regularisation
    // administrative pour recevoir SA facture) mais avec les mentions
    // "[À COMPLÉTER]" bien visibles — jamais un SIRET ou une adresse
    // inventes. Voir sellerIdentity.js.
    console.warn(`[factures] identite vendeur incomplete (INVOICE_SELLER_*) — facture ${order.id} emise avec des mentions a completer`);
  }

  const year = new Date(order.paid_at || Date.now()).getFullYear();
  const invoiceNumber = await issueInvoiceNumber(year);
  const seller = sellerIdentity();
  const buyer = await resolveBuyer(order);
  const lineItems = buildLineItems(order);
  const totals = { totalCents: Number(order.total_cents) || 0 };
  const issuedAt = new Date().toISOString();

  const html = renderInvoiceHtml({
    invoiceNumber,
    issuedAt,
    seller,
    buyer,
    order: { orderNumber: order.order_number || order.id, paidAt: order.paid_at, currency: order.currency },
    lineItems,
    totals
  });

  const pdfPath = await pdfService.renderPdfFromHtml(html, { fileBaseName: `facture-${invoiceNumber}` });
  let buffer;
  try {
    buffer = await fsp.readFile(pdfPath);
  } finally {
    fsp.unlink(pdfPath).catch(() => {});
  }

  await ensureInvoicesBucket();
  const storagePath = `orders/${order.id}/${invoiceNumber}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(INVOICES_BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });
  if (uploadError) {
    throw new Error(`Televersement de la facture impossible : ${uploadError.message}`);
  }

  const { data: inserted, error: insertError } = await supabase.from('invoices').insert({
    order_id: order.id,
    owner_id: order.owner_id,
    invoice_number: invoiceNumber,
    issued_at: issuedAt,
    seller,
    buyer,
    line_items: lineItems,
    totals,
    storage_path: storagePath
  }).select('*').single();

  if (insertError) {
    // Fenetre de course residuelle (voir entete) : un appel concurrent a pu
    // ecrire sa propre facture entre notre verification et notre ecriture —
    // la contrainte UNIQUE sur order_id l'aurait alors refusee ici. On relit
    // plutot que d'echouer.
    const { data: apresCoup } = await supabase.from('invoices').select('*').eq('order_id', order.id).maybeSingle();
    if (apresCoup) return apresCoup;
    throw new Error(`Enregistrement de la facture impossible : ${insertError.message}`);
  }

  return { ...inserted, _pdfBuffer: buffer };
}

/** URL signee de telechargement (bucket prive) — courte duree, generee a la demande. */
async function signedInvoiceUrl(storagePath, { expiresInSeconds = 300 } = {}) {
  const { data, error } = await supabase.storage.from(INVOICES_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw new Error(`URL de facture impossible a generer : ${error.message}`);
  return data.signedUrl;
}

module.exports = {
  generateInvoiceForOrder,
  signedInvoiceUrl,
  buildLineItems,
  INVOICES_BUCKET
};
