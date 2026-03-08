import { supabase } from './supabaseClient';

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

const request = async (path, options = {}) => {
  const headers = await buildHeaders();
  const response = await fetch(`${buildApiBaseUrl()}${path}`, {
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

export const listOrders = () => request('/orders');

export const listOrdersByBook = (bookId) => request(`/orders/book/${bookId}`);

export const getOrderById = (orderId) => request(`/orders/${orderId}`);

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

