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

// PDF seul (retour utilisateur, 2026-09-27) : prix fixe, independant du
// format/de la pagination — aucun exemplaire physique, aucune livraison.
// Etait code en dur (3900 cts) directement dans routes/orders.js ; deplace
// ici pour la meme raison que le reste de ce fichier — une seule source de
// verite, modifiable a un seul endroit.
const PDF_PRICE_CENTS = 799;

// Pack PDF + imprimé (retour utilisateur, 2026-09-27) : "le prix du pdf +
// le prix du livre imprimé, MOINS 10% sur ce total (hors livraison)" — plus
// un supplement fixe. La remise porte sur PDF+imprime uniquement, jamais
// sur la livraison (ajoutee a part, apres coup, comme pour tous les types).
const PACK_DISCOUNT_PERCENT = 10;

// Livraison INTERNATIONALE (chantier "international", 2026-10-02) :
// structure par PAYS puis par FORMAT, comme prevu depuis le debut (§20 :
// "prevoir une structure permettant d'ajouter d'autres pays plus tard").
//
// Chaque montant est le VRAI tarif obtenu auprès de l'API Gelato
// (shipment.gelatoapis.com/v1/shipment-methods + commande 'draft' —
// JAMAIS facturee, voir gelatoClient.js), methode la moins chere reellement
// disponible pour ce pays/produit, arrondi au-dessus (jamais en dessous du
// cout reel TTC, voir scripts/explore-gelato-shipping.js pour la methode et
// le detail des montants bruts releves le 2026-10-02 — doit etre rejoue
// periodiquement, Gelato peut changer de transporteur/tarif).
//
// IMPORTANT, decouvert au passage : l'ancien tarif France (500 cts = 5,00 €)
// etait SOUS son propre cout reel (5,99 € TTC chez Gelato, "DPD domestic
// home delivery") depuis l'introduction de la livraison facturee — corrige
// ici a 600 cts. Chaque commande francaise vendue au tarif precedent
// perdait donc de l'argent sur la livraison, jamais remarque faute de
// comparaison au cout reel.
//
// livret et standard partagent exactement le meme tarif (meme classe de
// poids chez le transporteur, verifie empiriquement pays par pays) ; luxe
// (couverture rigide, plus lourd) change parfois de transporteur et de
// delai, jamais juste un pourcentage applique a la louche.
//
// Devise : TOUJOURS celle du pays (resolveCurrencyForCountry ci-dessous) —
// jamais une conversion a la volee, Gelato facture deja Celebrons dans
// cette devise pour ce pays precis.
const SHIPPING_PRICE_CENTS = {
  FR: { livret: 600, standard: 600, luxe: 650 },
  BE: { livret: 700, standard: 700, luxe: 700 },
  CH: { livret: 950, standard: 950, luxe: 1050 },
  LU: { livret: 650, standard: 650, luxe: 700 },
  CA: { livret: 1000, standard: 1000, luxe: 1000 },
  MC: { livret: 2550, standard: 2550, luxe: 2550 },
  DE: { livret: 450, standard: 450, luxe: 500 },
  ES: { livret: 500, standard: 500, luxe: 600 },
  IT: { livret: 600, standard: 600, luxe: 600 },
  GB: { livret: 400, standard: 400, luxe: 400 },
  US: { livret: 800, standard: 800, luxe: 800 },
  NL: { livret: 700, standard: 700, luxe: 700 },
  PT: { livret: 700, standard: 700, luxe: 700 },
  // Gelato ne facture ni en MAD ni en TND ni en DZD (code "currency" refuse
  // par leur API, verifie empiriquement) : ces trois pays restent en EUR,
  // seule devise que Gelato accepte pour y expedier.
  MA: { livret: 2550, standard: 2550, luxe: 2550 },
  TN: { livret: 2550, standard: 2550, luxe: 2550 },
  DZ: { livret: 2550, standard: 2550, luxe: 2550 }
};

const DEFAULT_COUNTRY = 'FR';

// Devise reellement facturable par pays — ce que Gelato accepte pour UNE
// commande expediee a cette adresse (pas une simple devise "locale"
// theorique : MA/TN/DZ ont bien leur propre devise nationale, mais Gelato
// la refuse, voir le commentaire au-dessus de SHIPPING_PRICE_CENTS).
const COUNTRY_CURRENCY = {
  FR: 'EUR', BE: 'EUR', CH: 'CHF', LU: 'EUR', CA: 'CAD', MC: 'EUR',
  DE: 'EUR', ES: 'EUR', IT: 'EUR', GB: 'GBP', US: 'USD', NL: 'EUR',
  PT: 'EUR', MA: 'EUR', TN: 'EUR', DZ: 'EUR'
};

const DEFAULT_CURRENCY = 'EUR';

// Taux de conversion depuis l'EUR — sert UNIQUEMENT a convertir le prix du
// LIVRE (toujours calcule en euros par la formule ci-dessus, jamais
// redefinie devise par devise) pour l'affichage/l'encaissement dans la
// devise du client. La livraison, elle, n'a jamais besoin de conversion :
// elle est deja native (voir SHIPPING_PRICE_CENTS).
//
// Source : api.frankfurter.app (Banque centrale europeenne), releve le
// 2026-10-02. A rafraichir periodiquement — jamais en temps reel sur
// chaque requete (chaque commande fige son prix au moment de l'achat,
// meme principe que pricingVersion : un taux qui bouge demain ne doit
// jamais changer le prix d'une commande deja passee).
const EXCHANGE_RATES_FROM_EUR = {
  EUR: 1,
  CAD: 1.5984,
  CHF: 0.9279,
  GBP: 0.85033,
  USD: 1.1225
};

const SUPPORTED_CURRENCIES = Object.keys(EXCHANGE_RATES_FROM_EUR);

const resolveFormatConfig = (format) => PRICING_CONFIG[format] || PRICING_CONFIG[DEFAULT_FORMAT];

const resolveShippingCents = (format, country) => {
  const countryTable = SHIPPING_PRICE_CENTS[country] || SHIPPING_PRICE_CENTS[DEFAULT_COUNTRY];
  return countryTable[format] ?? countryTable[DEFAULT_FORMAT];
};

const resolveCurrencyForCountry = (country) => COUNTRY_CURRENCY[country] || DEFAULT_CURRENCY;

// Convertit un montant EUR (centimes) vers la devise cible — identite pour
// l'EUR (aucun arrondi/ecart introduit inutilement). Arrondi a l'entier le
// plus proche : meme granularite que le reste du projet (jamais de
// fraction de centime sur un prix affiche).
const convertEurCentsTo = (eurCents, currency) => {
  const rate = EXCHANGE_RATES_FROM_EUR[currency];
  if (!rate || currency === DEFAULT_CURRENCY) return eurCents;
  return Math.round(eurCents * rate);
};

module.exports = {
  PRICING_VERSION,
  PRICING_CONFIG,
  DEFAULT_FORMAT,
  PDF_PRICE_CENTS,
  PACK_DISCOUNT_PERCENT,
  SHIPPING_PRICE_CENTS,
  DEFAULT_COUNTRY,
  COUNTRY_CURRENCY,
  DEFAULT_CURRENCY,
  EXCHANGE_RATES_FROM_EUR,
  SUPPORTED_CURRENCIES,
  resolveFormatConfig,
  resolveShippingCents,
  resolveCurrencyForCountry,
  convertEurCentsTo
};
