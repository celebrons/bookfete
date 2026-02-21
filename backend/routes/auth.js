// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticate = require('../middleware/auth');

console.log('=== DEBUG ROUTES AUTH ===');
console.log('Routes disponibles:', Object.keys(authController));
console.log('========================');

// ✅ ROUTES PUBLIQUES
router.get('/test', (req, res) => {
  res.json({ message: 'Route auth fonctionne' });
});

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authController.logout);

// ✅ ROUTES PROTÉGÉES
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);

console.log('✅ Routes auth enregistrées:');
console.log('   POST /api/auth/login');
console.log('   POST /api/auth/register');
console.log('   POST /api/auth/logout');
console.log('   GET  /api/auth/profile');
console.log('   PUT  /api/auth/profile');

module.exports = router;