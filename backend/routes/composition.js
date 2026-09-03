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

// Bucket Supabase Storage reutilise (deja utilise par le parcours contributeur
// cote client). Un bucket dedie pourra etre introduit plus tard sans impact
// sur le modele de donnees : seul ce nom change.
const PHOTO_BUCKET = 'contribution-photos';

async function getBook(bookId) {
  const { data, error } = await supabase
    .from('books')
    .select('id, owner_id, title, template_id, page_count')
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
  upload.single('photo'),
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
    const result = layoutEngine.compose({
      items,
      template,
      layouts,
      pageCount: book.page_count,
      variant
    });

    const pages = await bookContentService.replaceBookPages(book.id, result.pages);
    res.json({ pages, overflow: result.overflow, underflow: result.underflow, pageBudget: result.pageBudget });
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
    const [pages, items, layouts] = await Promise.all([
      bookContentService.listPages(req.params.bookId),
      bookContentService.listContentItems(req.params.bookId),
      templateCatalog.listActiveLayouts()
    ]);

    const html = pageRenderer.renderBookHtml({ book: req.book, pages, items, layouts });
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
    const [pages, items, layouts] = await Promise.all([
      bookContentService.listPages(req.params.bookId),
      bookContentService.listContentItems(req.params.bookId),
      templateCatalog.listActiveLayouts()
    ]);

    const pdfPath = await pdfService.renderPdfFromPages({
      book: req.book,
      pages,
      items,
      layouts,
      fileBaseName: `book-${req.params.bookId}`
    });

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'inline; filename="apercu.pdf"');
    res.sendFile(pdfPath);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

// PUT /api/books/:bookId/pages/:pageIndex
// Edition manuelle d'une page (ex. verrouillage) sans repasser par le moteur.
router.put('/api/books/:bookId/pages/:pageIndex', authenticate, requireOwnedBook, async (req, res) => {
  try {
    const pageIndex = Number(req.params.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return res.status(400).json({ error: 'pageIndex invalide.' });
    }

    const data = await bookContentService.upsertPage(req.params.bookId, pageIndex, req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
