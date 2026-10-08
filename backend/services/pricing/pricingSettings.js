// backend/services/pricing/pricingSettings.js
//
// Tarifs des livres, modifiables depuis l'espace admin SANS redemarrer le
// serveur (demande du 2026-10-07) — meme schema que services/settings/
// appMode.js : une valeur relue en arriere-plan (REFRESH_MS), lue de
// facon SYNCHRONE par le code chaud (calculateBookPrice tourne sur chaque
// commande, impossible de le rendre async sans repercuter `await` sur
// toute la chaine d'appel qui l'utilise).
//
// N'y vivent QUE les trois valeurs qui sont un vrai choix commercial : prix
// de base et prix/2 pages par format, prix du PDF seul, remise du pack.
// basePages (30, structurel) et les couts Gelato (reference de marge,
// jamais factures tels quels) restent dans pricingConfig.js, jamais
// editables : les y melanger ferait passer un COUT reel pour un PRIX
// choisi.

const supabase = require('../../config/supabase');
const { logEvent } = require('../events/eventLog');
const {
  PRICING_CONFIG: PRICING_DEFAULTS,
  PDF_PRICE_CENTS: PDF_PRICE_CENTS_DEFAULT,
  PACK_DISCOUNT_PERCENT: PACK_DISCOUNT_PERCENT_DEFAULT
} = require('./pricingConfig');

const FORMAT_KEYS = Object.keys(PRICING_DEFAULTS);
const REFRESH_MS = 5000;

const defaultSettings = () => ({
  formats: Object.fromEntries(FORMAT_KEYS.map((f) => [f, {
    basePriceCents: PRICING_DEFAULTS[f].basePriceCents,
    pricePer2PagesCents: PRICING_DEFAULTS[f].pricePer2PagesCents
  }])),
  pdfPriceCents: PDF_PRICE_CENTS_DEFAULT,
  packDiscountPercent: PACK_DISCOUNT_PERCENT_DEFAULT
});

let cached = defaultSettings();
let refreshing = null;

// Valide une config AVANT de la garder : un nombre absent/negatif/non entier
// retombe sur le defaut plutot que de corrompre un prix. Jamais d'exception
// ici — un reglage mal forme en base doit degrader proprement, pas faire
// tomber le calcul de prix de toutes les commandes.
function entierPositif(valeur, repli) {
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 0 ? n : repli;
}

// `repli` : baseline utilisee pour tout champ absent/invalide.
//   - Lecture depuis la base (lireDepuisLaBase) : les defauts d'usine — un
//     champ manquant en base est une anomalie de donnees, pas une omission
//     volontaire.
//   - Ecriture (setPricingSettings) : l'etat ACTUELLEMENT en cache — sans
//     ca, modifier seulement "livret" depuis l'admin remettrait "standard"
//     et "luxe" a leurs defauts d'usine au lieu de les laisser inchanges.
function validerConfig(brut, repli = defaultSettings()) {
  const formats = Object.fromEntries(FORMAT_KEYS.map((f) => {
    const source = brut?.formats?.[f] || {};
    const baseFormat = repli.formats[f] || defaultSettings().formats[f];
    return [f, {
      basePriceCents: entierPositif(source.basePriceCents, baseFormat.basePriceCents),
      pricePer2PagesCents: entierPositif(source.pricePer2PagesCents, baseFormat.pricePer2PagesCents)
    }];
  }));
  const packDiscountPercent = entierPositif(brut?.packDiscountPercent, repli.packDiscountPercent);
  return {
    formats,
    pdfPriceCents: entierPositif(brut?.pdfPriceCents, repli.pdfPriceCents),
    // Une remise au-dela de 100% n'a pas de sens (prix negatif) — jamais
    // bloquant, ramenee a 100 plutot que refusee.
    packDiscountPercent: Math.min(100, packDiscountPercent)
  };
}

async function lireDepuisLaBase() {
  const { data, error } = await supabase
    .from('pricing_settings')
    .select('config')
    .eq('id', 'global')
    .single();
  // Table absente (migration pas encore passee) ou ligne manquante : repli
  // sur les tarifs d'aujourd'hui, jamais une erreur qui bloquerait une
  // commande.
  if (error || !data?.config) return defaultSettings();
  return validerConfig(data.config);
}

function rafraichirLeCache() {
  if (!refreshing) {
    refreshing = lireDepuisLaBase()
      .then((config) => { cached = config; })
      .catch(() => {})
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// Lecture SYNCHRONE : la valeur en memoire, forme IDENTIQUE a l'ancien
// PRICING_CONFIG statique (basePages/gelatoCost* restent ceux de
// pricingConfig.js, jamais editables) — calculateBookPrice.js n'a donc
// besoin de changer que sa SOURCE, jamais sa logique.
function getPricingConfigSync() {
  return Object.fromEntries(FORMAT_KEYS.map((f) => [f, {
    basePages: PRICING_DEFAULTS[f].basePages,
    basePriceCents: cached.formats[f].basePriceCents,
    pricePer2PagesCents: cached.formats[f].pricePer2PagesCents,
    gelatoCostCents: PRICING_DEFAULTS[f].gelatoCostCents,
    gelatoCostPer2PagesCents: PRICING_DEFAULTS[f].gelatoCostPer2PagesCents
  }]));
}

const getPdfPriceCentsSync = () => cached.pdfPriceCents;
const getPackDiscountPercentSync = () => cached.packDiscountPercent;

async function getPricingSettings() {
  await rafraichirLeCache();
  return cached;
}

// A appeler une fois au demarrage du serveur (voir server.js), meme raison
// qu'initAppMode : sans ca, les toutes premieres commandes apres un
// redemarrage verraient les tarifs par defaut pendant jusqu'a REFRESH_MS,
// meme si la base dit deja autre chose.
async function initPricingCache() {
  await rafraichirLeCache();
  setInterval(rafraichirLeCache, REFRESH_MS).unref();
}

async function setPricingSettings(nouveauxReglages, actorEmail) {
  // repli = l'etat ACTUEL, pas les defauts d'usine : un champ omis dans
  // cette mise a jour doit rester tel qu'il etait, jamais revenir au
  // tarif de depart (voir le commentaire de validerConfig).
  const config = validerConfig(nouveauxReglages, cached);

  const { error } = await supabase
    .from('pricing_settings')
    .upsert(
      { id: 'global', config, updated_at: new Date().toISOString(), updated_by: actorEmail || null },
      { onConflict: 'id' }
    );
  if (error) throw error;

  // Mis a jour tout de suite, pas d'attente du prochain rafraichissement :
  // c'est CE processus qui vient d'ecrire la valeur.
  cached = config;

  // Un prix qui change merite une trace — qui, quand, avant/apres (voir
  // app.mode.production_activated pour le meme principe).
  logEvent({
    type: 'pricing.updated',
    level: 'warn',
    message: `Tarifs modifies par ${actorEmail || 'inconnu'}`,
    actor: actorEmail,
    metadata: { config }
  });

  return config;
}

module.exports = {
  getPricingConfigSync,
  getPdfPriceCentsSync,
  getPackDiscountPercentSync,
  getPricingSettings,
  setPricingSettings,
  initPricingCache,
  refreshPricingCache: rafraichirLeCache,
  FORMAT_KEYS
};
