import { supabase } from './supabaseClient';

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};
const REQUEST_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 15000);

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

const request = async (path, options = {}) => {
  const headers = await buildHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${buildApiBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
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
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Le serveur met trop de temps a repondre. Reessayez dans quelques secondes.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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

export const getApiBaseUrl = buildApiBaseUrl;
