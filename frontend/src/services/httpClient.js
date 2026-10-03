// frontend/src/services/httpClient.js
//
// Couche fetch partagee par compositionApi.js / ordersApi.js — introduite le
// 2026-09-11 apres un retour utilisateur : "des fois : Le serveur met trop
// de temps a repondre".
//
// Deux mesures ici :
//  1. Budget normal porte a 20s.
//  2. UNE seule seconde tentative, avec un budget plus long (60s), reservee
//     aux requetes IDEMPOTENTES (GET) — un reseau lent ou un redemarrage du
//     service en cours ne doivent pas se solder par une erreur alors qu'une
//     deuxieme tentative aurait reussi. Jamais de retry automatique sur
//     POST/PUT/DELETE — un timeout ne dit pas si le serveur a traite la
//     requete, et rejouer une creation de commande en double serait bien
//     pire que l'erreur affichee.
//
// Historique : jusqu'au 2026-10-02, ce fichier portait aussi wakeUpBackend()
// et un budget etendu a 60s pensés pour l'instance Render gratuite (qui
// s'endormait apres quelques minutes et mettait 30-60s a se reveiller) —
// retires avec le decommissionnement de Render (voir deploy/README.md), le
// serveur Scaleway ne s'endort jamais. Le budget etendu reste, pour un
// reseau lent ou un redemarrage, mais plus pour un reveil d'instance.

import i18n from '../i18n';

const NORMAL_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 20000);
const EXTENDED_TIMEOUT_MS = Number(process.env.REACT_APP_API_EXTENDED_TIMEOUT_MS || 60000);

// Langue REELLEMENT choisie dans l'app (chantier bilingue, phase 6) —
// distincte d'Accept-Language, que le navigateur fixe une fois pour toutes
// et qui ne bouge jamais quand on clique le selecteur de langue du site.
// Sans cet en-tete, un visiteur au navigateur francais qui bascule le site
// en anglais recevrait quand meme les messages d'erreur et emails du
// backend en francais pour toute route PUBLIQUE (lien de partage,
// invitation collective) — les routes authentifiees n'ont pas ce probleme
// (la langue vient de user_metadata), mais ce fichier est commun aux deux.
export function getLanguageHeader() {
  return { 'X-App-Language': i18n.language || 'fr' };
}

// Pays REELLEMENT choisi dans l'app (chantier international, 2026-10-02) —
// meme principe que getLanguageHeader() : sans lui, le backend ne peut
// calculer un prix/une devise localisee qu'une fois une adresse de
// livraison connue (page Tarifs, choix du format a la creation du livre,
// tous AVANT l'adresse). Stocke sous la meme cle que le selecteur de pays
// (voir components/layout/CountrySwitcher.js), jamais la langue du
// navigateur — un visiteur anglophone peut tres bien habiter en France.
export function getCountryHeader() {
  let country = 'FR';
  try {
    country = localStorage.getItem('bookipix_country') || 'FR';
  } catch (_error) {
    // Navigation privee/stockage refuse : repli silencieux sur la France,
    // jamais bloquant.
  }
  return { 'X-App-Country': country };
}

export function getContextHeaders() {
  return { ...getLanguageHeader(), ...getCountryHeader() };
}

// FONCTION, pas une constante figee au chargement du module (chantier
// bilingue, 2026-09-30) : la langue peut changer en cours de session, ce
// message doit donc etre lu dans la langue CURRENTE au moment de l'erreur,
// jamais celle active quand ce fichier a ete importe.
export function getTimeoutMessage() {
  return i18n.t('common:errors.timeout');
}

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
// Ces messages ne viennent pas de nos appels a nous (fetchWithRetry traduit
// deja les siens) mais des bibliotheques qui font leurs propres requetes,
// comme le client d'authentification.
//
// Renvoie null quand l'erreur n'est PAS de nature reseau : l'appelant garde
// alors son message d'origine, souvent plus precis (« mot de passe
// incorrect » vaut mieux que « probleme de connexion »).
export function messageReseau(error) {
  const texte = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (!texte.trim()) return null;

  if (/aborterror|was aborted|signal is aborted|timeout|timed out/.test(texte)) {
    return getTimeoutMessage();
  }
  if (/failed to fetch|load failed|networkerror|network request failed|connexion/.test(texte)) {
    return i18n.t('common:errors.networkInterrupted');
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
    return await fetch(url, {
      ...options,
      headers: { ...getContextHeaders(), ...(options.headers || {}) },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * fetch avec timeout, et une seconde tentative a budget etendu UNIQUEMENT
 * pour les requetes idempotentes (voir l'entete). Un abandon final est
 * traduit en Error(TIMEOUT_MESSAGE) — les autres erreurs remontent telles
 * quelles.
 */
export async function fetchWithRetry(url, options = {}) {
  try {
    return await fetchWithTimeout(url, options, NORMAL_TIMEOUT_MS);
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;

    if (!isIdempotent(options)) {
      throw new Error(getTimeoutMessage());
    }

    try {
      return await fetchWithTimeout(url, options, EXTENDED_TIMEOUT_MS);
    } catch (retryError) {
      if (retryError?.name === 'AbortError') throw new Error(getTimeoutMessage());
      throw retryError;
    }
  }
}
