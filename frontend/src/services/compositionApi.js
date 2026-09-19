import { supabase } from './supabaseClient';
import { fetchWithWakeRetry } from './httpClient';

// Adresse de l API.
//
// REACT_APP_API_URL accepte une valeur RELATIVE, « /api », et c est la plus
// sure quand le meme serveur sert le site et l API : le fichier construit
// n embarque alors aucun nom de machine et fonctionne partout — sur une IP
// aujourd hui, sur le domaine demain, sans reconstruction.
//
// Une adresse absolue reste necessaire la ou site et API sont deux services
// distincts (Render) ou sur deux ports (developpement local).
//
// Le 2026-09-19, un fichier construit sans cette variable a ete deploye sur
// Scaleway : le site y appelait l API de Render, et l espace d administration
// repondait « Page introuvable » alors que tout etait correctement configure.
// Une adresse d API valable commence par http(s):// ou par une barre. Tout
// le reste est une valeur abimee en chemin, et le site est alors MORT sans
// rien dire : chaque appel echoue en « Failed to fetch », les boutons ne
// repondent plus, les pages se vident.
//
// Ca n a rien de theorique. Le 2026-09-19, une construction lancee depuis
// Git Bash avec REACT_APP_API_URL=/api a livre un site qui appelait
// file:///C:/Program Files/Git/api/health : MSYS convertit toute valeur
// commencant par une barre en chemin Windows. Le fichier construit etait
// pourtant conforme a tous les controles qu'on lui faisait passer.
//
// On retombe donc sur une adresse relative, et on le CRIE dans la console :
// un site qui marche vaut mieux qu un site mort, mais la construction est a
// refaire.
const ADRESSE_VALABLE = /^(https?:\/\/|\/)/;

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  if (!ADRESSE_VALABLE.test(configured)) {
    // eslint-disable-next-line no-console
    console.error(
      `[Celebrons] REACT_APP_API_URL vaut « ${configured} », ce qui n'est pas une adresse. `
      + 'Le site a ete construit avec une variable abimee (souvent MSYS/Git Bash qui '
      + 'transforme /api en chemin Windows : utiliser MSYS_NO_PATHCONV=1). '
      + 'On se rabat sur /api ; la construction est a refaire.'
    );
    return '/api';
  }

  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};
// Timeouts/retry mutualises (voir services/httpClient.js) — 15s codes en
// dur ici auparavant, trop court pour le reveil d'une instance Render.

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

