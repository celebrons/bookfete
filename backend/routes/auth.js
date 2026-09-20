const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const anonymousController = require('../controllers/anonymousController');
const accountController = require('../controllers/accountController');
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

// Suppression du compte a la demande de son proprietaire. Irreversible :
// voir controllers/accountController.js pour les garde-fous (refus si un
// livre est en fabrication, photos effacees du stockage, compte supprime
// en dernier).
router.delete('/account', authenticate, accountController.supprimerMonCompte);

module.exports = router;
