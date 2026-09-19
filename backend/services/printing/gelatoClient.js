// backend/services/printing/gelatoClient.js
//
// Client minimal pour l'API Commandes Gelato (order.gelatoapis.com/v4) —
// distinct de l'API Catalogue (product.gelatoapis.com/v3, voir
// gelatoCatalog.js). Schema reconstitue empiriquement le 2026-09-09 (docs
// officielles bloquees par Cloudflare pour toute recuperation automatisee) —
// voir memoire "gelato-integration-status" pour le detail complet de
// l'exploration et son etat de confiance.
//
// IMPORTANT — orderType:
//   'draft'  = commande creee cote Gelato, JAMAIS envoyee en production, ne
//              facture rien. Verifie a 3 reprises le 2026-09-09 (creation +
//              suppression propres). C'est le mode a utiliser pour TOUT test.
//   'order'  = soumission REELLE : declenche production + facturation sur le
//              compte connecte. Ne JAMAIS appeler createOrder(..., {orderType:'order'})
//              sans une confirmation explicite et recente de l'utilisateur
//              pour CETTE commande precise — comportement irreversible et
//              couteux, jamais un choix par defaut de ce module.
//
// GELATO_API_KEY requise dans backend/.env.

require('dotenv').config();

const BASE_URL = 'https://order.gelatoapis.com/v4';

function getApiKey() {
  const key = process.env.GELATO_API_KEY;
  if (!key) {
    throw new Error('GELATO_API_KEY manquante (backend/.env)');
  }
  return key;
}

// DELAI DE GARDE SUR LES APPELS A GELATO.
//
// Aucun n'en avait. Un appel qui traine bloquait la requete du client
// jusqu a ce que SON navigateur abandonne au bout de quinze secondes,
// avec « le serveur met trop de temps a repondre » — alors que le serveur
// allait tres bien et attendait simplement un tiers.
//
// Televerser un fichier de 48 Mo prend du temps : le delai est genereux.
// Mais BORNE, pour que la panne soit lisible du cote ou elle se produit.
const DELAI_GELATO_MS = 120 * 1000;

async function gelatoOrderFetch(pathSuffix, options = {}) {
  const response = await fetch(`${BASE_URL}${pathSuffix}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(DELAI_GELATO_MS),
    headers: {
      'X-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_err) {
    json = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(json?.message || `Gelato Order API ${response.status} sur ${pathSuffix}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

// files : [{ type: 'default' | 'cover', url }] — voir le commentaire d'en-tete
// de gelatoCatalog.js / la memoire projet : valeurs "default"/"cover" non
// confirmees par une vraie commande de production a ce stade (seulement des
// commandes 'draft', qui n'ont pas fait apparaitre d'erreur de validation
// sur `type`, donc pas encore de certitude absolue) — A VERIFIER sur le
// premier vrai test avant tout usage recurrent.
function buildOrderPayload({
  orderReferenceId,
  orderType = 'draft',
  currency = 'EUR',
  shippingAddress,
  productUid,
  pageCount,
  quantity = 1,
  itemReferenceId = 'item-1',
  interiorFileUrl,
  coverFileUrl
}) {
  const files = [];
  if (interiorFileUrl) files.push({ type: 'default', url: interiorFileUrl });
  if (coverFileUrl) files.push({ type: 'cover', url: coverFileUrl });

  return {
    orderType,
    orderReferenceId,
    currency,
    shippingAddress,
    items: [
      {
        itemReferenceId,
        productUid,
        pageCount,
        quantity,
        files
      }
    ]
  };
}

async function createOrder(payload) {
  return gelatoOrderFetch('/orders', { method: 'POST', body: JSON.stringify(payload) });
}

async function getOrder(orderId) {
  return gelatoOrderFetch(`/orders/${encodeURIComponent(orderId)}`);
}

async function deleteOrder(orderId) {
  return gelatoOrderFetch(`/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
}

module.exports = {
  buildOrderPayload,
  createOrder,
  getOrder,
  deleteOrder
};
