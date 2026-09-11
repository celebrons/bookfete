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
    const [annotated] = photoQualityEngine.annotatePagesWithPhotoFit({
      pages: [{ content }],
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

// POST /api/books/:bookId/content-items
router.post('/api/books/:bookId/content-items', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const data = await bookContentService.createContentItem(req.params.bookId, req.body);
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

    const recommendation = layoutEngine.recommendPageCount({ items, template, layouts });
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

    if (!book.template_id) {
      return res.status(422).json({ error: 'Choisissez un template avant de composer le livre.' });
    }
    if (!book.page_count) {
      return res.status(422).json({ error: 'Choisissez un nombre de pages avant de composer le livre.' });
    }

    const [template, layouts, items] = await Promise.all([
      templateCatalog.getTemplateById(book.template_id),
      templateCatalog.listActiveLayouts(),
      bookContentService.listContentItems(book.id)
    ]);

    if (!template) {
      return res.status(422).json({ error: 'Template introuvable ou inactif.' });
    }

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
    if (result.pages.length < layoutEngine.MIN_PRINTABLE_PAGES) {
      return res.status(422).json({
        error: `Il faut ajouter du contenu pour atteindre ${layoutEngine.MIN_PRINTABLE_PAGES} pages minimum (votre contenu actuel remplit environ ${result.pages.length} page${result.pages.length > 1 ? 's' : ''}). Ajoutez des photos ou des souvenirs, puis reessayez.`
      });
    }

    // Plafond symetrique (voir layoutEngine.MAX_PRINTABLE_PAGES) : au-dela,
    // aucun produit imprimable chez Gelato — mieux vaut le signaler ici
    // qu'au moment d'une vraie commande.
    if (result.pages.length > layoutEngine.MAX_PRINTABLE_PAGES) {
      return res.status(422).json({
        error: `Votre contenu remplit environ ${result.pages.length} pages, au dessus du maximum imprimable (${layoutEngine.MAX_PRINTABLE_PAGES} pages). Retirez des photos ou des souvenirs, puis reessayez.`
      });
    }

    // Statut qualite calcule et persiste A L'ECRITURE (cahier des charges
    // v2, §4) — le client ne l'envoie jamais, il ne fait que le lire.
    const annotatedPages = photoQualityEngine.annotatePagesWithPhotoFit({
      pages: result.pages,
      items,
      layouts,
      formatId: book.print_format
    });
    const pages = await bookContentService.replaceBookPages(book.id, annotatedPages);
    res.json({ pages, overflow: result.overflow, underflow: result.underflow, pageBudget: result.pageBudget });
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

    // Meme plancher dur que POST /compose (voir son commentaire) — ce chemin
    // n'avait JUSQU'ICI aucune protection : un livre a contenu maigre
    // pouvait changer de format et se retrouver avec moins de pages que le
    // minimum imprimable Gelato, sans le moindre avertissement.
    if (pageCount < layoutEngine.MIN_PRINTABLE_PAGES) {
      return res.status(422).json({
        error: `Il faut ajouter du contenu pour atteindre ${layoutEngine.MIN_PRINTABLE_PAGES} pages minimum avec ce format (votre contenu actuel remplit environ ${pageCount} page${pageCount > 1 ? 's' : ''}). Ajoutez des photos ou des souvenirs, puis reessayez.`
      });
    }

    // Plafond symetrique (voir layoutEngine.MAX_PRINTABLE_PAGES / son
    // commentaire dans POST /compose ci-dessus).
    if (pageCount > layoutEngine.MAX_PRINTABLE_PAGES) {
      return res.status(422).json({
        error: `Votre contenu remplit environ ${pageCount} pages avec ce format, au dessus du maximum imprimable (${layoutEngine.MAX_PRINTABLE_PAGES} pages). Retirez des photos ou des souvenirs, puis reessayez.`
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
    const pages = await bookContentService.replaceBookPages(book.id, annotatedFormatPages);

    const { data: updatedBook, error: updateError } = await supabase
      .from('books')
      .update({ print_format: formatId, page_count: pageCount })
      .eq('id', book.id)
      .select()
      .single();
    if (updateError) throw updateError;

    res.json({ book: updatedBook, pages, pageCount });
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
      bookContentService.listPages(req.params.bookId),
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
      bookContentService.listPages(req.params.bookId),
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

    const pages = await bookContentService.appendEmptyPages(book.id, count);
    const newPageCount = pages.length;

    const { data: updatedBook, error: updateError } = await supabase
      .from('books')
      .update({ page_count: newPageCount, updated_at: new Date().toISOString() })
      .eq('id', book.id)
      .select()
      .single();
    if (updateError) throw updateError;

    res.json({ book: updatedBook, pages });
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
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return res.status(400).json({ error: 'pageIndex invalide.' });
    }

    const payload = await annotateSinglePagePayload(book, req.body);
    const data = await bookContentService.upsertPage(req.params.bookId, pageIndex, payload);
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

    // Statut qualite persiste (cahier des charges v2, §4) — calcule apres
    // photoAdjustments, dont le zoom influence le DPI effectif.
    const [annotated] = photoQualityEngine.annotatePagesWithPhotoFit({
      pages: [{ content }],
      items: allItems,
      layouts,
      formatId: book.print_format
    });

    const data = await bookContentService.upsertPage(book.id, pageIndex, {
      layout_id: layout.id,
      content: annotated.content,
      locked: true
    });
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
    const warnings = [];

    pages.forEach((page) => {
      const blocks = Array.isArray(page.content?.blocks) ? page.content.blocks : [];
      const adjustmentsByItemId = page.content?.photoAdjustments || {};
      blocks.forEach((block) => {
        const slug = layoutsById[block.layoutId]?.slug;
        if (!slug) return;

        (block.itemIds || []).forEach((itemId, slotIndex) => {
          const item = itemId ? itemsById[itemId] : null;
          if (!item || item.kind !== 'photo') return;
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
      warnings,
      hasWarnings: warnings.length > 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
