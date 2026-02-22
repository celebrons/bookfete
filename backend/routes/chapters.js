// backend/routes/chapters.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');

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
router.post('/', authenticate, async (req, res) => {
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
router.put('/:id', authenticate, async (req, res) => {
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
router.delete('/:id', authenticate, async (req, res) => {
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