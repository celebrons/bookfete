// backend/routes/composition.js
//
// Moteur de mise en page sans IA (phase03/04) : catalogues publics
// (templates, layouts) + contenu d'un livre + composition en pages.
// Voir backend/sql/phase03_data_model.sql pour le schema et
// backend/services/composition/ pour l'acces donnees et l'algorithme.

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');
const upload = require('../middleware/upload');
const storageService = require('../services/storageService');
const templateCatalog = require('../services/composition/templateCatalog');
const bookContentService = require('../services/composition/bookContentService');
const layoutEngine = require('../services/composition/layoutEngine');
const pageRenderer = require('../services/composition/pageRenderer');
const pdfService = require('../services/composition/pdfService');
const coverComposer = require('../services/composition/coverComposer');
const { resolveCoverFormat, COVER_FORMATS, DEFAULT_COVER_FORMAT_ID } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');
const { composeBookForFormat } = require('../services/composition/formatComposer');
const { buildManualPageContent } = require('../services/composition/manualPageBuilder');
const { MOOD_LAYOUT_WEIGHTS } = require('../services/composition/layoutScoring');
const photoQualityEngine = require('../services/composition/photoQualityEngine');
const textQualityEngine = require('../services/composition/textQualityEngine');
const typographySystem = require('../services/composition/typographySystem');
const { PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX } = pageRenderer;

// Fusionne dimensions (coverFormat.js) + densite (formatDensity.js) en UN
// objet `format`, transmis tel quel a pageRenderer.js/coverComposer.js — ces
// modules restent des fonctions pures de leur input, ils n'importent pas
// formatDensity.js eux-memes (voir formatDensity.js, en-tete).
function resolveRenderFormat(formatId) {
  const normalized = Object.prototype.hasOwnProperty.call(COVER_FORMATS, formatId) ? formatId : DEFAULT_COVER_FORMAT_ID;
  return { formatId: normalized, ...resolveCoverFormat(formatId), ...resolveFormatDensity(formatId) };
}

function clamp01(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : null;
}

