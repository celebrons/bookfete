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

// Requete publique (aucune session requise) : pour les pages accessibles
// avant connexion, comme l'entree de creation depuis la page d'accueil.
const publicRequest = async (path, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${buildApiBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(payload?.error || 'Erreur.');
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

// Requete publique "brute" (aucune session requise, pas de Content-Type
// impose) : pour l'upload multipart de la page de contribution sans compte
// (voir /participer/:token) — meme principe que rawRequest, sans l'exigence
// d'authentification.
const publicRawRequest = async (path, options = {}) => {
  const response = await fetch(`${buildApiBaseUrl()}${path}`, options);
  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    throw new Error(payload?.error || `Erreur (${response.status}).`);
  }
  return response;
};

// --- Creation d'un livre (occasion + titre, sans IA) -------------------------

// Catalogue des occasions (public, donnees pures — pas d'appel IA).
export const listEventTypes = () => publicRequest('/books/create/event-types');

// Cree un livre nu (titre + occasion), sans passer par l'assistant IA
// (backend/routes/bookCreation.js). Reutilise le CRUD generique existant.
export const createBook = (payload) => request('/books', {
  method: 'POST',
  body: JSON.stringify(payload)
});

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

// Estimation de prix en lecture seule (jamais persistee) : printFormat/
// pageCount, si fournis, surchargent les valeurs reelles du livre pour la
// simulation — utilise par Configuration pour afficher le prix de chaque
// type d'album avant meme de le choisir. Vit sous /orders (pas /books) :
// meme routeur que la creation de commande, computeOrderPricing y est
// deja defini (backend/routes/orders.js), jamais une deuxieme
// implementation du calcul de prix.
// type/quantity optionnels ('print'/1 par defaut cote backend si omis) :
// simulent le VRAI prix d'un type de commande (pdf/print/pack) et d'une
// quantite donnee — reponse `{ printFormat, pageCount, unitCents, totalCents }`.
export const estimatePrice = (bookId, { printFormat, pageCount, type, quantity } = {}) => {
  const params = new URLSearchParams();
  if (printFormat) params.set('print_format', printFormat);
  if (pageCount) params.set('page_count', String(pageCount));
  if (type) params.set('type', type);
  if (quantity) params.set('quantity', String(quantity));
  const query = params.toString();
  return request(`/orders/book/${bookId}/price-estimate${query ? `?${query}` : ''}`);
};

// --- Composition + apercu -----------------------------------------------------

// `mood` (optionnel) : ambiance de composition choisie dans l'atelier (voir
// atelierMoods.js) — jamais persistee, simple parametre de generation
// ponctuel (comme `variant`). Omise = comportement standard (l'assistant
// /composer existant continue d'appeler composeBook sans mood, inchange).
export const composeBook = (bookId, variant = 0, mood) => request(`/books/${bookId}/compose`, {
  method: 'POST',
  body: JSON.stringify({ variant, ...(mood ? { mood } : {}) })
});

export const fetchPreviewHtml = async (bookId) => {
  const response = await rawRequest(`/books/${bookId}/preview.html`);
  return response.text();
};

// Apercu dedie a UNE face de la couverture (front|back), sans les pages
// interieures : rapide, cale sur width:100vw/height:100vh cote serveur donc
// jamais de defilement quelle que soit la taille de la iframe qui l'affiche
// — utilise par l'ecran de personnalisation legere de la couverture (photo,
// sous-titre, date, phrase de 4e).
export const fetchCoverPreviewHtml = async (bookId, face = 'front') => {
  const response = await rawRequest(`/books/${bookId}/cover-preview.html?face=${face === 'back' ? 'back' : 'front'}`);
  return response.text();
};

export const fetchPreviewPdfBlob = async (bookId) => {
  const response = await rawRequest(`/books/${bookId}/preview.pdf`);
  return response.blob();
};

// --- Apercu multi-format (JE VERIFIE) -----------------------------------------
// Voir backend/services/composition/formatComposer.js : le contenu verrouille
// dans l'atelier reste identique, seul le contenu automatique est recompose
// avec la densite propre a chaque format (marges/photos/typo/mise en page).

// Pagination reelle de CHAQUE format (livret/standard/luxe) pour le contenu
// actuel, sans rien persister — alimente les 3 cartes de l'Apercu final avant
// meme un clic. Reponse : { formats: [{ formatId, pageCount }, ...] }.
export const getFormatOptions = (bookId) => request(`/books/${bookId}/format-options`);

// Choisit un format : recompose (contenu non verrouille seulement),
// persiste, et met a jour book.print_format/book.page_count — ce que
// "Commander mon livre" imprimera correspond donc toujours a ce qui vient
// d'etre recompose ici. Reponse : { book, pages, pageCount }.
export const chooseFormat = (bookId, formatId) => request(`/books/${bookId}/format`, {
  method: 'POST',
  body: JSON.stringify({ formatId })
});

// --- Atelier de creation personnalisee (edition manuelle page par page) -----

export const listPages = (bookId) => request(`/books/${bookId}/pages`);

// Apercu d'UNE page interieure a la fois, contenu reel — meme moteur que le
// PDF final (renderSinglePageHtml, voir routes/composition.js), meme
// principe que fetchCoverPreviewHtml pour les couvertures. Fonctionne aussi
// pour une page jamais encore construite (rendue comme une page vide).
export const fetchInteriorPagePreviewHtml = async (bookId, pageIndex) => {
  const response = await rawRequest(`/books/${bookId}/pages/${pageIndex}/preview.html`);
  return response.text();
};

// Sauvegarde validee d'une page construite a la main : { layoutId, itemIds }
// dans l'ordre des emplacements du format choisi. Toujours verrouillee
// (locked=true) cote serveur — jamais ecrasee par une recomposition
// automatique ulterieure (voir manualPageBuilder.js).
export const saveManualPage = (bookId, pageIndex, { layoutId, itemIds }) => request(
  `/books/${bookId}/pages/${pageIndex}/manual`,
  { method: 'PUT', body: JSON.stringify({ layoutId, itemIds }) }
);

// Vide une page (retour a l'etat vierge, deverrouillee) : reutilise la route
// generique PUT /pages/:pageIndex deja existante, aucune route dediee
// necessaire pour "vider" une page.
export const clearPage = (bookId, pageIndex) => request(
  `/books/${bookId}/pages/${pageIndex}`,
  { method: 'PUT', body: JSON.stringify({ layout_id: null, content: {}, locked: false }) }
);

// Reecrit le contenu d'une page deja enregistree SANS repasser par
// saveManualPage (qui exige un nombre d'items EXACTEMENT egal au nombre
// d'emplacements du format et rejetterait donc un retrait partiel — voir
// backend/services/composition/manualPageBuilder.js) — reutilise la meme
// route generique que clearPage, avec un `content` deja recalcule cote
// appelant (ex. retirer un seul id de itemIds/blocks[*].itemIds). layoutId/
// locked sont TOUJOURS explicitement repasses (jamais omis) : cette route
// ecrit exactement ce qu'on lui donne, aucune fusion implicite a deviner.
export const updatePageContent = (bookId, pageIndex, { layoutId, content, locked }) => request(
  `/books/${bookId}/pages/${pageIndex}`,
  { method: 'PUT', body: JSON.stringify({ layout_id: layoutId, content, locked }) }
);

// --- Lien de partage collaboratif (public, sans compte) ---------------------
// Voir backend/routes/composition.js (GET/POST /api/public/share/:token) —
// ce que le contributeur envoie ici atterrit directement dans
// book_content_items, visible immediatement dans l'atelier du proprietaire.

export const fetchShareInfo = (token) => publicRequest(`/public/share/${token}`);

export const submitShareText = (token, { text, contributorName, contributionId }) => publicRequest(
  `/public/share/${token}/text`,
  { method: 'POST', body: JSON.stringify({ text, contributorName, contributionId }) }
);

export const submitSharePhoto = async (token, file, { contributorName, contributionId }) => {
  const formData = new FormData();
  formData.append('photo', file);
  if (contributorName) formData.append('contributorName', contributorName);
  if (contributionId) formData.append('contributionId', contributionId);

  const response = await publicRawRequest(`/public/share/${token}/photo`, {
    method: 'POST',
    body: formData
  });
  return response.json();
};

export const getApiBaseUrl = buildApiBaseUrl;

// --- Mode collectif (invitations nominatives, suivi, tracabilite) -----------
// Voir backend/routes/collective.js — coexiste avec le lien de partage
// anonyme ci-dessus (books.share_token) sans le remplacer : deux mecanismes
// independants. Cote proprietaire (authentifie, `request`) : activation,
// reglages, gestion des participants. Cote participant (public, par token
// individuel, `publicRequest`/`publicRawRequest`) : accueil + contribution.

export const activateCollective = (bookId, { eventTitle, message, deadline, remindersEnabled, reminderDaysBefore }) => request(
  `/books/${bookId}/collective/activate`,
  { method: 'POST', body: JSON.stringify({ eventTitle, message, deadline, remindersEnabled, reminderDaysBefore }) }
);

export const updateCollectiveSettings = (bookId, { eventTitle, message, deadline, remindersEnabled, reminderDaysBefore }) => request(
  `/books/${bookId}/collective/settings`,
  { method: 'PUT', body: JSON.stringify({ eventTitle, message, deadline, remindersEnabled, reminderDaysBefore }) }
);

export const fetchCollective = (bookId) => request(`/books/${bookId}/collective`);

export const addCollectiveParticipants = (bookId, emails) => request(
  `/books/${bookId}/collective/participants`,
  { method: 'POST', body: JSON.stringify({ emails }) }
);

export const updateCollectiveParticipant = (bookId, participantId, { email, name }) => request(
  `/books/${bookId}/collective/participants/${participantId}`,
  { method: 'PUT', body: JSON.stringify({ email, name }) }
);

export const deleteCollectiveParticipant = (bookId, participantId) => request(
  `/books/${bookId}/collective/participants/${participantId}`,
  { method: 'DELETE' }
);

export const remindCollectiveParticipant = (bookId, participantId) => request(
  `/books/${bookId}/collective/participants/${participantId}/remind`,
  { method: 'POST' }
);

export const fetchCollectiveParticipantContributions = (bookId, participantId) => request(
  `/books/${bookId}/collective/participants/${participantId}/contributions`
);

// --- Participant (public, par token individuel, sans compte) ---------------

export const fetchCollectiveInvite = (token) => publicRequest(`/public/collectif/${token}`);

export const submitCollectiveText = (token, text) => publicRequest(
  `/public/collectif/${token}/text`,
  { method: 'POST', body: JSON.stringify({ text }) }
);

export const submitCollectivePhoto = async (token, file) => {
  const formData = new FormData();
  formData.append('photo', file);

  const response = await publicRawRequest(`/public/collectif/${token}/photo`, {
    method: 'POST',
    body: formData
  });
  return response.json();
};

export const finishCollectiveContribution = (token) => publicRequest(
  `/public/collectif/${token}/finish`,
  { method: 'POST' }
);
