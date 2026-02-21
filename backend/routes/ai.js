// C:\Users\USER\bookfete\backend\routes\ai.js
const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const authenticate = require('../middleware/auth');

// Toutes les routes IA sont protégées
router.use(authenticate);

// Route de test
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Route IA fonctionne',
    user: req.user?.email 
  });
});

// Générer des questions
router.post('/generate-questions', aiController.generateQuestions);

module.exports = router;