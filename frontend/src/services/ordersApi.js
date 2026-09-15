import { supabase } from './supabaseClient';
import { fetchWithWakeRetry } from './httpClient';

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const buildHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('Session invalide. Merci de vous reconnecter.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
};

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return {};
  }
};

// Timeout + seconde tentative sur reveil d'instance : voir httpClient.js.
const request = async (path, options = {}) => {
  const headers = await buildHeaders();
  const response = await fetchWithWakeRetry(`${buildApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(payload?.error || 'Erreur API commandes.');
  }
  return payload;
};

export const listOrders = async () => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Erreur chargement commandes.');
  }
  return Array.isArray(data) ? data : [];
};

export const listOrdersByBook = async (bookId) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('book_id', bookId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Erreur chargement commandes du livre.');
  }
  return Array.isArray(data) ? data : [];
};

export const getOrderById = async (orderId) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) {
    throw new Error(error.message || 'Commande introuvable.');
  }
  return data;
};

export const createOrder = (payload) => request('/orders', {
  method: 'POST',
  body: JSON.stringify(payload)
});

// Supprime une commande pour repartir de zero (essais de formats, de types
// de commande, de paiement) — voir backend DELETE /api/orders/:orderId, qui
// supprime aussi les brouillons Gelato associes et refuse les seuls cas
// vraiment irreversibles (commande partie en production, ou payee avec
// Stripe en mode live).
export const deleteOrder = (orderId) => request(`/orders/${orderId}`, {
  method: 'DELETE'
});

export const createStripeCheckoutSession = (orderId) => request(`/orders/${orderId}/checkout-session`, {
  method: 'POST'
});

export const confirmStripePayment = (orderId, sessionId) => request(`/orders/${orderId}/stripe/confirm`, {
  method: 'POST',
  body: JSON.stringify({ sessionId })
});

export const payOrder = (orderId, payload = {}) => request(`/orders/${orderId}/pay`, {
  method: 'POST',
  body: JSON.stringify(payload)
});

export const updateOrderStatus = (orderId, status, metadata = null) => request(`/orders/${orderId}/status`, {
  method: 'POST',
  body: JSON.stringify({
    status,
    metadata
  })
});

// --- Gelato, mode test (2026-09-11) ---------------------------------------
// Envoi manuel d'une commande a l'imprimeur SANS paiement, en brouillon
// (jamais facture ni imprime tant que GELATO_LIVE_ORDERS !== '1' cote
// serveur — voir backend/routes/orders.js et gelatoOrderService.js).

// Le bouton d'envoi de test ne s'affiche que si cet appel dit que c'est
// reellement possible (cle API presente, mode production desactive).
export const getGelatoStatus = () => request('/orders/gelato/status');

export const sendOrderToGelatoTest = (orderId) => request(`/orders/${orderId}/gelato-test`, {
  method: 'POST'
});

// Suivi REEL de production : interroge l'imprimeur (voir
// backend/routes/orders.js GET /:orderId/tracking). Renvoie toujours
// quelque chose d'affichable, meme si Gelato est injoignable (`stale`).
export const getOrderTracking = (orderId) => request(`/orders/${orderId}/tracking`);

export const getApiBaseUrl = buildApiBaseUrl;

// Catalogue des formats d'impression : dimensions reelles et prix de depart.
// PUBLIQUE (aucune session requise) : le format se choisit dans le parcours de
// creation, avant toute authentification. Le prix vient du serveur et non
// d'une table recopiee ici — il est calcule avec la meme formule que celui
// facture a la commande, donc les deux ne peuvent pas diverger.
export const listPrintFormats = async () => {
  const response = await fetchWithWakeRetry(`${buildApiBaseUrl()}/orders/formats`);
  if (!response.ok) throw new Error('Formats indisponibles');
  return response.json();
};

// --- Emails transactionnels -------------------------------------------------
// `enabled` dit si une cle Resend est reellement posee cote serveur : il faut
// pouvoir l'afficher SANS envoyer d'email pour le savoir.
export const getEmailStatus = async () => {
  const response = await fetchWithWakeRetry(`${buildApiBaseUrl()}/orders/email/status`, {
    headers: await buildHeaders()
  });
  if (!response.ok) throw new Error('Etat des emails indisponible');
  return response.json();
};

// Envoie un VRAI email d'essai, a l'adresse du compte connecte et a elle
// seule (le serveur n'accepte aucune adresse libre : ce serait un relais
// ouvert). Declenche explicitement par l'utilisateur.
export const sendTestEmail = async () => {
  const response = await fetchWithWakeRetry(`${buildApiBaseUrl()}/orders/email/test`, {
    method: 'POST',
    headers: await buildHeaders()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "L'envoi a echoue.");
  return data;
};
