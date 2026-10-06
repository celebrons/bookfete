// backend/routes/analytics.js
//
// Suivi de trafic minimal, public et sans authentification (un visiteur
// n'est jamais connecte quand il arrive sur une page marketing) — voir
// services/analytics/pageViews.js pour ce qui est reellement stocke.

const express = require('express');
const router = express.Router();
const { recordPageView } = require('../services/analytics/pageViews');

// POST /api/analytics/pageview
// Jamais bloquant pour le visiteur : repond vite, quoi qu'il arrive.
// Deja couvert par le limiteur general pose sur /api (voir server.js).
router.post('/api/analytics/pageview', (req, res) => {
  recordPageView({ path: req.body?.path, referrer: req.body?.referrer }).catch(() => {});
  res.status(204).end();
});

module.exports = router;
