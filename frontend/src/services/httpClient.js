// frontend/src/services/httpClient.js
//
// Couche fetch partagee par compositionApi.js / ordersApi.js — introduite le
// 2026-09-11 apres un retour utilisateur : "des fois quand je charge un
// projet sur onrender : Le serveur met trop de temps a repondre".
//
// Ce message n'etait PAS une panne serveur : c'est le timeout CLIENT (15s,
// AbortController) de ces deux fichiers. Sur Render, une instance gratuite
// s'endort apres quelques minutes d'inactivite et met typiquement 30 a 60
// secondes a se reveiller : la toute premiere requete apres une periode
// d'inactivite depassait donc systematiquement les 15s.
//
// Trois mesures ici :
//  1. Budget normal porte a 20s (une requete sur instance eveillee reste
//     tres en dessous ; au dela c'est un vrai probleme, pas un reveil).
//  2. UNE seule seconde tentative, avec un budget long (60s), reservee aux
//     requetes IDEMPOTENTES (GET) : c'est exactement le cas du reveil.
//     Jamais de retry automatique sur POST/PUT/DELETE — un timeout ne dit
//     pas si le serveur a traite la requete, et rejouer une creation de
//     commande en double serait bien pire que l'erreur affichee.
//  3. Message final explicite (le serveur redemarre peut-etre) au lieu de
//     "reessayez dans quelques secondes", trompeur pour un reveil d'une
//     minute.
//
// Voir aussi wakeUpBackend() : appele au demarrage de l'application pour
// que l'instance commence a se reveiller pendant que l'utilisateur navigue,
// ce qui evite le plus souvent d'en arriver a un timeout.

const NORMAL_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 20000);
const COLD_START_TIMEOUT_MS = Number(process.env.REACT_APP_API_COLD_START_TIMEOUT_MS || 60000);

export const TIMEOUT_MESSAGE = 'Le serveur met trop de temps a repondre (il est peut-etre en train de redemarrer). Reessayez dans une minute.';

// CE QUE LE NAVIGATEUR DIT, ET CE QU'IL FAUT MONTRER.
//
// Un telephone sur un reseau faible interrompt les requetes, et chaque
// navigateur a sa formule — en anglais, et sans indiquer quoi faire :
//
//   Safari  : « The operation was aborted. » / « Load failed »
//   Chrome  : « Failed to fetch »
//   Firefox : « NetworkError when attempting to fetch resource. »
//
// Vu le 2026-09-21 sur un iPhone, en plein ecran de connexion : l'ecran
// affichait « The operation was aborted. » et l'utilisateur n'avait aucune
// idee de ce qu'il devait faire — ni meme si c'etait son mot de passe qui
// etait refuse.
//
// Ces messages ne viennent pas de nos appels a nous (fetchWithWakeRetry
// traduit deja les siens) mais des bibliotheques qui font leurs propres
// requetes, comme le client d'authentification.
//
// Renvoie null quand l'erreur n'est PAS de nature reseau : l'appelant garde
// alors son message d'origine, souvent plus precis (« mot de passe
// incorrect » vaut mieux que « probleme de connexion »).
export function messageReseau(error) {
  const texte = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (!texte.trim()) return null;

  if (/aborterror|was aborted|signal is aborted|timeout|timed out/.test(texte)) {
    return TIMEOUT_MESSAGE;
  }
  if (/failed to fetch|load failed|networkerror|network request failed|connexion/.test(texte)) {
    return 'Connexion interrompue. Verifiez votre reseau et reessayez.';
  }
  return null;
}

function isIdempotent(options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * fetch avec timeout, et une seconde tentative a budget long UNIQUEMENT
 * pour les requetes idempotentes (voir l'entete). Un abandon final est
 * traduit en Error(TIMEOUT_MESSAGE) — les autres erreurs remontent telles
 * quelles.
 */
export async function fetchWithWakeRetry(url, options = {}) {
  try {
    return await fetchWithTimeout(url, options, NORMAL_TIMEOUT_MS);
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;

    if (!isIdempotent(options)) {
      throw new Error(TIMEOUT_MESSAGE);
    }

    try {
      return await fetchWithTimeout(url, options, COLD_START_TIMEOUT_MS);
    } catch (retryError) {
      if (retryError?.name === 'AbortError') throw new Error(TIMEOUT_MESSAGE);
      throw retryError;
    }
  }
}

/**
 * Ping non bloquant de /api/health au demarrage de l'application : reveille
 * l'instance Render pendant que l'utilisateur se connecte/navigue, pour que
 * sa premiere vraie requete tombe sur un serveur deja debout. Ignore toute
 * erreur (hors ligne, backend absent en local...) — purement opportuniste.
 */
export function wakeUpBackend() {
  try {
    const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
    const trimmed = configured.replace(/\/$/, '');
    const base = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
    fetch(`${base}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});
  } catch (_error) {
    // Jamais bloquant.
  }
}
