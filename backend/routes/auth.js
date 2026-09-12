const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const anonymousController = require('../controllers/anonymousController');
const authenticate = require('../middleware/auth');

router.get('/test', (_req, res) => {
  res.json({ message: 'Route auth fonctionne' });
});

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);

// Demarrage sans compte (voir controllers/anonymousController.js) : deux
// moments seulement demandent le serveur — creer le profil apres conversion,
// et rattacher les livres a un compte deja existant.
router.post('/anonymous/complete', authenticate, anonymousController.completeAnonymousSignup);
router.post('/anonymous/link', authenticate, anonymousController.linkAnonymousBooks);

module.exports = router;
