// backend/services/pricing/pricingConfig.js
//
// SOURCE UNIQUE de la grille tarifaire Célébrons (chantier "tarification
// dynamique", 2026-09-27). Remplace FORMAT_PRICING (ad hoc, routes/orders.js)
// et la table book_products (confirmee morte : price_cents=0/active=false
// partout, sa route n'est meme pas montee dans server.js).
//
// Tout en CENTIMES ENTIERS (meme convention que unit_cents/total_cents
// partout ailleurs dans ce projet) : jamais de flottant sur de l'argent, la
// conversion en euros affiches ne se fait qu'a l'affichage, cote frontend.
//
// pricingVersion : fige sur CHAQUE commande au moment de sa creation (voir
// routes/orders.js, snapshot) — modifier les tarifs ci-dessous ne doit
// JAMAIS changer le prix d'une commande deja passee. Faire avancer cette
// version est un signal, pas un mecanisme technique automatique : ce fichier
// ne sait pas lire l'historique, c'est la commande deja enregistree qui
// porte son propre prix fige.
const PRICING_VERSION = '2026-09-01';

// gelatoCostCents/gelatoCostPer2PagesCents : couts de revient Gelato a 30
// pages / par tranche de 2 pages supplementaires. INTERNE UNIQUEMENT — sert
// au calcul de marge (usage admin futur), ne JAMAIS exposer au client (voir
// calculateBookPrice.js : ces champs ne sortent d'aucune reponse publique).
const PRICING_CONFIG = {
  livret: {
    basePages: 30,
    basePriceCents: 2990,
    pricePer2PagesCents: 190,
    gelatoCostCents: 1172,
    gelatoCostPer2PagesCents: 35
  },
  standard: {
    basePages: 30,
    basePriceCents: 3990,
    pricePer2PagesCents: 220,
    gelatoCostCents: 1196,
    gelatoCostPer2PagesCents: 40
  },
  luxe: {
    basePages: 30,
    basePriceCents: 4990,
    pricePer2PagesCents: 290,
    gelatoCostCents: 1559,
    gelatoCostPer2PagesCents: 53
  }
};

const DEFAULT_FORMAT = 'standard';

// Livraison : structure par PAYS puis par FORMAT (retour utilisateur §20 :
// "prevoir une structure permettant d'ajouter d'autres pays plus tard").
// Seule la France est renseignee pour l'instant.
const SHIPPING_PRICE_CENTS = {
  FR: {
    livret: 500,
    standard: 500,
    luxe: 539
  }
};

const DEFAULT_COUNTRY = 'FR';

const resolveFormatConfig = (format) => PRICING_CONFIG[format] || PRICING_CONFIG[DEFAULT_FORMAT];

const resolveShippingCents = (format, country) => {
  const countryTable = SHIPPING_PRICE_CENTS[country] || SHIPPING_PRICE_CENTS[DEFAULT_COUNTRY];
  return countryTable[format] ?? countryTable[DEFAULT_FORMAT];
};

module.exports = {
  PRICING_VERSION,
  PRICING_CONFIG,
  DEFAULT_FORMAT,
  SHIPPING_PRICE_CENTS,
  DEFAULT_COUNTRY,
  resolveFormatConfig,
  resolveShippingCents
};
