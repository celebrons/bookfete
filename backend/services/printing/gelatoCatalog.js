// backend/services/printing/gelatoCatalog.js
//
// Correspondance entre nos 3 formats (print_format: livret/standard/luxe —
// voir backend/services/composition/coverFormat.js, source de verite pour
// les dimensions reelles) et de VRAIS produits du catalogue imprimeur
// Gelato, verifies le 2026-09-09 via l'API (product.gelatoapis.com/v3),
// script d'exploration : backend/scripts/gelato-explore-catalog.js /
// gelato-explore-product.js. Voir memoire "gelato-integration-status" pour
// le detail complet de l'exploration (catalogues, tailles, prix releves).
//
// Constat cle : il n'existe PAS de catalogue "photobooks" unique chez
// Gelato, mais deux catalogues separes selon la couverture
// (soft-cover-photobooks / hard-cover-photobooks), qui partagent les
// tailles 20x20cm et 21x28cm. Nos anciennes dimensions (170x170 / 220x280 /
// 240x320mm) ne correspondaient a AUCUN produit reel — realignees pour
// permettre une vraie commande :
//   - livret   : 20x20cm carre,    couverture SOUPLE
//   - standard : 21x28cm portrait, couverture SOUPLE
//   - luxe     : 21x28cm portrait, couverture RIGIDE (meme gabarit que
//     standard — la distinction Luxe se joue sur la matiere + les
//     finitions deja existantes : dorure, marges, papier ivoire, voir
//     coverTheme.applyFormatAccent)
//
// Chaque taille a DEUX productUid Gelato equivalents dans le catalogue
// (ex. "pf_210x280-mm-8x11-inch" et "pf_8x11-inch-210x280-mm" — deux
// valeurs d'attribut synonymes, meme produit physique). Un seul est retenu
// ici par coherence (prefixe mm d'abord, comme le reste de notre code),
// verifie manuellement le 2026-09-09 (prix reel obtenu pour les 3).
//
// Fonctions/constantes pures, aucun acces reseau — le VRAI appel API
// (soumission de commande, upload PDF) reste a construire separement une
// fois ce mapping valide en test.

const GELATO_PRODUCT_MAP = {
  livret: {
    catalogUid: 'soft-cover-photobooks',
    productUid:
      'photobooks-softcover_pf_200x200-mm-8x8-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver',
    coverType: 'soft',
    trimWidthMm: 200,
    trimHeightMm: 200,
    minPages: 28,
    maxPages: 200,
    pageStep: 2
  },
  standard: {
    catalogUid: 'soft-cover-photobooks',
    productUid:
      'photobooks-softcover_pf_210x280-mm-8x11-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver',
    coverType: 'soft',
    trimWidthMm: 210,
    trimHeightMm: 280,
    minPages: 28,
    maxPages: 200,
    pageStep: 2
  },
  luxe: {
    catalogUid: 'hard-cover-photobooks',
    productUid:
      'photobooks-hardcover_pf_210x280-mm-8x11-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_130-gsm-65-lb-cover-coated-silk_ver',
    coverType: 'hard',
    trimWidthMm: 210,
    trimHeightMm: 280,
    minPages: 28,
    maxPages: 200,
    pageStep: 2
  }
};

const DEFAULT_PRINT_FORMAT = 'standard';

function resolveGelatoProduct(printFormat) {
  return GELATO_PRODUCT_MAP[printFormat] || GELATO_PRODUCT_MAP[DEFAULT_PRINT_FORMAT];
}

// Un livre peut avoir n'importe quel page_count issu de l'atelier (contenu
// reel, pas force sur un palier — voir layoutEngine.js PAGE_COUNT_TIERS,
// qui ne sont que des SUGGESTIONS a la generation automatique). Avant
// d'envoyer une commande a Gelato il faut verifier/ajuster ce nombre aux
// bornes reelles du produit choisi.
function isValidGelatoPageCount(pageCount, printFormat) {
  const product = resolveGelatoProduct(printFormat);
  const pages = Number(pageCount);
  if (!Number.isFinite(pages)) return false;
  if (pages < product.minPages || pages > product.maxPages) return false;
  return (pages - product.minPages) % product.pageStep === 0;
}

// Arrondit au palier imprimable valide le plus proche (toujours vers le
// HAUT en cas d'egalite ou de valeur hors bornes basse — on ne coupe jamais
// de contenu pour rentrer dans un palier inferieur).
// Pages de garde : la PREMIERE et la DERNIERE page interieure d un livre
// Gelato sont blanches — ce sont les gardes collees aux plats de la
// couverture, non composables.
//
// Etabli le 2026-09-16 sur le gabarit officiel telecharge par le client
// pour un livre declare a 32 pages : 33 pages en tout, la 1re etant la
// couverture enveloppante, la 2e blanche, puis 30 pages a composer, puis
// une derniere blanche. Donc pages interieures = nombre DECLARE, et pages
// composables = declare - 2.
//
// C est ce qui explique le rattrapage manuel du client (« il a fallu lui
// dire 32 pages pour qu il accepte ») : nous declarions le nombre de pages
// COMPOSEES, sans compter les gardes.
const GELATO_ENDPAPER_PAGES = 2;

// Nombre de pages a DECLARER a Gelato pour un livre dont on a compose
// contentPages pages. A utiliser partout plutot que clamp(contentPages),
// qui oubliait les gardes.
function resolveGelatoPageCount(contentPages, printFormat) {
  const pages = Number(contentPages) || 0;
  return clampToValidGelatoPageCount(pages + GELATO_ENDPAPER_PAGES, printFormat);
}

function clampToValidGelatoPageCount(pageCount, printFormat) {
  const product = resolveGelatoProduct(printFormat);
  const pages = Number(pageCount) || 0;
  if (pages <= product.minPages) return product.minPages;
  if (pages >= product.maxPages) return product.maxPages;
  const offset = pages - product.minPages;
  const roundedOffset = Math.ceil(offset / product.pageStep) * product.pageStep;
  return product.minPages + roundedOffset;
}

module.exports = {
  GELATO_PRODUCT_MAP,
  resolveGelatoProduct,
  isValidGelatoPageCount,
  clampToValidGelatoPageCount,
  resolveGelatoPageCount,
  GELATO_ENDPAPER_PAGES
};
