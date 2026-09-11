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

export const getApiBaseUrl = buildApiBaseUrl;