// Requete JSON standard (GET/POST/PUT/DELETE avec corps JSON). Timeout +
// seconde tentative sur reveil d'instance : voir httpClient.js.
const request = async (path, options = {}) => {
  const { headers } = await buildHeaders();
  const response = await fetchWithWakeRetry(`${buildApiBaseUrl()}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    const error = new Error(payload?.error || 'Erreur du moteur de mise en page.');
    // Details structures conserves, pas seulement le message : certaines
    // routes repondent autre chose qu'un simple echec (ex. POST /pages/shrink
    // renvoie 409 + needsConfirmation + les numeros des pages concernees,
    // pour que l'appelant puisse POSER la question plutot que d'afficher un
    // refus sec). Purement additif : les appelants existants continuent de
    // lire err.message comme avant.
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
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
  const response = await fetchWithWakeRetry(`${buildApiBaseUrl()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(payload?.error || 'Erreur.');
  }
  return payload;
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

// Modifie un souvenir existant (edition du texte directement sur la page,
// voir AtelierTextEditor.js) — backend PUT /content-items/:itemId.
export const updateContentItem = (bookId, itemId, patch) => request(`/books/${bookId}/content-items/${itemId}`, {
  method: 'PUT',
  body: JSON.stringify(patch)
});

// `origin` dit d'ou vient le souvenir, et decide de sa duree de vie (voir
// backend routes/composition.js sanitizeItemOrigin) :
//   'library' — ajoute deliberement via le bouton "Ajouter" : il reste, qu'il
//               soit utilise ou non. C'est le defaut.
//   'page'    — ecrit directement dans un emplacement de page : il n'existe
//               que pour cet emplacement, et disparait s'il en sort.
export const addTextItem = (bookId, text, displayOrder = 0, origin = 'library') => request(`/books/${bookId}/content-items`, {
  method: 'POST',
  body: JSON.stringify({
    source: 'upload',
    kind: 'texte',
    text,
    display_order: displayOrder,
    metadata: { origin: origin === 'page' ? 'page' : 'library' }
  })
});

// Supprime TOUS les souvenirs d'un type ('photo' ou 'texte'). Irreversible :
// le backend exige `confirm: true` et nettoie aussi les references laissees
// sur les pages ainsi que les fichiers du stockage.
export const deleteAllContentItems = (bookId, kind) => request(
  `/books/${bookId}/content-items?kind=${encodeURIComponent(kind)}`,
  { method: 'DELETE', body: JSON.stringify({ confirm: true }) }
);

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

// Ajoute des pages vides a la fin du livre (bouton "+2" du filmstrip
// atelier) — voir routes/composition.js: POST /pages/extend.
export const extendBookPages = (bookId, count = 2) => request(`/books/${bookId}/pages/extend`, {
  method: 'POST',
  body: JSON.stringify({ count })
});

// Retire des pages a la fin du livre (bouton "-2" du filmstrip atelier) —
// voir routes/composition.js: POST /pages/shrink. `confirm` n'est a passer
// que si le serveur a repondu 409 needsConfirmation (les pages retirees ne
// sont pas vides) ET que l'utilisateur a explicitement accepte la perte.
export const shrinkBookPages = (bookId, count = 2, confirm = false) => request(`/books/${bookId}/pages/shrink`, {
  method: 'POST',
  body: JSON.stringify({ count, confirm })
});

// Deplace une page a une autre position (glisser-deposer dans le filmstrip) —
// voir routes/composition.js: POST /pages/move. Ce n'est pas une permutation :
// les pages situees entre les deux positions se decalent, l'ordre de lecture
// du reste du livre est donc preserve.
export const movePage = (bookId, fromIndex, toIndex) => request(`/books/${bookId}/pages/move`, {
  method: 'POST',
  body: JSON.stringify({ fromIndex, toIndex })
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
// photoAdjustments (optionnel, cahier des charges "PhotoSlot" 2026-09-10) :
// { [itemId]: {focalX, focalY, zoom, fitMode} } — l'UI dediee pour le
// regler a la main a ete retiree (retour utilisateur : "ne sert a rien"),
// mais le champ reste transmis tel quel (toujours vide en pratique
// desormais) pour ne jamais ecraser silencieusement un ajustement deja
// enregistre. Nettoye/borne cote backend (routes/composition.js:
// sanitizePhotoAdjustments), jamais besoin de validation ici.
// textRoles/textStyles (optionnels, cahier des charges typographique
// 2026-09-11) : { [itemId]: 'title'|'subtitle'|'body'|'caption'|'quote' } et
// { [itemId]: {align, color, sizePt} }. Egalement nettoyes/bornes cote
// backend (sanitizeTextRoles/sanitizeTextStyles) : une valeur hors du cadre
// est ecartee au profit de celle du role, jamais appliquee telle quelle.
export const saveManualPage = (bookId, pageIndex, { layoutId, itemIds, photoAdjustments, photoCaptions, textRoles, textStyles }) => request(
  `/books/${bookId}/pages/${pageIndex}/manual`,
  { method: 'PUT', body: JSON.stringify({ layoutId, itemIds, photoAdjustments, photoCaptions, textRoles, textStyles }) }
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

// Controle qualite d'impression (cahier des charges "PhotoSlot", 2026-09-10,
// §20/21) — utilise par AtelierFinishModal a l'ouverture ("Terminer mon
// livre"), un seul appel, jamais bloquant. { pagesCount, photosCount,
// lowQualityPhotos:[{pageIndex,itemId,level,dpi,emoji,label}], allGood }.
// --- Point de restauration avant generation automatique ---------------------
// Voir backend/sql/phase19_book_snapshots.sql. UN SEUL point par livre : le
// filet du dernier geste destructeur, pas un historique.
//
// `snapshot` vaut null quand il n'y a rien a retablir — ce n'est pas une
// erreur, c'est une reponse.
export const getBookSnapshot = (bookId) => request(`/books/${bookId}/snapshot`);

export const restoreBookSnapshot = (bookId) => request(
  `/books/${bookId}/snapshot/restore`,
  { method: 'POST' }
);

// « Je garde cette version » : abandonne le retour en arriere.
export const discardBookSnapshot = (bookId) => request(
  `/books/${bookId}/snapshot`,
  { method: 'DELETE' }
);

export const getPrintQualityCheck = (bookId) => request(`/books/${bookId}/print-quality-check`);

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