// Nettoie { [itemId]: {focalX, focalY, zoom, fitMode} } venu du client (voir
// AtelierPhotoAdjustModal.js, pas encore construit a ce stade du chantier
// "PhotoSlot") avant de l'attacher a content.photoAdjustments — jamais
// bloquant (une entree invalide est simplement ignoree, pas une erreur 400)
// et jamais d'itemId etranger a CETTE page (validIds = les itemIds reels du
// bloc sauvegarde). Les bornes du zoom viennent de pageRenderer.js
// (PHOTO_ZOOM_MIN/MAX) — source unique, voir son entete.
function sanitizePhotoAdjustments(raw, validItemIds) {
  if (!raw || typeof raw !== 'object') return undefined;
  const validSet = new Set(validItemIds);
  const cleaned = {};
  Object.entries(raw).forEach(([itemId, adjustment]) => {
    if (!validSet.has(itemId) || !adjustment || typeof adjustment !== 'object') return;
    const focalX = clamp01(adjustment.focalX);
    const focalY = clamp01(adjustment.focalY);
    const zoomNum = Number(adjustment.zoom);
    const zoom = Number.isFinite(zoomNum) ? Math.min(PHOTO_ZOOM_MAX, Math.max(PHOTO_ZOOM_MIN, zoomNum)) : PHOTO_ZOOM_MIN;
    const fitMode = adjustment.fitMode === 'contain' ? 'contain' : 'cover';
    cleaned[itemId] = {
      focalX: focalX ?? 0.5,
      focalY: focalY ?? 0.5,
      zoom,
      fitMode
    };
  });
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// Nettoie { [itemId]: "legende" } venu du client — la legende attachee a UNE
// photo (voir pageRenderer.imgFrame), independante du format de page.
//
// Deux bornes, jamais une erreur : une legende trop longue est COUPEE plutot
// que rejetee (elle est saisie au fil de l'eau, refuser la sauvegarde ferait
// perdre la frappe), et une legende vide retire l'entree au lieu d'ecrire une
// chaine vide qui ferait afficher un bandeau sombre sans texte.
const PHOTO_CAPTION_MAX = 140;

function sanitizePhotoCaptions(raw, validItemIds) {
  if (!raw || typeof raw !== 'object') return undefined;
  const validSet = new Set(validItemIds);
  const cleaned = {};
  Object.entries(raw).forEach(([itemId, caption]) => {
    if (!validSet.has(itemId)) return;
    // Deux formes acceptees : une simple chaine (legendes ecrites avant
    // l'ajout de la couleur — jamais de migration de donnees) ou
    // { texte, couleur }. Toujours NORMALISE vers la seconde a l'ecriture,
    // pour qu'il n'y ait qu'une forme a lire en base a partir de maintenant.
    const brut = typeof caption === 'string' ? { texte: caption } : caption;
    if (!brut || typeof brut !== 'object' || typeof brut.texte !== 'string') return;
    const texte = brut.texte.trim().slice(0, PHOTO_CAPTION_MAX);
    if (!texte) return;
    // DEUX couleurs, jamais une palette : le seul vrai choix est "clair sur
    // sombre" ou "sombre sur clair". Toute autre valeur retombe sur le
    // blanc plutot que d'atterrir dans le rendu (decision produit
    // 2026-09-15). Voir pageRenderer.imgFrame pour le rendu.
    cleaned[itemId] = { texte, couleur: brut.couleur === 'noir' ? 'noir' : 'blanc' };
  });
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// Nettoie { [itemId]: role } venu du client. Meme principe que
// sanitizePhotoAdjustments : jamais bloquant, jamais d'itemId etranger a la
// page, et surtout jamais un role invente — normalizeRole ramene toute
// valeur inconnue sur 'body' plutot que de laisser passer une chaine libre
// qui n'aurait aucune traduction typographique.
function sanitizeTextRoles(raw, validItemIds) {
  if (!raw || typeof raw !== 'object') return undefined;
  const validSet = new Set(validItemIds);
  const cleaned = {};
  Object.entries(raw).forEach(([itemId, role]) => {
    if (!validSet.has(itemId)) return;
    cleaned[itemId] = typographySystem.normalizeRole(role);
  });
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// Nettoie { [itemId]: {align, color, sizePt} }. C'est ici que se joue
// concretement le "Celebrons reste responsable du design" du cahier des
// charges : une couleur hors palette, un alignement fantaisiste ou une
// taille hors de la plage du role sont ECARTES — pas rejetes avec une
// erreur (l'utilisateur n'y peut rien), simplement ignores au profit de la
// valeur du role. Il est donc impossible, meme en appelant l'API
// directement, de casser la coherence typographique du livre.
function sanitizeTextStyles(raw, validItemIds) {
  if (!raw || typeof raw !== 'object') return undefined;
  const validSet = new Set(validItemIds);
  const cleaned = {};
  Object.entries(raw).forEach(([itemId, style]) => {
    if (!validSet.has(itemId) || !style || typeof style !== 'object') return;
    const entry = {};
    if (['left', 'center', 'right', 'justify'].includes(style.align)) entry.align = style.align;
    if (typographySystem.TEXT_COLORS[style.color]) entry.color = style.color;
    const sizePt = Number(style.sizePt);
    if (Number.isFinite(sizePt)) entry.sizePt = sizePt; // borne par resolveRoleStyle a l'usage
    if (Object.keys(entry).length > 0) cleaned[itemId] = entry;
  });
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// Annote le `content` d'UNE page (statut qualite par photo, cahier des
// charges v2 §4) avant sauvegarde. Charge items/layouts a la demande —
// jamais bloquant : si quoi que ce soit echoue ou n'est pas evaluable, le
// payload repart tel quel plutot que de faire echouer la sauvegarde d'une
// page pour une simple annotation informative.
async function annotateSinglePagePayload(book, payload = {}) {
  const content = payload?.content;
  if (!content || !Array.isArray(content.blocks) || content.blocks.length === 0) return payload;

  try {
    const [items, layouts] = await Promise.all([
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts()
    ]);
    const [withPhotoFit] = photoQualityEngine.annotatePagesWithPhotoFit({
      pages: [{ content }],
      items,
      layouts,
      formatId: book.print_format
    });
    // Qualite TEXTE annotee dans la meme passe (cahier des charges
    // typographique §19) : un seul objet content porte les deux verdicts,
    // donc un seul ecran recapitulatif a lire avant commande.
    const [annotated] = textQualityEngine.annotatePagesWithTextFit({
      pages: [withPhotoFit],
      items,
      layouts,
      formatId: book.print_format
    });
    return { ...payload, content: annotated.content };
  } catch (_error) {
    return payload;
  }
}

// Bucket Supabase Storage reutilise (deja utilise par le parcours contributeur
// cote client). Un bucket dedie pourra etre introduit plus tard sans impact
// sur le modele de donnees : seul ce nom change.
const PHOTO_BUCKET = 'contribution-photos';

async function getBook(bookId) {
  // select('*') deliberement, pas une liste explicite de colonnes : certaines
  // colonnes lues de facon opportuniste par la couverture (event_date,
  // recipient_name — heritees de l'ancien flux, jamais garanties presentes
  // sur toutes les installations) feraient echouer TOUTE la requete si on
  // les nommait explicitement et qu'elles n'existent pas reellement en base
  // (contrairement a select('*'), qui ne renvoie jamais d'erreur pour une
  // colonne absente — meme convention deja utilisee par routes/books.js/
  // routes/orders.js avec `book?.recipient_name` en optional chaining).
  // Verifie en production : c'est exactement ce qui causait "Livre
  // introuvable" sur toutes les routes de composition apres l'ajout de ces
  // colonnes a une liste explicite.
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .single();

  if (error || !data) return null;
  return data;
}

// Verifie que le livre cible (:bookId) appartient a l'utilisateur authentifie.
// Attache le livre charge a req.book pour eviter une deuxieme requete.
async function requireOwnedBook(req, res, next) {
  const book = await getBook(req.params.bookId);
  if (!book) {
    return res.status(404).json({ error: 'Livre introuvable.' });
  }

  if (book.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Acces refuse.' });
  }

  req.book = book;
  return next();
}

// Resout un livre par son lien de partage collaboratif (books.share_token,
// voir sql/phase12_book_share_token.sql) — jamais d'authentification : c'est
// exactement le but du lien ("un proche ajoute ses souvenirs sans compte").
// Meme forme que requireOwnedBook, mais aucune verification owner_id : le
// token lui-meme (opaque, non devinable) est la seule protection, meme
// principe deja utilise par le systeme d'invitation existant
// (inviteController.checkInviteToken).
async function resolveBookByShareToken(req, res, next) {
  const { data, error } = await supabase
    .from('books')
    .select('id, title')
    .eq('share_token', req.params.token)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: 'Lien invalide ou expire.' });
  }

  req.book = data;
  return next();
}

// ============================================================
// Catalogues (lecture publique)
// ============================================================

// GET /api/catalog/templates
router.get('/api/catalog/templates', async (_req, res) => {
  try {
    const data = await templateCatalog.listActiveTemplates();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/catalog/layouts
router.get('/api/catalog/layouts', async (_req, res) => {
  try {
    const data = await templateCatalog.listActiveLayouts();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Contenu normalise d'un livre (book_content_items)
// ============================================================

// GET /api/books/:bookId/content-items
router.get('/api/books/:bookId/content-items', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const data = await bookContentService.listContentItems(req.params.bookId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// D'OU VIENT UN SOUVENIR ECRIT PAR LE CREATEUR (metadata.origin).
//
// Deux origines, et elles n'ont pas la meme duree de vie (regle produit
// 2026-09-14) :
//
//   'page'    — ecrit directement DANS un emplacement de page. Il n'existe
//               que pour remplir cet emplacement : s'il en sort, il n'a plus
//               de raison d'etre et ne doit PAS encombrer la bibliotheque.
//   'library' — ajoute deliberement via le bouton "Ajouter" de la
//               bibliotheque. C'est un geste explicite : il reste, qu'il soit
//               utilise ou non.
//
// Les contributions (source 'contribution') ne sont jamais concernees : la
// bibliotheque sert AVANT TOUT a recueillir les souvenirs des contributeurs,
// ils ne s'effacent jamais tout seuls.
//
// Absente ou inconnue -> 'library', c'est-a-dire le comportement d'avant :
// un souvenir existant, ou cree par un appelant qui ignore ce champ, n'est
// jamais supprime automatiquement.
function sanitizeItemOrigin(raw) {
  const valeur = raw?.metadata?.origin;
  return valeur === 'page' ? 'page' : 'library';
}

// POST /api/books/:bookId/content-items
router.post('/api/books/:bookId/content-items', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      metadata: { ...(req.body?.metadata || {}), origin: sanitizeItemOrigin(req.body) }
    };
    const data = await bookContentService.createContentItem(req.params.bookId, payload);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books/:bookId/content-items/photo
// Upload multipart (champ "photo") : stocke le fichier dans Supabase Storage
// puis cree le book_content_item correspondant. Reutilise le middleware
// upload.js (multer, 5 Mo/5 fichiers, memoryStorage) et storageService.js
// deja en place, jusque-la jamais branches ensemble sur une route.
router.post(
  '/api/books/:bookId/content-items/photo',
  authenticate,
  requireOwnedBook,
  upload.uploadSinglePhoto('photo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Fichier manquant (champ "photo").' });
      }

      const uploadResult = await storageService.uploadFile(PHOTO_BUCKET, req.file, req.params.bookId);
      if (!uploadResult.success) {
        return res.status(500).json({ error: uploadResult.error || "Echec de l'upload." });
      }

      const displayOrder = Number.parseInt(req.body?.display_order, 10);

      // Orientation/ratio sondes a l'upload (voir storageService.js) : un
      // facteur de scoring doux pour le moteur de mise en page (voir
      // layoutScoring.js) — absent (photo deja uploadee avant cette passe,
      // ou sonde en echec) ne bloque jamais rien, juste neutre pour le score.
      const metadata = {};
      if (uploadResult.orientation) metadata.orientation = uploadResult.orientation;
      if (uploadResult.ratio) metadata.ratio = uploadResult.ratio;
      if (uploadResult.width) metadata.width = uploadResult.width;
      if (uploadResult.height) metadata.height = uploadResult.height;
      // Miniature (grille "Mes souvenirs" de l'atelier) et version
      // intermediaire (affichage une fois placee) — absentes si la
      // generation a echoue (storageService.js), jamais bloquant : le
      // frontend se replie alors sur `url` (l'original).
      if (uploadResult.thumbnailUrl) metadata.thumbnailUrl = uploadResult.thumbnailUrl;
      if (uploadResult.previewUrl) metadata.previewUrl = uploadResult.previewUrl;

      // NOM ET POIDS DU FICHIER D'ORIGINE (2026-09-19).
      //
      // Le seul moyen de reconnaitre une photo deja envoyee : une fois dans
      // Supabase Storage, elle porte un nom genere et plus rien ne rattache
      // le fichier a celui choisi sur le disque. Sans ces deux champs,
      // l'atelier ne peut pas dire « celle-ci est deja dans votre livre » —
      // demande du 2026-09-19 (« detecter les doublons... nom ? taille ? »).
      //
      // Ce n'est pas une empreinte du contenu : deux fichiers de meme nom et
      // de meme poids sont, en pratique, le meme fichier envoye deux fois,
      // mais l'atelier s'en sert pour PREVENIR, jamais pour refuser.
      // Les photos envoyees avant cette date n'ont pas ces champs : elles ne
      // seront simplement jamais reconnues comme doublons.
      if (req.file.originalname) {
        metadata.originalName = String(req.file.originalname).slice(0, 200);
      }
      if (Number.isFinite(req.file.size)) {
        metadata.size = req.file.size;
      }

      const data = await bookContentService.createContentItem(req.params.bookId, {
        source: 'upload',
        kind: 'photo',
        url: uploadResult.url,
        display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
        metadata
      });

      res.status(201).json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// PUT /api/books/:bookId/content-items/:itemId
router.put('/api/books/:bookId/content-items/:itemId', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const data = await bookContentService.updateContentItem(req.params.bookId, req.params.itemId, req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/books/:bookId/content-items?kind=photo|texte
// Supprime TOUS les souvenirs d'un type (bouton "Tout supprimer" de
// l'atelier). Geste destructif et irreversible : exige `confirm: true` dans
// le corps, pour qu'un appel accidentel — ou une requete mal formee — ne
// puisse jamais vider un livre.
//
// Declaree AVANT la route /:itemId ci-dessous : sinon Express ferait
// correspondre cette URL a un itemId vide.
router.delete('/api/books/:bookId/content-items', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const kind = String(req.query.kind || '').trim().toLowerCase();
    if (kind !== 'photo' && kind !== 'texte') {
      return res.status(400).json({ error: "Precisez ce qu'il faut supprimer (kind=photo ou kind=texte)." });
    }
    if (req.body?.confirm !== true) {
      return res.status(409).json({
        error: 'Suppression definitive : confirmez explicitement.',
        needsConfirmation: true
      });
    }

    const deleted = await bookContentService.deleteContentItemsByKind(req.book.id, kind);

    // Menage du stockage : original + miniature + version intermediaire de
    // chaque photo. Best effort et APRES la suppression en base — un fichier
    // orphelin ne coute qu'un peu d'espace, alors qu'une erreur ici laisserait
    // l'utilisateur avec des souvenirs qu'il croit supprimes.
    let filesRemoved = 0;
    for (const item of deleted) {
      const urls = [item.url, item.metadata?.thumbnailUrl, item.metadata?.previewUrl].filter(Boolean);
      for (const url of urls) {
        // eslint-disable-next-line no-await-in-loop
        if (await storageService.deleteByPublicUrl(url)) filesRemoved += 1;
      }
    }

    return res.json({ deleted: deleted.length, filesRemoved });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/books/:bookId/content-items/:itemId
router.delete('/api/books/:bookId/content-items/:itemId', authenticate, requireOwnedBook, async (req, res) => {
  try {
    await bookContentService.deleteContentItem(req.params.bookId, req.params.itemId);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Lien de partage collaboratif (public, sans authentification)
// ============================================================
// "Album collaboratif" (parcours d'entree) : le proprietaire partage UN lien
// (books.share_token), un proche l'ouvre sans compte et ajoute directement
// des souvenirs — contrairement a l'ancien systeme d'invitation par email
// (chapter_invites, laisse intact), ce qui est ajoute ici atterrit
// directement dans book_content_items, donc visible immediatement dans
// l'atelier du proprietaire. Reutilise exactement bookContentService.
// createContentItem/storageService.uploadFile — meme logique que les routes
// authentifiees ci-dessus, seule la porte d'entree change.

async function nextDisplayOrder(bookId) {
  const { count } = await supabase
    .from('book_content_items')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', bookId);
  return count || 0;
}

// GET /api/public/share/:token
// Volontairement minimal : jamais plus que de quoi accueillir le
// contributeur ("Ajoutez vos souvenirs pour <title>") — aucune autre donnee
// du livre n'est exposee sans authentification.
router.get('/api/public/share/:token', resolveBookByShareToken, async (req, res) => {
  res.json({ id: req.book.id, title: req.book.title });
});

// POST /api/public/share/:token/text
router.post('/api/public/share/:token/text', resolveBookByShareToken, async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'Texte manquant.' });
    }
    const contributorName = typeof req.body?.contributorName === 'string' ? req.body.contributorName.trim() : '';
    const contributionId = typeof req.body?.contributionId === 'string' ? req.body.contributionId : null;

    const displayOrder = await nextDisplayOrder(req.book.id);
    const data = await bookContentService.createContentItem(req.book.id, {
      source: 'contribution',
      kind: 'texte',
      text,
      contribution_id: contributionId,
      display_order: displayOrder,
      metadata: contributorName ? { contributor_name: contributorName } : {}
    });
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/public/share/:token/photo
// Meme middlewares (upload.js/storageService.js) que la route authentifiee
// equivalente (content-items/photo ci-dessus) — miniature/version
// intermediaire generees pareil, jamais de deuxieme implementation.
router.post(
  '/api/public/share/:token/photo',
  resolveBookByShareToken,
  upload.uploadSinglePhoto('photo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Fichier manquant (champ "photo").' });
      }

      const uploadResult = await storageService.uploadFile(PHOTO_BUCKET, req.file, req.book.id);
      if (!uploadResult.success) {
        return res.status(500).json({ error: uploadResult.error || "Echec de l'upload." });
      }

      const contributorName = typeof req.body?.contributorName === 'string' ? req.body.contributorName.trim() : '';
      const contributionId = typeof req.body?.contributionId === 'string' ? req.body.contributionId : null;

      const metadata = contributorName ? { contributor_name: contributorName } : {};
      if (uploadResult.orientation) metadata.orientation = uploadResult.orientation;
      if (uploadResult.ratio) metadata.ratio = uploadResult.ratio;
      if (uploadResult.width) metadata.width = uploadResult.width;
      if (uploadResult.height) metadata.height = uploadResult.height;
      if (uploadResult.thumbnailUrl) metadata.thumbnailUrl = uploadResult.thumbnailUrl;
      if (uploadResult.previewUrl) metadata.previewUrl = uploadResult.previewUrl;

      const displayOrder = await nextDisplayOrder(req.book.id);
      const data = await bookContentService.createContentItem(req.book.id, {
        source: 'contribution',
        kind: 'photo',
        url: uploadResult.url,
        contribution_id: contributionId,
        display_order: displayOrder,
        metadata
      });

      res.status(201).json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================
// Composition (layoutEngine) + pages assemblees (book_pages)
// ============================================================

// GET /api/books/:bookId/pages
router.get('/api/books/:bookId/pages', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const data = await bookContentService.listPages(req.params.bookId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/books/:bookId/recommended-page-count
// Mode Automatique (§06) : calcule le palier recommande a partir du volume
// reel de contenu, avant meme que l'utilisateur ne choisisse. Utilisable
// aussi en mode Manuel pour avertir si le palier choisi est trop juste.
router.get('/api/books/:bookId/recommended-page-count', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const [template, items, layouts] = await Promise.all([
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts()
    ]);

    // `targetPages` : sans lui, la reponse dirait sur combien de pages le
    // contenu tient NATURELLEMENT (21), pas combien seront remplies dans ce
    // livre-ci (30). C'est le second chiffre qui interesse l'utilisateur.
    const recommendation = layoutEngine.recommendPageCount({
      items, template, layouts, targetPages: book.page_count
    });
    res.json(recommendation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books/:bookId/compose
// Recalcule la mise en page complete du livre a partir de son contenu
// (book_content_items), de son template et du catalogue de layouts, puis
// persiste le resultat dans book_pages. Body optionnel : { variant }.
router.post('/api/books/:bookId/compose', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;

    // Le template n'est PAS requis (2026-09-15). Ce n'est qu'une liste blanche
    // de mises en page — « vide = pas de restriction » (voir
    // layoutEngine.buildPages : le catalogue complet sert alors de pioche).
    // L'exiger interdisait purement et simplement le mode automatique aux
    // livres crees par le parcours actuel, qui n'en pose aucun : « Voyage a
    // Montreal », 47 photos, template AUCUN. Les deux autres chemins de
    // composition (recommendPageCount, composeBookForFormat) s'en passaient
    // deja sans probleme.
    if (!book.page_count) {
      return res.status(422).json({ error: 'Choisissez un nombre de pages avant de composer le livre.' });
    }

    const [template, layouts, allItems, existingPages] = await Promise.all([
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null),
      templateCatalog.listActiveLayouts(),
      bookContentService.listContentItems(book.id),
      bookContentService.listPages(book.id)
    ]);

    // Template absent ou devenu inactif : on compose avec le catalogue complet
    // plutot que de refuser — un livre n'a pas a devenir incomposable parce
    // qu'un style a ete retire du catalogue.

    // Le contenu deja pose a la main ne repart PAS dans la pioche.
    //
    // replaceBookPages preserve deja les pages verrouillees (une page l'est
    // des qu'on y pose un premier element dans l'atelier) : la generation
    // automatique n'a jamais detruit le travail manuel. En revanche, elle
    // redistribuait AILLEURS les photos et souvenirs de ces pages — la meme
    // photo se retrouvait donc deux fois dans le livre. C'est ce qui rendait
    // "passer en mode automatique" effrayant a juste titre (retour
    // utilisateur 2026-09-14 : "j'ai peur que ca foute tout ce que j'ai fait
    // manuellement en l'air").
    //
    // Meme regle, meme code que composeBookForFormat (formatComposer.js), ou
    // ce point etait deja traite et ou cet angle mort etait note.
    const lockedItemIds = new Set(
      existingPages
        .filter((page) => page.locked)
        .flatMap((page) => (page.content?.itemIds || []).filter(Boolean))
    );
    const items = allItems.filter((item) => !lockedItemIds.has(item.id));
    const lockedPageCount = existingPages.filter((page) => page.locked).length;

    const variant = Number.isInteger(req.body?.variant) ? req.body.variant : 0;
    // Ambiance de composition (voir layoutScoring.MOOD_LAYOUT_WEIGHTS) :
    // parametre de generation ponctuel, jamais persiste (comme `variant`).
    // Un id absent/inconnu degrade silencieusement vers le comportement
    // standard plutot que de renvoyer une erreur.
    const requestedMood = typeof req.body?.mood === 'string' ? req.body.mood : null;
    const mood = requestedMood && Object.prototype.hasOwnProperty.call(MOOD_LAYOUT_WEIGHTS, requestedMood)
      ? requestedMood
      : undefined;
    const result = layoutEngine.compose({
      items,
      template,
      layouts,
      pageCount: book.page_count,
      variant,
      mood,
      // Adequation photo<->emplacement (voir layoutScoring.scoreOrientation) :
      // le ratio de la page (carre pour livret, portrait pour standard/luxe)
      // fait partie du calcul pour les emplacements pleine page.
      formatId: book.print_format
    });

    // Plancher DUR (choix utilisateur confirme 2026-09-09) : en dessous de
    // layoutEngine.MIN_PRINTABLE_PAGES (minimum imprimable Gelato), on
    // BLOQUE plutot que de completer avec des pages vides — coherent avec la
    // regle deja en place dans compose() lui-meme ("jamais de remplissage
    // artificiel"). Le frontend gate deja ce cas cote atelier
    // (BookAtelierLuxe.js: MIN_AUTO_PAGES + AtelierGenerateModal), ce garde
    // serveur est le filet de securite pour tout appelant direct de cette route.
    // Le livre ENTIER, pages manuelles comprises : celles-ci restent en
    // place (replaceBookPages ne les touche pas) et comptent donc autant que
    // les autres.
    const totalApresGeneration = result.pages.length + lockedPageCount;

    // PLUS DE BLOCAGE SUR LE PLANCHER DE 30 PAGES (2026-09-15).
    //
    // Cette route refusait de generer tant que le contenu ne remplissait pas
    // 30 pages. Le message etait arithmetiquement juste — 47 photos tiennent
    // reellement en 21 pages, le moteur en posant plusieurs par page — mais le
    // refus, lui, ne l'etait plus : depuis que les pages blanches sont des
    // pages a part entiere (rendues, comptees, facturees — voir
    // listPagesForRender), un livre de 30 pages dont 21 composees et 9 vierges
    // est parfaitement valide. C'est d'ailleurs exactement ce qu'est deja un
    // livre compose a la main.
    //
    // Concretement le plancher etait deja tenu SANS ce garde : syncPageCount
    // ramene toujours le compte a 30 minimum. Le refus n'empechait donc rien,
    // il interdisait seulement d'utiliser le mode automatique — signale le
    // 2026-09-15 : « pourtant il y a 47 photos en bibliotheque ».
    //
    // Il reste un plancher, mais le vrai : generer ZERO page viderait le livre
    // sans rien mettre a la place.
    if (totalApresGeneration === 0) {
      return res.status(422).json({
        error: "Il n'y a aucun contenu a mettre en page. Ajoutez des photos ou des souvenirs dans « Mes souvenirs », puis reessayez."
      });
    }

    // Plafond symetrique (voir layoutEngine.MAX_PRINTABLE_PAGES) : au-dela,
    // aucun produit imprimable chez Gelato — mieux vaut le signaler ici
    // qu'au moment d'une vraie commande.
    if (totalApresGeneration > layoutEngine.MAX_PRINTABLE_PAGES) {
      return res.status(422).json({
        error: `Votre contenu remplit environ ${totalApresGeneration} pages, au dessus du maximum imprimable (${layoutEngine.MAX_PRINTABLE_PAGES} pages). Retirez des photos ou des souvenirs, puis reessayez.`
      });
    }

    // Statut qualite calcule et persiste A L'ECRITURE (cahier des charges
    // v2, §4) — le client ne l'envoie jamais, il ne fait que le lire.
    const annotatedPages = photoQualityEngine.annotatePagesWithPhotoFit({
      pages: result.pages,
      items: allItems,
      layouts,
      formatId: book.print_format
    });
    const annotatedPagesWithText = textQualityEngine.annotatePagesWithTextFit({
      pages: annotatedPages,
      items: allItems,
      layouts,
      formatId: book.print_format
    });
    // POINT DE RESTAURATION, pose AVANT de remplacer quoi que ce soit.
    //
    // La generation preserve deja les pages verrouillees (c est verifie), mais
    // elle remplace tout le reste sans retour possible — le bouton en devenait
    // inutilisable par prudence : « j aimerais le tester mais sans detruire ce
    // que je viens de faire manuellement » (2026-09-15).
    //
    // Jamais bloquant : si l instantane echoue (table absente tant que la
    // migration phase19 n a pas ete jouee), la generation se deroule comme
    // avant. Le champ snapshot de la reponse dit au client s il peut proposer
    // un retour en arriere — plutot que de le proposer et d echouer au moment
    // ou l utilisateur compte dessus.
    const snapshotSaved = await bookContentService.saveSnapshot(book.id, {
      reason: bookContentService.SNAPSHOT_REASON_COMPOSE
    });

    const pages = await bookContentService.replaceBookPages(book.id, annotatedPagesWithText);
    // Une seule autorite sur le nombre de pages (plancher 30, parite, jamais
    // de contenu au-dela du compte annonce) — voir syncPageCount.
    const pageCount = await bookContentService.syncPageCount(book.id, pages.length);

    res.json({ pages, pageCount, snapshot: snapshotSaved, overflow: result.overflow, underflow: result.underflow, pageBudget: result.pageBudget });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/books/:bookId/snapshot
// Y a-t-il un livre d avant vers lequel revenir ? Decrit le point disponible
// sans rien retablir (date, nombre de pages, dont combien faites a la main) :
// de quoi proposer « revenir a mon livre d avant (30 pages, dont 12 faites a
// la main) » plutot qu un « Annuler » aveugle.
//
// 200 avec snapshot a null quand il n y en a pas — jamais un 404 : l absence
// de point n est pas une erreur, c est une reponse.
router.get('/api/books/:bookId/snapshot', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const snapshot = await bookContentService.describeSnapshot(req.book.id);
    res.json({ snapshot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books/:bookId/snapshot/restore
// Retablit le livre tel qu il etait avant la derniere generation automatique.
// Le point est CONSOMME au passage (voir restoreSnapshot) : on ne revient pas
// deux fois au meme endroit.
router.post('/api/books/:bookId/snapshot/restore', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const restored = await bookContentService.restoreSnapshot(req.book.id);
    if (!restored) {
      return res.status(404).json({ error: "Il n'y a pas de version precedente a retablir." });
    }
    const { data: updatedBook, error: readError } = await supabase
      .from('books').select('*').eq('id', req.book.id).single();
    if (readError) throw readError;
    res.json({ book: updatedBook, pages: restored.pages, pageCount: restored.pageCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/books/:bookId/snapshot
// « Je garde cette version » : abandonne le retour en arriere. Geste explicite
// de l utilisateur, pour que la proposition cesse de s afficher.
router.delete('/api/books/:bookId/snapshot', authenticate, requireOwnedBook, async (req, res) => {
  try {
    await bookContentService.discardSnapshot(req.book.id);
    res.json({ discarded: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/books/:bookId/format-options
// Apercu multi-format (JE VERIFIE) : pour CHAQUE format (livret/standard/
// luxe), le nombre de pages qu'il faudrait reellement pour ce contenu avec
// la densite de ce format — sans rien persister (formatComposer.js est pur).
// Alimente les 3 cartes de l'Apercu final (pagination + prix, cote client
// via estimatePrice) avant meme que l'utilisateur ne clique sur une carte.
router.get('/api/books/:bookId/format-options', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const [template, items, layouts, existingPages] = await Promise.all([
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts(),
      bookContentService.listPages(book.id)
    ]);

    // meetsMinimum : permet au frontend d'avertir/desactiver une carte AVANT
    // le clic plutot que de laisser l'utilisateur decouvrir le blocage apres
    // coup (voir POST /format ci-dessus, meme plancher).
    const formats = Object.keys(COVER_FORMATS).map((formatId) => {
      const { pageCount } = composeBookForFormat({ items, existingPages, template, layouts, formatId });
      return {
        formatId,
        pageCount,
        meetsMinimum: pageCount >= layoutEngine.MIN_PRINTABLE_PAGES,
        meetsMaximum: pageCount <= layoutEngine.MAX_PRINTABLE_PAGES
      };
    });

    res.json({
      formats,
      minPrintablePages: layoutEngine.MIN_PRINTABLE_PAGES,
      maxPrintablePages: layoutEngine.MAX_PRINTABLE_PAGES
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books/:bookId/format
// Choix d'un format dans l'Apercu final : recompose le contenu NON
// verrouille avec la densite de ce format (formatComposer.js — les pages
// verrouillees a la main dans l'atelier gardent tel quel leur contenu et
// leur layout, voir son en-tete), persiste via bookContentService.
// replaceBookPages (reutilisee sans modification : elle protege deja les
// pages verrouillees) puis met a jour books.print_format/books.page_count —
// ce que "Commander mon livre" imprimera correspond donc toujours a ce qui
// vient d'etre recompose ici. Body : { formatId }.
router.post('/api/books/:bookId/format', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const formatId = req.body?.formatId;
    if (!formatId || !Object.prototype.hasOwnProperty.call(COVER_FORMATS, formatId)) {
      return res.status(400).json({ error: 'Format inconnu.' });
    }

    const [template, items, layouts, existingPages] = await Promise.all([
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts(),
      bookContentService.listPages(book.id)
    ]);

    const { pages: formatPages, pageCount } = composeBookForFormat({ items, existingPages, template, layouts, formatId });

    // Le livre TEL QU'IL SERA IMPRIME, pas seulement ses pages de contenu :
    // une page laissee blanche est une vraie page, imprimee et facturee (voir
    // bookContentService.listPagesForRender). Comparer le seul `pageCount`
    // du moteur refusait a tort un livre compose a la main mais peu dense —
    // devenu frequent depuis que le changement de format ne remplit plus le
    // livre avec du contenu jamais place (2026-09-14, voir formatComposer).
    const pagesImprimees = bookContentService.pageExtent(formatPages, book.page_count);

    // Meme plancher dur que POST /compose (voir son commentaire) — ce chemin
    // n'avait JUSQU'ICI aucune protection : un livre a contenu maigre
    // pouvait changer de format et se retrouver avec moins de pages que le
    // minimum imprimable Gelato, sans le moindre avertissement.
    if (pagesImprimees < layoutEngine.MIN_PRINTABLE_PAGES) {
      return res.status(422).json({
        error: `Il faut atteindre ${layoutEngine.MIN_PRINTABLE_PAGES} pages minimum avec ce format (votre livre en compte ${pagesImprimees}). Ajoutez des pages ou du contenu, puis reessayez.`
      });
    }

    // Plafond symetrique (voir layoutEngine.MAX_PRINTABLE_PAGES / son
    // commentaire dans POST /compose ci-dessus).
    if (pagesImprimees > layoutEngine.MAX_PRINTABLE_PAGES) {
      return res.status(422).json({
        error: `Votre livre compterait ${pagesImprimees} pages avec ce format, au dessus du maximum imprimable (${layoutEngine.MAX_PRINTABLE_PAGES} pages). Retirez des photos ou des souvenirs, puis reessayez.`
      });
    }

    // Annotation qualite recalculee avec le NOUVEAU format (les cadres
    // changent de taille mm, donc les statuts changent) — c'est justement
    // pour ca que le statut stocke n'est jamais la source de verite du
    // verrou avant commande, qui recalcule toujours.
    const annotatedFormatPages = photoQualityEngine.annotatePagesWithPhotoFit({
      pages: formatPages,
      items,
      layouts,
      formatId
    });
    // Le changement de format est precisement le moment ou la qualite TEXTE
    // bouge le plus : les tailles, l'interligne ET la largeur de colonne
    // different reellement d'un format a l'autre (voir typographySystem
    // FORMAT_TYPOGRAPHY), donc un texte qui tenait en Livret peut deborder
    // en Luxe. Reannoter ici, et pas seulement a la composition, est ce qui
    // rend l'avertissement juste apres une bascule de format.
    const annotatedFormatPagesWithText = textQualityEngine.annotatePagesWithTextFit({
      pages: annotatedFormatPages,
      items,
      layouts,
      formatId
    });
    const pages = await bookContentService.replaceBookPages(book.id, annotatedFormatPagesWithText);

    const { error: formatError } = await supabase
      .from('books')
      .update({ print_format: formatId })
      .eq('id', book.id);
    if (formatError) throw formatError;

    // Le nombre de pages passe par l'autorite unique : le `pageCount` calcule
    // par le moteur est une DEMANDE, jamais le dernier mot — des pages
    // verrouillees peuvent survivre a la recomposition et depasser ce compte.
    const realPageCount = await bookContentService.syncPageCount(book.id, pageCount);

    const { data: updatedBook, error: readError } = await supabase
      .from('books').select('*').eq('id', book.id).single();
    if (readError) throw readError;

    res.json({ book: updatedBook, pages, pageCount: realPageCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/books/:bookId/preview.html
// Premier apercu du livre compose, ouvrable directement au navigateur.
// Ne depend d'aucun binaire externe (contrairement au PDF) : c'est le moyen
// le plus rapide de voir le rendu pendant que les ecrans frontend (phase 06)
// ne sont pas encore branches.
router.get('/api/books/:bookId/preview.html', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const [interiorPages, items, layouts, template] = await Promise.all([
      // listPagesForRender, pas listPages : une page laissee vierge n'a pas
      // de ligne en base. L apercu final et le PDF doivent pourtant la montrer,
      // sinon le livre imprime ne compte plus le meme nombre de pages que celui
      // facture (constate 2026-09-14 : 30 pages annoncees, 24 rendues).
      bookContentService.listPagesForRender(req.params.bookId, book.page_count),
      bookContentService.listContentItems(req.params.bookId),
      templateCatalog.listActiveLayouts(),
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null)
    ]);

    // Format d'impression choisi par l'utilisateur (Configuration) : memes
    // dimensions pour la decision (choix/cadrage des photos de couverture,
    // coverComposer.js) et pour le rendu (marges/trim, pageRenderer.js) —
    // jamais deux valeurs qui pourraient diverger.
    const format = resolveRenderFormat(book.print_format);

    // 1ere/4eme de couverture : jamais persistees, toujours recalculees a
    // la volee (voir coverComposer.js) — hors du budget de pages
    // interieures, comme layoutEngine.js le prevoit deja.
    const pages = coverComposer.composeCoversIntoPages({ book, items, template, interiorPages, format });

    const html = pageRenderer.renderBookHtml({ book, pages, items, layouts, format });
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/books/:bookId/cover-preview.html?face=front|back
// Apercu dedie a UNE face de la couverture a la fois (?face=front par
// defaut, ou back), rendue via renderSinglePageHtml — la meme fonction que
// pdfService.js utilise pour la capture PDF page par page (§17 du cahier des
// charges : jamais deux implementations de rendu qui pourraient diverger).
// Contrairement a /preview.html (plusieurs pages empilees, defile), le
// document ici est cale sur width:100vw/height:100vh : quelle que soit la
// taille de la iframe qui l'affiche cote front, la page remplit exactement
// cette taille, sans jamais avoir besoin de defiler — c'est l'ecran de
// personnalisation legere de la couverture qui en a besoin (voir
// BookCoverDesignerLuxe.js).
router.get('/api/books/:bookId/cover-preview.html', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const face = req.query.face === 'back' ? 'back' : 'front';
    const [items, template] = await Promise.all([
      bookContentService.listContentItems(req.params.bookId),
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null)
    ]);

    const format = resolveRenderFormat(book.print_format);
    const pages = coverComposer.composeCoversIntoPages({ book, items, template, interiorPages: [], format });
    const page = face === 'back' ? pages[pages.length - 1] : pages[0];
    const html = pageRenderer.renderSinglePageHtml({ book, page, items, layouts: [], format });
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/books/:bookId/preview.pdf
// Meme rendu, converti en PDF via Chrome/Edge headless. Peut echouer si
// aucun navigateur headless n'est installe sur l'environnement (voir
// pdfService.resolveBrowserPath) : dans ce cas, utiliser preview.html.
router.get('/api/books/:bookId/preview.pdf', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const [interiorPages, items, layouts, template] = await Promise.all([
      // listPagesForRender, pas listPages : une page laissee vierge n'a pas
      // de ligne en base. L apercu final et le PDF doivent pourtant la montrer,
      // sinon le livre imprime ne compte plus le meme nombre de pages que celui
      // facture (constate 2026-09-14 : 30 pages annoncees, 24 rendues).
      bookContentService.listPagesForRender(req.params.bookId, book.page_count),
      bookContentService.listContentItems(req.params.bookId),
      templateCatalog.listActiveLayouts(),
      book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null)
    ]);

    const format = resolveRenderFormat(book.print_format);
    const pages = coverComposer.composeCoversIntoPages({ book, items, template, interiorPages, format });

    const pdfPath = await pdfService.renderPdfFromPages({
      book,
      pages,
      items,
      layouts,
      format,
      fileBaseName: `book-${req.params.bookId}`
    });

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'inline; filename="apercu.pdf"');
    res.sendFile(pdfPath);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

// POST /api/books/:bookId/pages/extend
// Ajoute des pages VIDES a la fin du livre (bouton "+2" du filmstrip
// atelier) — jamais une recomposition, jamais touche aux pages existantes.
// Body optionnel { count } (defaut 2, doit rester pair — meme contrainte de
// palier que le catalogue imprimeur Gelato, voir
// backend/services/printing/gelatoCatalog.js pageStep). Geste EXPLICITE de
// l'utilisateur, distinct du plancher automatique de POST /compose et
// /format ci-dessus (qui bloquent plutot que de padder — voir leurs
// commentaires) : agrandir son livre volontairement n'est pas le "remplissage
// artificiel" que ces routes refusent.
router.post('/api/books/:bookId/pages/extend', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const requestedCount = Number(req.body?.count);
    const count = Number.isInteger(requestedCount) && requestedCount > 0 ? requestedCount : 2;
    if (count % 2 !== 0) {
      return res.status(400).json({ error: 'Le nombre de pages ajoutees doit etre pair.' });
    }

    const pages = await bookContentService.appendEmptyPages(book.id, count, book.page_count);
    const newPageCount = pages.length;

    // Meme autorite unique que partout ailleurs (plancher, parite, couverture
    // des pages reelles) : cette route ne decide pas du compte, elle le
    // DEMANDE.
    await bookContentService.syncPageCount(book.id, newPageCount);
    const { data: updatedBook, error: readError } = await supabase
      .from('books').select('*').eq('id', book.id).single();
    if (readError) throw readError;

    res.json({ book: updatedBook, pages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books/:bookId/pages/shrink
// Retire des pages a la FIN du livre (bouton "-2" du filmstrip atelier) —
// contrepartie exacte de /pages/extend ci-dessus. Body optionnel
// { count, confirm }.
//
// Trois garde-fous, dans cet ordre :
//   1. count pair (meme palier imprimeur que l'ajout) ;
//   2. on ne descend JAMAIS sous le plancher imprimable — sinon le livre
//      deviendrait silencieusement non commandable, et l'utilisateur ne
//      l'apprendrait qu'au moment de commander ;
//   3. une page non vide ou verrouillee ne part pas sans un `confirm: true`
//      explicite : la reponse 409 dit precisement ce qui serait perdu, pour
//      que le client puisse poser la question au lieu de deviner.
router.post('/api/books/:bookId/pages/shrink', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const requestedCount = Number(req.body?.count);
    const count = Number.isInteger(requestedCount) && requestedCount > 0 ? requestedCount : 2;
    if (count % 2 !== 0) {
      return res.status(400).json({ error: 'Le nombre de pages retirees doit etre pair.' });
    }

    const { totalPages, doomed, nonEmpty, locked } = await bookContentService.inspectTrailingPages(book.id, count, book.page_count);

    if (doomed.length < count) {
      return res.status(400).json({ error: 'Ce livre ne contient pas assez de pages pour en retirer autant.' });
    }

    const remaining = totalPages - count;
    if (remaining < layoutEngine.MIN_PRINTABLE_PAGES) {
      return res.status(422).json({
        error: `Impossible de descendre sous ${layoutEngine.MIN_PRINTABLE_PAGES} pages : c'est le minimum imprimable (votre livre en compte ${totalPages}).`
      });
    }

    if ((nonEmpty.length > 0 || locked.length > 0) && req.body?.confirm !== true) {
      return res.status(409).json({
        error: locked.length > 0
          ? 'Les dernieres pages contiennent du contenu ou sont verrouillees.'
          : 'Les dernieres pages contiennent du contenu.',
        needsConfirmation: true,
        nonEmptyCount: nonEmpty.length,
        lockedCount: locked.length,
        // Numeros affiches a l'utilisateur (1-based, comme dans l'atelier),
        // pas des page_index bruts : le message doit pouvoir etre repris tel
        // quel a l'ecran.
        pageNumbers: doomed
          .filter((page) => !bookContentService.isPageEmpty(page) || page?.locked === true)
          .map((page) => page.page_index + 1)
      });
    }

    const pages = await bookContentService.removeTrailingPages(book.id, count, book.page_count);

    // `pages.length` n'est PAS le nombre de pages du livre : une page vide n'a
    // pas de ligne en base. On passe donc le nombre VOULU (remaining) a
    // l'autorite unique, qui refusera de descendre sous le plancher et
    // couvrira toute page reellement presente.
    await bookContentService.syncPageCount(book.id, remaining);
    const { data: updatedBook, error: readError } = await supabase
      .from('books').select('*').eq('id', book.id).single();
    if (readError) throw readError;

    res.json({ book: updatedBook, pages, removed: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books/:bookId/pages/move
// Deplace une page a une autre position (glisser-deposer dans le filmstrip de
// l'atelier). Body { fromIndex, toIndex }.
//
// Ne touche AUCUN contenu : seuls les numeros de page changent. Les
// annotations qualite (photoFit/textFit) ne dependent pas de la position de la
// page dans le livre, il n'y a donc rien a recalculer ici — et surtout rien a
// reecrire dans `content`, ce qui pourrait perdre un ajustement.
//
// Les pages VERROUILLEES se deplacent comme les autres : le verrou protege
// d'une recomposition automatique, pas d'un geste deliberé de l'utilisateur.
router.post('/api/books/:bookId/pages/move', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const fromIndex = Number(req.body?.fromIndex);
    const toIndex = Number(req.body?.toIndex);

    // Le nombre de pages fait foi depuis le LIVRE, pas depuis le nombre de
    // lignes en base : une page jamais remplie n'a pas de ligne, et refuser
    // de deplacer vers elle serait incomprehensible.
    const totalPages = Number(book.page_count) || 0;
    const isValid = (value) => Number.isInteger(value) && value >= 0 && value < totalPages;
    if (!isValid(fromIndex) || !isValid(toIndex)) {
      return res.status(400).json({
        error: `Position invalide : ce livre compte ${totalPages} pages.`
      });
    }

    const pages = await bookContentService.movePage(book.id, fromIndex, toIndex);
    res.json({ pages, fromIndex, toIndex });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/books/:bookId/pages/:pageIndex
// Edition manuelle d'une page (ex. verrouillage) sans repasser par le moteur.
// Utilise aussi par la sauvegarde PARTIELLE de l'atelier (emplacements pas
// tous remplis, voir BookAtelierLuxe.js) : le statut qualite y est donc
// annote comme sur tous les autres chemins d'ecriture (cahier des charges
// v2, §4) — le client n'a jamais a le calculer ni a l'envoyer.
router.put('/api/books/:bookId/pages/:pageIndex', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const pageIndex = Number(req.params.pageIndex);
    // Borne HAUTE indispensable, pas seulement `>= 0` : sans elle, cette route
    // acceptait d'ecrire une page 999 sur un livre de 30 pages, et
    // `books.page_count` restait a 30. C'etait la derniere breche par
    // laquelle le nombre de pages annonce pouvait diverger du livre reel
    // (2026-09-14). La route soeur /manual verifiait deja cette borne.
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= Number(book.page_count || 0)) {
      return res.status(400).json({
        error: `pageIndex invalide : ce livre compte ${Number(book.page_count || 0)} pages.`
      });
    }

    // Legendes bornees ici AUSSI, pas seulement sur la route /manual : cette
    // route generique est le chemin d'une page seulement PARTIELLEMENT
    // remplie (voir compositionApi.updatePageContent), et une legende y
    // arriverait sinon sans aucune limite de longueur.
    const payload = await annotateSinglePagePayload(book, req.body);
    if (payload?.content && typeof payload.content === 'object') {
      const itemIds = (payload.content.itemIds || []).filter(Boolean);
      const captions = sanitizePhotoCaptions(payload.content.photoCaptions, itemIds);
      if (captions) payload.content.photoCaptions = captions;
      else delete payload.content.photoCaptions;
    }
    const data = await bookContentService.upsertPage(req.params.bookId, pageIndex, payload);
    // Un souvenir ecrit DANS un emplacement et qui n'y est plus n'a plus de
    // raison d'exister (voir purgeAbandonedPageTexts). Jamais bloquant.
    await bookContentService.purgeAbandonedPageTexts(req.params.bookId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/books/:bookId/pages/:pageIndex/preview.html
// Apercu d'UNE page interieure a la fois, rendue via renderSinglePageHtml —
// le meme moteur que le PDF final (meme principe que cover-preview.html) :
// c'est ce que l'atelier de creation personnalisee affiche pour chaque page
// de la double-page, qu'elle ait deja ete construite ou soit encore vide.
router.get('/api/books/:bookId/pages/:pageIndex/preview.html', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const pageIndex = Number(req.params.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return res.status(400).json({ error: 'pageIndex invalide.' });
    }

    const [pages, items, layouts] = await Promise.all([
      bookContentService.listPages(book.id),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts()
    ]);

    // Page jamais encore construite (ni automatique ni manuelle) : rendue
    // comme une page vide plutot qu'une 404 — l'atelier a besoin de
    // l'afficher (avec son propre etat "page vide") comme n'importe quelle
    // autre page de la double-page.
    const page = pages.find((entry) => entry.page_index === pageIndex)
      || { page_index: pageIndex, layout_id: null, content: {} };

    const format = resolveRenderFormat(book.print_format);
    const html = pageRenderer.renderSinglePageHtml({ book, page, items, layouts, format });
    res.set('Content-Type', 'text/html; charset=utf-8');
    // JAMAIS de cache HTTP sur un apercu : son contenu depend de l'etat du
    // livre a l'instant de la demande. express pose un ETag par defaut, donc
    // le navigateur revalidait et pouvait recevoir un 304 — c'est-a-dire
    // RESERVIR l'ancien HTML — quand deux rechargements se croisaient.
    // Observe en pilotant l'application apres un deplacement de page
    // (2026-09-13) : "apercu page 1 -> 304" puis "-> 200", et selon celle qui
    // arrivait en dernier, l'ancienne page restait affichee. Un apercu est
    // par nature volatil : il ne doit jamais etre servi depuis un cache.
    res.set('Cache-Control', 'no-store');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/books/:bookId/pages/:pageIndex/manual
// Sauvegarde validee d'une page construite a la main dans l'atelier de
// creation personnalisee — route soeur de PUT /pages/:pageIndex (laissee
// intacte, generique/sans validation) : ici { layoutId, itemIds } est
// verifie (layoutCapacity.isStructurallyCompatible, via
// manualPageBuilder.js) avant sauvegarde, jamais un contenu qui ne
// correspond pas aux emplacements du format choisi. Toujours verrouillee
// (locked=true) a la sauvegarde : une recomposition automatique
// (POST /compose) ne l'ecrasera jamais (voir bookContentService.
// replaceBookPages, mecanisme deja en place).
router.put('/api/books/:bookId/pages/:pageIndex/manual', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const pageIndex = Number(req.params.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return res.status(400).json({ error: 'pageIndex invalide.' });
    }
    if (book.page_count && pageIndex >= book.page_count) {
      return res.status(400).json({ error: "Cette page n'existe pas dans ce livre." });
    }

    const layoutId = req.body?.layoutId;
    const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
    if (!layoutId || itemIds.length === 0) {
      return res.status(400).json({ error: 'Format et contenu requis.' });
    }

    const [layouts, allItems] = await Promise.all([
      templateCatalog.listActiveLayouts(),
      bookContentService.listContentItems(book.id)
    ]);

    const layout = layouts.find((entry) => entry.id === layoutId);
    if (!layout) {
      return res.status(400).json({ error: 'Format introuvable ou inactif.' });
    }

    // Items resolus et scopes a CE livre uniquement (listContentItems ne
    // renvoie que des items de book.id) : un itemId d'un autre livre se
    // resout simplement a `undefined`, filtre par manualPageBuilder comme
    // un contenu manquant — meme securite implicite que le reste des routes
    // de ce fichier, jamais une verification separate a maintenir.
    const itemsById = Object.fromEntries(allItems.map((item) => [item.id, item]));
    const resolvedItems = itemIds.map((id) => itemsById[id]);

    const content = buildManualPageContent({ layout, items: resolvedItems });
    // photoAdjustments (optionnel, cahier des charges "PhotoSlot" 2026-09-10) :
    // ajustement manuel (deplacer/zoomer, voir AtelierPhotoAdjustModal.js)
    // par itemId, attache APRES buildManualPageContent (qui l'ignore —
    // hors de son perimetre de validation structurelle photo/texte).
    const photoAdjustments = sanitizePhotoAdjustments(req.body?.photoAdjustments, itemIds);
    if (photoAdjustments) content.photoAdjustments = photoAdjustments;

    // Legendes par photo (2026-09-14) : memes garanties, meme place dans le
    // content — un reglage attache a l'item, pas au format de la page.
    const photoCaptions = sanitizePhotoCaptions(req.body?.photoCaptions, itemIds);
    if (photoCaptions) content.photoCaptions = photoCaptions;

    // Roles et reglages typographiques (cahier des charges typographique
    // §3/§6), memes garanties que photoAdjustments : jamais d'itemId etranger
    // a cette page, jamais une valeur hors du cadre autorise.
    const textRoles = sanitizeTextRoles(req.body?.textRoles, itemIds);
    if (textRoles) content.textRoles = textRoles;
    const textStyles = sanitizeTextStyles(req.body?.textStyles, itemIds);
    if (textStyles) content.textStyles = textStyles;

    // Statut qualite persiste (cahier des charges v2, §4) — calcule apres
    // photoAdjustments, dont le zoom influence le DPI effectif.
    const [withPhotoFit] = photoQualityEngine.annotatePagesWithPhotoFit({
      pages: [{ content }],
      items: allItems,
      layouts,
      formatId: book.print_format
    });
    // ... et apres textRoles/textStyles, qui changent la taille appliquee
    // donc le verdict de debordement (§19).
    const [annotated] = textQualityEngine.annotatePagesWithTextFit({
      pages: [withPhotoFit],
      items: allItems,
      layouts,
      formatId: book.print_format
    });

    const data = await bookContentService.upsertPage(book.id, pageIndex, {
      layout_id: layout.id,
      content: annotated.content,
      locked: true
    });
    // Meme nettoyage que sur la route generique : un texte sorti de son
    // emplacement (change de mise en page, remplace) ne doit pas rester dans
    // la bibliotheque.
    await bookContentService.purgeAbandonedPageTexts(book.id);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// GET /api/books/:bookId/print-quality-check
// Controle qualite obligatoire avant commande (cahier des charges v2, §2 —
// "ecran recapitulatif") : parcourt TOUTES les pages et renvoie chaque
// photo dont le statut n'est pas 'ok', avec sa vignette et son numero de
// page (necessaires a l'ecran recapitulatif).
//
// RECALCULE toujours, jamais lu depuis content.photoFit : le statut stocke
// depend du format d'impression (les cadres changent de taille en mm), il
// devient faux apres un changement de format. Le champ stocke sert a
// l'agregation rapide et au badge, jamais de source de verite pour le
// verrou final. Jamais bloquant cote serveur : une photo non evaluable
// (jamais sondee, emplacement inconnu) est simplement ignoree.
router.get('/api/books/:bookId/print-quality-check', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const { book } = req;
    const [pages, items, layouts] = await Promise.all([
      bookContentService.listPages(book.id),
      bookContentService.listContentItems(book.id),
      templateCatalog.listActiveLayouts()
    ]);

    const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));

    let photosCount = 0;
    let evaluatedCount = 0;
    let textsCount = 0;
    let textsEvaluatedCount = 0;
    const warnings = [];

    pages.forEach((page) => {
      const blocks = Array.isArray(page.content?.blocks) ? page.content.blocks : [];
      const adjustmentsByItemId = page.content?.photoAdjustments || {};
      blocks.forEach((block) => {
        const slug = layoutsById[block.layoutId]?.slug;
        if (!slug) return;

        (block.itemIds || []).forEach((itemId, slotIndex) => {
          const item = itemId ? itemsById[itemId] : null;
          if (!item) return;

          // --- Textes (cahier des charges typographique §19) ---------------
          // Memes regles que le rendu (typographySystem), donc un texte
          // signale ici est reellement un texte qui pose probleme a
          // l'impression : debordement, taille sous le minimum imprimable,
          // ou contraste insuffisant sur une photo.
          if (item.kind === 'texte') {
            textsCount += 1;
            const textFit = textQualityEngine.checkTextFit({
              text: item.text,
              role: page.content?.textRoles?.[itemId],
              layoutSlug: slug,
              slotIndex,
              formatId: book.print_format,
              overrides: page.content?.textStyles?.[itemId] || {}
            });
            if (!textFit) return; // layout inconnu -> pas evalue, jamais un faux avertissement
            textsEvaluatedCount += 1;
            if (textFit.statut === 'ok') return;

            warnings.push({
              kind: 'texte',
              pageIndex: page.page_index,
              itemId,
              statut: textFit.statut,
              severity: textFit.severity,
              label: textFit.label,
              role: textFit.role,
              sizePt: textFit.sizePt,
              overflowMm: textFit.overflowMm,
              reasons: textFit.reasons,
              // Extrait court : l'ecran recapitulatif doit permettre de
              // reconnaitre DE QUEL texte on parle sans ouvrir la page.
              excerpt: String(item.text || '').trim().slice(0, 90)
            });
            return;
          }

          if (item.kind !== 'photo') return;
          photosCount += 1;

          const fit = photoQualityEngine.checkSlotImageFit({
            item,
            layoutSlug: slug,
            slotIndex,
            formatId: book.print_format,
            zoom: adjustmentsByItemId[itemId]?.zoom
          });
          if (!fit || !fit.statut) return; // donnee manquante -> pas evalue, jamais un faux avertissement
          evaluatedCount += 1;
          if (fit.statut === 'ok') return;

          warnings.push({
            pageIndex: page.page_index,
            itemId,
            statut: fit.statut,
            severity: fit.severity,
            label: fit.label,
            kind: 'photo',
            dpiEffectif: fit.dpiEffectif,
            ecartRatio: fit.ecartRatio,
            // Vignette pour l'ecran recapitulatif (§2) — repli sur
            // l'original si la miniature n'a pas pu etre generee a l'upload.
            thumbnailUrl: item.metadata?.thumbnailUrl || item.url || null
          });
        });
      });
    });

    res.json({
      pagesCount: pages.length,
      photosCount,
      evaluatedCount,
      textsCount,
      textsEvaluatedCount,
      warnings,
      hasWarnings: warnings.length > 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
