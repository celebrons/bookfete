// frontend/src/services/adminApi.js
//
// Espace d'administration (2026-09-12). Toutes ces routes sont gardees cote
// serveur par middleware/requireAdmin.js : ce fichier ne protege rien, il ne
// fait qu'appeler. Un non-administrateur recoit un 404 — ce qui est voulu
// (on ne confirme pas l'existence de cet espace).

import { supabase } from './supabaseClient';
import { getApiBaseUrl } from './compositionApi';

// CODE D ACCES PARTAGE (2026-09-19).
//
// Demande : pouvoir ouvrir l'espace d'administration depuis n'importe quel
// compte de test, sans inscrire chaque adresse dans ADMIN_EMAILS.
//
// Il est garde dans sessionStorage, PAS dans localStorage : il disparait a
// la fermeture de l'onglet. Un code de consultation qui survivrait des
// semaines sur une machine partagee n'aurait plus grand sens.
//
// Il voyage dans un en-tete, jamais dans une URL — une URL finit dans les
// journaux du serveur et dans l'historique du navigateur.
const CLE_CODE = 'celebrons.admin.code';

export const lireCodeAdmin = () => {
  try {
    return sessionStorage.getItem(CLE_CODE) || '';
  } catch (_error) {
    // Navigation privee ou stockage bloque : on continue sans code.
    return '';
  }
};

export const poserCodeAdmin = (code) => {
  try {
    if (code) sessionStorage.setItem(CLE_CODE, code);
    else sessionStorage.removeItem(CLE_CODE);
  } catch (_error) { /* sans stockage, le code vaut pour cette page */ }
};

const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Session invalide. Merci de vous reconnecter.');
  const code = lireCodeAdmin();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    ...(code ? { 'x-admin-code': code } : {})
  };
};

const request = async (path) => {
  const response = await fetch(`${getApiBaseUrl()}/admin${path}`, { headers: await authHeaders() });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || "Accès refusé.");
    error.status = response.status;
    throw error;
  }
  return payload;
};

// Sert uniquement a decider si le lien "Administration" s'affiche. Ne jamais
// s'en servir comme d'une protection : c'est le serveur qui tranche, route
// par route.
// Renvoie desormais { isAdmin, codeAttendu } : « codeAttendu » dit qu un
// code partage est configure sur ce serveur, donc que l interface doit
// proposer un champ plutot que de repondre « Page introuvable » a
// quelqu un qui a le droit d entrer. Le code lui-meme ne circule jamais
// dans ce sens.
export const checkIsAdmin = async () => {
  try {
    const { isAdmin, codeAttendu } = await request('/me');
    return { isAdmin: Boolean(isAdmin), codeAttendu: Boolean(codeAttendu) };
  } catch (_error) {
    return { isAdmin: false, codeAttendu: false };
  }
};

export const listAllBooks = (search = '') => request(
  `/books${search ? `?search=${encodeURIComponent(search)}` : ''}`
);

// URL de consultation d'un livre. Le jeton ne peut pas voyager dans un
// en-tete via un <iframe> : on recupere donc le HTML nous-memes (avec
// l'en-tete d'authentification) et on l'injecte en srcDoc — jamais de jeton
// dans une URL, ou il finirait dans les journaux du serveur et l'historique
// du navigateur.
export const fetchBookPreviewHtml = async (bookId) => {
  const response = await fetch(`${getApiBaseUrl()}/admin/books/${bookId}/preview.html`, {
    headers: await authHeaders()
  });
  if (!response.ok) throw new Error("Impossible d'afficher ce livre.");
  return response.text();
};

// Journal des evenements metier (voir backend/services/events/eventLog.js).
//
// Repond a « que s'est-il passe sur cette commande ? » sans ouvrir de
// terminal, et identiquement quel que soit le serveur qui a agi — chaque
// evenement porte son environnement d'origine.
export const listEvents = ({ orderId, bookId, level, limit } = {}) => {
  const params = new URLSearchParams();
  if (orderId) params.set('orderId', orderId);
  if (bookId) params.set('bookId', bookId);
  if (level) params.set('level', level);
  if (limit) params.set('limit', String(limit));
  const suffixe = params.toString();
  return request(`/events${suffixe ? `?${suffixe}` : ''}`);
};

// Etat de sante du serveur : memoire, processeur, disque, rendus en cours,
// derniere sauvegarde. Ce qui se lit depuis Node, donc disponible sur les
// trois environnements.
export const fetchServerHealth = () => request('/health');
