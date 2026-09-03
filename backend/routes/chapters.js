// backend/routes/chapters.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');

async function getBookOwnerId(bookId) {
  const { data, error } = await supabase
    .from('books')
    .select('owner_id')
    .eq('id', bookId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.owner_id;
}

async function getChapterBookId(chapterId) {
  const { data, error } = await supabase
    .from('chapters')
    .select('book_id')
    .eq('id', chapterId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.book_id;
}

// Verifie que le livre du body appartient a l'utilisateur authentifie.
async function requireOwnedBookFromBody(req, res, next) {
  const bookId = req.body?.book_id;
  if (!bookId) {
    return res.status(400).json({ error: 'book_id requis.' });
  }

  const ownerId = await getBookOwnerId(bookId);
  if (!ownerId) {
    return res.status(404).json({ error: 'Livre introuvable.' });
  }

  if (ownerId !== req.user.id) {
    return res.status(403).json({ error: 'Acces refuse.' });
  }

  return next();
}

// Verifie que le chapitre cible appartient (via son livre) a l'utilisateur authentifie.
async function requireOwnedChapter(req, res, next) {
  const bookId = await getChapterBookId(req.params.id);
  if (!bookId) {
    return res.status(404).json({ error: 'Chapitre introuvable.' });
  }

  const ownerId = await getBookOwnerId(bookId);
  if (!ownerId || ownerId !== req.user.id) {
    return res.status(403).json({ error: 'Acces refuse.' });
  }

  return next();
}

// GET /api/chapters/book/:bookId - Récupérer les chapitres d'un livre
router.get('/book/:bookId', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chapters')
      .select(`
        *,
        contributions:contributions(count)
      `)
      .eq('book_id', req.params.bookId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chapters - Créer un chapitre
router.post('/', authenticate, requireOwnedBookFromBody, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chapters')
      .insert([req.body])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/chapters/:id - Mettre à jour un chapitre
router.put('/:id', authenticate, requireOwnedChapter, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chapters')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/chapters/:id - Supprimer un chapitre
router.delete('/:id', authenticate, requireOwnedChapter, async (req, res) => {
  try {
    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
