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
  // « draft » chez Gelato = le fichier est chez l'imprimeur, en attente de
  // lancement. Longtemps traduit par `print_queued` (« Mise en
  // production »), une etape intermediaire qui ne voulait rien dire pour
  // l'acheteur : il venait de payer, son livre etait parti, et l'ecran lui
  // parlait de mise en production. On dit maintenant ce qui s'est
  // reellement passe — envoye a l'imprimeur (2026-09-20).
  draft: 'sent_to_printer',
  created: 'sent_to_printer',
  passed: 'sent_to_printer',
  pending: 'sent_to_printer',
  // « en production » veut dire EN COURS de fabrication, pas fabrique.
  // Ces trois etats etaient traduits par `printed`, affiche « Imprime » :
  // on annoncait au client un livre termine alors qu il etait encore sous
  // presse (signale le 2026-09-18 sur une vraie commande). Et comme un
  // statut ne recule jamais, l'erreur ne se corrigeait plus ensuite.
  //
  // `printed` reste reserve a l'etat Gelato du meme nom, le seul qui
  // signifie reellement « imprime, en attente d expedition ».
  printing: 'sent_to_printer',
  inproduction: 'sent_to_printer',
  production: 'sent_to_printer',
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
 * Fenetre de livraison annoncee par Gelato, quand elle existe.
 *
 * Demande du 2026-09-20 : « peut-etre afficher les delais ». On n'invente
 * AUCUN delai — pas de « comptez 3 a 5 jours » ecrit en dur, qui serait faux
 * le jour ou l'imprimeur change de transporteur ou de pays de production.
 * On n'affiche que ce que Gelato annonce lui-meme, et rien si Gelato ne dit
 * rien : une absence vaut mieux qu'une promesse inventee.
 *
 * @returns {{minDate: string|null, maxDate: string|null}}
 */
function extractDelivery(gelatoOrder) {
  const shipment = gelatoOrder?.shipment || {};
  const items = Array.isArray(gelatoOrder?.items) ? gelatoOrder.items : [];
  const itemFulfillments = items.flatMap((item) => (Array.isArray(item?.fulfillments) ? item.fulfillments : []));
  const first = itemFulfillments[0] || {};

  return {
    minDate: firstNonEmpty(
      shipment.minDeliveryDate,
      shipment.estimatedDeliveryMinDate,
      first.minDeliveryDate
    ),
    maxDate: firstNonEmpty(
      shipment.maxDeliveryDate,
      shipment.estimatedDeliveryMaxDate,
      first.maxDeliveryDate
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

// Une commande Gelato est-elle un simple BROUILLON, ou une commande qui
// part vraiment en fabrication ?
//
// Un brouillon cree par l'application peut etre confirme depuis le tableau
// de bord Gelato : il devient alors une vraie commande, facturee et
// imprimee, sans que notre base en sache rien. Constate le 2026-09-18 — la
// commande etait `order` / `paid` chez Gelato alors que nos metadonnees la
// croyaient encore `draft`, ce qui desarmait le garde-fou qui empeche de
// supprimer une commande partie en production.
//
// Lecture defensive : une valeur absente ou inattendue renvoie null, et
// l'appelant garde ce qu'il savait plutot que d'ecraser avec du vide.
function readGelatoOrderType(gelatoOrder) {
  const brut = firstNonEmpty(gelatoOrder?.orderType, gelatoOrder?.type);
  if (!brut) return null;
  const normalise = String(brut).trim().toLowerCase();
  return (normalise === 'order' || normalise === 'draft') ? normalise : null;
}

module.exports = {
  mapGelatoStatus,
  extractTracking,
  extractDelivery,
  readGelatoFulfillmentStatus,
  readGelatoOrderType,
  STATUS_MAP
};
