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
const templateCatalog = require('../services/composition/templateCatalog');
const bookContentService = require('../services/composition/bookContentService');
const layoutEngine = require('../services/composition/layoutEngine');

async function getBook(bookId) {
  const { data, error } = await supabase
    .from('books')
    .select('id, owner_id, template_id, page_count')
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
    res.json({ pages, overflow: result.overflow, pageBudget: result.pageBudget });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
