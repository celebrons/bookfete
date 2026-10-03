// Mode global de l'application : 'test' ou 'production' — remplace les deux
// reglages disperses (prefixe de STRIPE_SECRET_KEY, variable
// GELATO_LIVE_ORDERS) par UN SEUL etat, en base (voir
// sql/phase26_app_settings.sql), pilotable depuis l'espace admin sans
// redemarrer le serveur (demande du 2026-10-04).
//
// Lu en memoire (rafraichi en arriere-plan) plutot qu'interroge a chaque
// appel : isStripeLiveMode()/isGelatoLiveOrdersEnabled() (routes/orders.js,
// services/printing/gelatoOrderService.js) sont synchrones et appeles
// depuis des chemins qui ne peuvent pas facilement devenir async. Un
// decalage de quelques secondes entre la bascule et sa prise en compte
// partout est accepte (REFRESH_MS) — la bascule elle-meme (setAppMode) met
// a jour le cache immediatement, donc le DELAI ne joue que si un AUTRE
// processus avait change la base, ce qui n'arrive jamais ici (un seul
// processus serveur).

const supabase = require('../../config/supabase');
const { logEvent } = require('../events/eventLog');

const REFRESH_MS = 5000;

let cachedMode = 'test';
let refreshing = null;

async function readModeFromDb() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('mode')
    .eq('id', 'global')
    .single();
  // Table absente (migration pas encore passee) ou ligne manquante : repli
  // prudent sur 'test', jamais sur 'production' par defaut.
  if (error || !data) return 'test';
  return data.mode === 'production' ? 'production' : 'test';
}

function refreshAppModeCache() {
  if (!refreshing) {
    refreshing = readModeFromDb()
      .then((mode) => { cachedMode = mode; })
      .catch(() => {})
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// Lecture synchrone : la valeur en memoire. Utilisee par le code chaud
// (verification Stripe/Gelato a chaque requete) qui ne peut pas attendre
// une requete reseau.
function getAppModeSync() {
  return cachedMode;
}

async function getAppMode() {
  await refreshAppModeCache();
  return cachedMode;
}

// A appeler une fois au demarrage du serveur (voir server.js) : sans ca,
// les toutes premieres requetes verraient 'test' par defaut pendant jusqu'a
// REFRESH_MS, meme si la base dit deja 'production'.
async function initAppMode() {
  await refreshAppModeCache();
  setInterval(refreshAppModeCache, REFRESH_MS).unref();
}

// Ce qu'il faut avoir configure avant de pouvoir basculer en production
// reelle — affiche a l'admin, jamais devine. GELATO_API_KEY est deja la
// meme cle en test et en production (voir gelatoOrderService.js) : seule sa
// PRESENCE compte ici, pas son prefixe.
const LIVE_REQUIREMENTS = [
  { env: 'STRIPE_SECRET_KEY_LIVE', prefix: 'sk_live_', label: 'Cle secrete Stripe live (STRIPE_SECRET_KEY_LIVE)' },
  { env: 'STRIPE_WEBHOOK_SECRET_LIVE', prefix: 'whsec_', label: 'Secret du webhook Stripe live (STRIPE_WEBHOOK_SECRET_LIVE)' },
  { env: 'GELATO_API_KEY', prefix: null, label: 'Cle API Gelato (GELATO_API_KEY)' }
];

function missingLiveRequirements() {
  return LIVE_REQUIREMENTS
    .filter(({ env, prefix }) => {
      const valeur = String(process.env[env] || '').trim();
      if (!valeur) return true;
      return prefix ? !valeur.startsWith(prefix) : false;
    })
    .map(({ label }) => label);
}

async function setAppMode(mode, actorEmail) {
  if (mode !== 'test' && mode !== 'production') {
    const erreur = new Error(`Mode invalide : ${mode}`);
    erreur.status = 400;
    throw erreur;
  }

  if (mode === 'production') {
    const manquants = missingLiveRequirements();
    if (manquants.length > 0) {
      const erreur = new Error('Configuration production incomplete');
      erreur.status = 400;
      erreur.missing = manquants;
      throw erreur;
    }
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { id: 'global', mode, updated_at: new Date().toISOString(), updated_by: actorEmail || null },
      { onConflict: 'id' }
    );
  if (error) throw error;

  // Mis a jour tout de suite, pas d'attente du prochain rafraichissement :
  // c'est CE processus qui vient d'ecrire la valeur.
  cachedMode = mode;

  logEvent({
    type: mode === 'production' ? 'app.mode.production_activated' : 'app.mode.test_restored',
    level: mode === 'production' ? 'warn' : 'info',
    message: mode === 'production'
      ? `Mode PRODUCTION REELLE active par ${actorEmail || 'inconnu'} — paiements et commandes desormais reels.`
      : `Retour en mode test active par ${actorEmail || 'inconnu'}.`,
    actor: actorEmail
  });

  return mode;
}

module.exports = {
  getAppMode,
  getAppModeSync,
  setAppMode,
  initAppMode,
  missingLiveRequirements,
  refreshAppModeCache
};
