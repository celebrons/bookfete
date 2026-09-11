// backend/services/printing/gelatoTracking.js
//
// Traduit l'etat REEL d'une commande chez Gelato en vocabulaire Celebrons
// (voir ORDER_STATUSES dans routes/orders.js et ORDER_STATUS_SEQUENCE cote
// frontend, utils/orderWorkflow.js) — ces statuts existaient deja mais rien
// ne les faisait avancer pour une commande imprimee : c'est ce module qui
// comble ce trou (2026-09-11).
//
// PRUDENCE ASSUMEE : la correspondance ci-dessous est ecrite d'apres la
// documentation Gelato v4, sans avoir pu observer une vraie reponse
// `getOrder` (aucune commande en base ne portait encore de gelatoOrderId au
// moment de l'ecriture). Elle est donc concue pour ne JAMAIS nuire si elle
// se trompe : toute valeur inconnue renvoie null, l'appelant conserve alors
// le statut courant et se contente d'exposer la chaine brute. Un mauvais
// libelle affiche est acceptable ; un statut ecrase a tort ne l'est pas.
//
// Fonctions pures, aucun acces reseau (l'appel API vit dans gelatoClient.js).

// Gelato -> Celebrons. Les cles sont normalisees (minuscules, sans espace ni
// tiret/underscore) pour absorber les variantes d'ecriture d'une version
// d'API a l'autre ("in_production", "inProduction", "in production"...).
const STATUS_MAP = {
  draft: 'print_queued',
  created: 'sent_to_printer',
  passed: 'sent_to_printer',
  pending: 'sent_to_printer',
  printing: 'printed',
  inproduction: 'printed',
  production: 'printed',
  printed: 'printed',
  shipped: 'shipped',
  intransit: 'shipped',
  delivered: 'delivered',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  failed: 'failed',
  rejected: 'failed'
};

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * @param {string} raw - fulfillmentStatus renvoye par Gelato
 * @returns {string|null} statut Celebrons, ou null si non reconnu (l'appelant
 *   garde alors le statut courant — jamais d'ecrasement a l'aveugle).
 */
function mapGelatoStatus(raw) {
  return STATUS_MAP[normalizeKey(raw)] || null;
}

// Premiere valeur non vide parmi plusieurs chemins possibles : la forme
// exacte de la reponse Gelato n'est pas garantie (et varie selon que la
// commande est expediee en un ou plusieurs colis), donc on cherche large
// plutot que de supposer un seul emplacement.
function firstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) || null;
}

/**
 * Extrait un numero/lien de suivi d'une reponse Gelato, de facon tolerante :
 * aucun champ n'est suppose present, et l'absence totale d'information
 * renvoie simplement des valeurs nulles (jamais d'exception).
 * @returns {{carrier: string|null, code: string|null, url: string|null}}
 */
function extractTracking(gelatoOrder) {
  const shipment = gelatoOrder?.shipment || {};
  const items = Array.isArray(gelatoOrder?.items) ? gelatoOrder.items : [];
  // Une commande Celebrons = un seul produit, mais Gelato expose le suivi au
  // niveau de l'expedition ET/OU de chaque article selon les cas.
  const itemFulfillments = items.flatMap((item) => (Array.isArray(item?.fulfillments) ? item.fulfillments : []));
  const firstFulfillment = itemFulfillments[0] || {};

  return {
    carrier: firstNonEmpty(
      shipment.shipmentMethodName,
      shipment.carrierName,
      firstFulfillment.shipmentMethodName,
      firstFulfillment.carrierName
    ),
    code: firstNonEmpty(
      shipment.trackingCode,
      shipment.trackingNumber,
      firstFulfillment.trackingCode,
      firstFulfillment.trackingNumber
    ),
    url: firstNonEmpty(
      shipment.trackingUrl,
      firstFulfillment.trackingUrl
    )
  };
}

/**
 * Statut de production tel que Gelato le voit, tous champs confondus :
 * l'etat global de la commande prime, mais certaines reponses ne le portent
 * qu'au niveau des articles — on retombe donc dessus si besoin.
 * @returns {string|null} la chaine BRUTE de Gelato (jamais traduite ici)
 */
function readGelatoFulfillmentStatus(gelatoOrder) {
  const items = Array.isArray(gelatoOrder?.items) ? gelatoOrder.items : [];
  return firstNonEmpty(
    gelatoOrder?.fulfillmentStatus,
    gelatoOrder?.status,
    items[0]?.fulfillmentStatus
  );
}

module.exports = {
  mapGelatoStatus,
  extractTracking,
  readGelatoFulfillmentStatus,
  STATUS_MAP
};
