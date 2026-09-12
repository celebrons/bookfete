// frontend/src/services/anonymousSession.js
//
// Demarrage SANS COMPTE (2026-09-12). Un visiteur peut creer son livre,
// deposer ses photos et composer ses pages avant toute inscription : on lui
// ouvre une session Supabase ANONYME, qui est un vrai compte marque
// `is_anonymous`. Tout le reste de l'application continue de fonctionner
// sans le savoir (owner_id existe, donc livres, upload, composition et RLS
// sont inchanges).
//
// Toute la logique "suis-je anonyme / dois-je ouvrir une session" vit ICI,
// pour qu'aucun ecran n'ait a la redecouvrir a sa facon.
//
// PRE-REQUIS EXTERNE : "Allow anonymous sign-ins" doit etre active dans le
// tableau de bord Supabase (Authentication > Sign In / Providers). Sans ca,
// signInAnonymously echoue — d'ou le repli explicite de ensureSession().

import { supabase } from './supabaseClient';
import { getApiBaseUrl } from './compositionApi';

// Jeton de la session anonyme, mis de cote AVANT une connexion a un compte
// existant : cette connexion remplace la session courante, le jeton anonyme
// serait donc perdu — et avec lui le seul moyen de prouver au serveur qu'on
// detient bien les livres commences. sessionStorage (et non localStorage) :
// cette valeur n'a de sens que pendant l'aller-retour de connexion.
const PENDING_ANON_TOKEN_KEY = 'pendingAnonymousToken';

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session || null;
}

export function isAnonymousSession(session) {
  return session?.user?.is_anonymous === true;
}

export async function isCurrentlyAnonymous() {
  return isAnonymousSession(await getCurrentSession());
}

// Garantit qu'une session existe, en ouvrant une session anonyme si besoin.
//
// Renvoie `{ session, anonymous, unavailable }` :
//   - `unavailable: true` signifie que la connexion anonyme a echoue (option
//     non activee cote Supabase, reseau, quota...). L'appelant DOIT alors
//     retomber sur l'ancien parcours (brouillon + inscription), jamais
//     echouer en silence : c'est ce repli qui evite qu'une option mal
//     configuree bloque completement la creation d'un livre.
export async function ensureSession() {
  const existing = await getCurrentSession();
  if (existing) {
    return { session: existing, anonymous: isAnonymousSession(existing), unavailable: false };
  }

  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data?.session) {
      // Trace la VRAIE raison : le repli silencieux vers /register est
      // correct pour l'utilisateur, mais il masquait completement la cause
      // cote developpement (vecu le 2026-09-12 : un declencheur SQL faisait
      // echouer la creation, et rien ne le disait). Console uniquement :
      // l'utilisateur, lui, n'a pas a lire un message technique.
      console.warn(
        '[anonymousSession] Connexion anonyme impossible, repli sur l\'inscription.',
        error ? `${error.status || ''} ${error.code || ''} ${error.message}` : 'aucune session renvoyee'
      );
      return { session: null, anonymous: false, unavailable: true };
    }
    return { session: data.session, anonymous: true, unavailable: false };
  } catch (error) {
    console.warn('[anonymousSession] Connexion anonyme impossible (exception).', error?.message || error);
    return { session: null, anonymous: false, unavailable: true };
  }
}

// --- Passage au compte reel ------------------------------------------------

// Cas 1 : le visiteur CREE un compte. On ne cree pas un nouvel utilisateur —
// on convertit celui qui existe deja, ce qui conserve le MEME identifiant.
// Les livres commences restent donc rattaches sans aucun transfert.
export async function convertAnonymousToAccount({ email, password, fullName }) {
  const { error } = await supabase.auth.updateUser({
    email,
    password,
    data: { full_name: fullName }
  });
  if (error) throw new Error(error.message);

  // La conversion ne cree pas la ligne `profiles` (contrairement au parcours
  // d'inscription normal, voir backend authController.register) : on la
  // demande au serveur, qui la pose avec l'identite verifiee du jeton.
  const session = await getCurrentSession();
  if (session?.access_token) {
    try {
      await fetch(`${getApiBaseUrl()}/auth/anonymous/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ full_name: fullName })
      });
    } catch (_error) {
      // Non bloquant : le compte existe, seul le profil manque.
    }
  }
}

// Cas 2 : le visiteur se connecte a un compte DEJA EXISTANT. L'identifiant
// change, les livres commences anonymement doivent donc suivre.
// A appeler AVANT signInWithPassword / signInWithOAuth.
export async function rememberAnonymousTokenBeforeLogin() {
  const session = await getCurrentSession();
  if (isAnonymousSession(session) && session?.access_token) {
    try {
      sessionStorage.setItem(PENDING_ANON_TOKEN_KEY, session.access_token);
    } catch (_error) {
      // Navigation privee, stockage refuse : on perd le rattachement, pas la
      // connexion. Degradation acceptable.
    }
  }
}

// A appeler APRES une connexion reussie. Demande au serveur de transferer
// les livres commences anonymement vers le compte qui vient de se connecter.
// Le serveur revalide lui-meme le jeton anonyme (voir
// backend/controllers/anonymousController.js) : c'est lui qui decide, pas
// nous. Jamais bloquant — echouer a recuperer un livre ne doit pas empecher
// de se connecter.
export async function linkAnonymousBooksAfterLogin() {
  let anonymousToken = null;
  try {
    anonymousToken = sessionStorage.getItem(PENDING_ANON_TOKEN_KEY);
    sessionStorage.removeItem(PENDING_ANON_TOKEN_KEY);
  } catch (_error) {
    return { transferred: 0 };
  }
  if (!anonymousToken) return { transferred: 0 };

  const session = await getCurrentSession();
  if (!session?.access_token) return { transferred: 0 };

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/anonymous/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ anonymousToken })
    });
    if (!response.ok) return { transferred: 0 };
    return await response.json();
  } catch (_error) {
    return { transferred: 0 };
  }
}
