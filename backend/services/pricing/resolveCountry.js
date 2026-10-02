// backend/services/pricing/resolveCountry.js
//
// Pays a utiliser pour CALCULER/AFFICHER un prix (devise, frais de
// livraison) — distinct de resolveLanguage.js (langue des textes). Deux
// sources, jamais plus, par ordre de confiance :
//
//  1. L'adresse de livraison REELLE d'une commande en cours de creation
//     (shippingAddress.country, deja normalisee en ISO2 par
//     countryCodes.js) — la seule source vraiment autoritaire, puisque
//     c'est elle qui determine ce que Gelato facture reellement. Fournie
//     explicitement par l'appelant (routes/orders.js), jamais devinee ici.
//
//  2. L'en-tete X-App-Country, envoye par le frontend sur chaque requete
//     (meme mecanisme que X-App-Language, voir httpClient.js) — reflete le
//     pays choisi par le visiteur AVANT d'avoir rempli une adresse (page
//     Tarifs, choix du format a la creation du livre). Sans lui, ces
//     ecrans n'auraient aucune idee du pays et retomberaient toujours sur
//     la France.
//
// Repli sur la France dans tous les autres cas — jamais un pays non
// reconnu par resolveCountryIso2 (voir services/printing/countryCodes.js,
// meme logique de repli explicite que tout le reste de ce chantier).
const { resolveCountryIso2, DEFAULT_ISO2 } = require('../printing/countryCodes');

function resolveCountry(req, explicitCountry) {
  if (explicitCountry) {
    return resolveCountryIso2(explicitCountry);
  }

  const headerCountry = req?.headers?.['x-app-country'];
  if (headerCountry) {
    return resolveCountryIso2(headerCountry);
  }

  return DEFAULT_ISO2;
}

module.exports = { resolveCountry };
