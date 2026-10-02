// backend/services/pricing/calculateBookPrice.js
//
// Fonction metier UNIQUE de calcul du prix d'un livre — jamais un second
// calcul duplique dans un composant ou une route (voir cahier des charges
// "tarification dynamique", 2026-09-27, §5). Pure : aucun acces reseau/
// disque, aucune ecriture. Reutilise la pagination deja centralisee
// (bookContentService.MIN_BOOK_PAGES/MAX_BOOK_PAGES) plutot que d'en
// redefinir une copie ici.

const {
  PRICING_CONFIG,
  DEFAULT_FORMAT,
  DEFAULT_COUNTRY,
  PRICING_VERSION,
  resolveFormatConfig,
  resolveShippingCents,
  resolveCurrencyForCountry,
  convertEurCentsTo
} = require('./pricingConfig');
const { MIN_BOOK_PAGES, MAX_BOOK_PAGES } = require('../composition/bookContentService');

// prix_livre = prix_base_30_pages + ((pages - 30) / 2 x prix_par_2_pages)
// La pagination est deja garantie PAIRE avant d'arriver ici (normalizePageCount,
// bookContentService.js) : la division par 2 est donc toujours un entier — pas
// d'arrondi a masquer une pagination invalide, juste une securite defensive.
//
// INTERNATIONAL (chantier 2026-10-02) : la formule ci-dessus reste TOUJOURS
// calculee en euros (source unique de la marge, inchangee) ; seul le
// RESULTAT est converti dans la devise du pays de livraison pour
// l'affichage et l'encaissement — jamais une deuxieme formule par devise,
// qui finirait par diverger. La livraison, elle, n'a jamais besoin de
// conversion : resolveShippingCents renvoie deja un montant NATIF (voir
// pricingConfig.js, obtenu directement depuis l'API Gelato dans la bonne
// devise).
function calculateBookPrice({ format, pageCount, country = DEFAULT_COUNTRY } = {}) {
  // Format REELLEMENT connu (pas juste le repli) : la reponse doit dire la
  // verite sur le format applique, meme quand l'entree etait invalide/absente
  // — meme filet de securite que l'ancien FORMAT_PRICING (jamais d'erreur,
  // jamais NaN, toujours un prix standard par defaut).
  const resolvedFormat = Object.prototype.hasOwnProperty.call(PRICING_CONFIG, format) ? format : DEFAULT_FORMAT;
  const config = resolveFormatConfig(resolvedFormat);
  const currency = resolveCurrencyForCountry(country);

  const safePageCount = Number.isFinite(Number(pageCount)) && Number(pageCount) > 0
    ? Math.min(MAX_BOOK_PAGES, Math.max(MIN_BOOK_PAGES, Math.round(Number(pageCount))))
    : config.basePages;

  const additionalPages = Math.max(0, safePageCount - config.basePages);
  const additionalPageBlocks = additionalPages / 2;
  const additionalPagesPriceEurCents = Math.round(additionalPageBlocks * config.pricePer2PagesCents);

  const basePriceEurCents = config.basePriceCents;
  const bookPriceEurCents = basePriceEurCents + additionalPagesPriceEurCents;

  const basePriceCents = convertEurCentsTo(basePriceEurCents, currency);
  const additionalPagesPriceCents = convertEurCentsTo(additionalPagesPriceEurCents, currency);
  const bookPriceCents = convertEurCentsTo(bookPriceEurCents, currency);
  const shippingPriceCents = resolveShippingCents(resolvedFormat, country);
  const totalPriceCents = bookPriceCents + shippingPriceCents;

  return {
    format: resolvedFormat,
    pageCount: safePageCount,
    country,
    currency,
    pricingVersion: PRICING_VERSION,
    basePriceCents,
    additionalPages,
    additionalPageBlocks,
    additionalPagesPriceCents,
    bookPriceCents,
    shippingPriceCents,
    totalPriceCents
  };
}

module.exports = { calculateBookPrice };
