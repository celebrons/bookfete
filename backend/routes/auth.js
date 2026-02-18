const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticate = require('../middleware/auth');

// 🔍 AJOUTEZ CES LIGNES DE DEBUG
console.log('=== DEBUG ROUTES AUTH ===');
console.log('authController:', authController);
console.log('authController.getProfile:', authController.getProfile);
console.log('authController.updateProfile:', authController.updateProfile);
console.log('========================');

// Route de test
router.get('/test', (req, res) => {
  res.json({ message: 'Route auth fonctionne' });
});

// ✅ VERSION AVEC VÉRIFICATION
if (typeof authController.getProfile === 'function') {
  router.get('/profile', authenticate, authController.getProfile);
} else {
  console.error('❌ ERREUR: authController.getProfile n\'est pas une fonction!');
}

if (typeof authController.updateProfile === 'function') {
  router.put('/profile', authenticate, authController.updateProfile);
} else {
  console.error('❌ ERREUR: authController.updateProfile n\'est pas une fonction!');
}

module.exports = router;