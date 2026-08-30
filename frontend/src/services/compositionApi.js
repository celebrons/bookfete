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
  return { token, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
};

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return {};
  }
};

// Requete JSON standard (GET/POST/PUT/DELETE avec corps JSON).
const request = async (path, options = {}) => {
  const { headers } = await buildHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${buildApiBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { ...headers, ...(options.headers || {}) }
    });

    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(payload?.error || 'Erreur du moteur de mise en page.');
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

// Requete "brute" (pas de Content-Type: application/json impose) : utilisee
// pour l'upload multipart et pour recuperer l'apercu (HTML texte / PDF blob),
// deux cas ou request() ne convient pas.
const rawRequest = async (path, options = {}) => {
  const { token } = await buildHeaders();
  const response = await fetch(`${buildApiBaseUrl()}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    throw new Error(payload?.error || `Erreur (${response.status}).`);
  }
  return response;
};

// --- Catalogues (publics, pas d'auth requise) -------------------------------

export const listTemplates = () => request('/catalog/templates');
export const listLayouts = () => request('/catalog/layouts');
export const listProducts = () => request('/catalog/products');

// --- Contenu d'un livre ------------------------------------------------------

export const listContentItems = (bookId) => request(`/books/${bookId}/content-items`);

// Mode Automatique (§06) : palier de pages recommande a partir du contenu reel.
export const getRecommendedPageCount = (bookId) => request(`/books/${bookId}/recommended-page-count`);

export const addTextItem = (bookId, text, displayOrder = 0) => request(`/books/${bookId}/content-items`, {
  method: 'POST',
  body: JSON.stringify({ source: 'upload', kind: 'texte', text, display_order: displayOrder })
});

export const deleteContentItem = (bookId, itemId) => request(`/books/${bookId}/content-items/${itemId}`, {
  method: 'DELETE'
});

export const uploadPhoto = async (bookId, file, displayOrder = 0) => {
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('display_order', String(displayOrder));

  const response = await rawRequest(`/books/${bookId}/content-items/photo`, {
    method: 'POST',
    body: formData
  });
  return response.json();
};

// --- Livre (template / nombre de pages) --------------------------------------

export const updateBook = (bookId, payload) => request(`/books/${bookId}`, {
  method: 'PUT',
  body: JSON.stringify(payload)
});

// --- Composition + apercu -----------------------------------------------------

export const composeBook = (bookId, variant = 0) => request(`/books/${bookId}/compose`, {
  method: 'POST',
  body: JSON.stringify({ variant })
});

export const fetchPreviewHtml = async (bookId) => {
  const response = await rawRequest(`/books/${bookId}/preview.html`);
  return response.text();
};

export const fetchPreviewPdfBlob = async (bookId) => {
  const response = await rawRequest(`/books/${bookId}/preview.pdf`);
  return response.blob();
};

export const getApiBaseUrl = buildApiBaseUrl;
