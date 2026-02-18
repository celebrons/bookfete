// backend/routes/contributions.js
const express = require('express');
const router = express.Router();
const contributionController = require('../controllers/contributionController');
const authenticate = require('../middleware/auth');
const upload = require('../middleware/upload');

// Routes publiques (avec lien magique)
router.get('/:token', contributionController.getContributionPage);
router.get('/:token/edit', contributionController.getContributionForEdit);
router.post('/:token', upload.array('photos', 5), contributionController.submitContribution);
router.put('/:token', upload.array('photos', 5), contributionController.updateContribution);
router.delete('/:token/photo', contributionController.deletePhoto);

// Routes protégées (nécessitent authentification)
router.get('/project/:projectId', authenticate, contributionController.getProjectContributions);
router.delete('/:contributionId', authenticate, contributionController.deleteContribution);

// Route de test
router.get('/test', (req, res) => {
  res.json({ message: 'Route /api/contribute fonctionne !' });
});

module.exports = router;