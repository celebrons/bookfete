// backend/services/printing/gelatoProductApi.js
//
// Appels reseau au CATALOGUE Gelato (product.gelatoapis.com/v3) — distinct
// de gelatoClient.js (commandes, order.gelatoapis.com/v4). Aujourd'hui
// limite a l'endpoint cover-dimensions, decouvert et verifie le 2026-09-09
// (voir memoire "gelato-integration-status") : renvoie la geometrie exacte
// (mm) d'une couverture wraparound pour un produit + nombre de pages donnes
// — necessaire pour composer une couverture qui correspond vraiment au
// gabarit imprimeur (l'epaisseur de la tranche varie avec le nombre de
// pages), voir gelatoCoverComposer.js.

require('dotenv').config();

const BASE_URL = 'https://product.gelatoapis.com/v3';

function getApiKey() {
  const key = process.env.GELATO_API_KEY;
  if (!key) {
    throw new Error('GELATO_API_KEY manquante (backend/.env)');
  }
  return key;
}

// Gelato arrondit pageCount au palier imprimable le plus proche de son cote
// (constate empiriquement : demander 64 a deja renvoye pagesCount:68 en
// reponse) — le champ `pagesCount` de la reponse est la valeur REELLEMENT
// utilisee pour le calcul, toujours a relire plutot que supposer qu'elle
// vaut l'entree.
async function fetchCoverDimensions(productUid, pageCount) {
  const url = `${BASE_URL}/products/${encodeURIComponent(productUid)}/cover-dimensions?pageCount=${encodeURIComponent(pageCount)}`;
  const response = await fetch(url, { headers: { 'X-API-KEY': getApiKey() } });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_err) {
    json = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(json?.message || `Gelato Product API ${response.status} sur cover-dimensions`);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

module.exports = { fetchCoverDimensions };
