// C:\Users\USER\bookfete\backend\routes\invites.js
const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const authenticate = require('../middleware/auth');

// Routes protégées (pour les organisateurs)
router.post('/chapter', authenticate, inviteController.inviteToChapter);

// Routes publiques (pour les contributeurs)
router.get('/token/:token', inviteController.checkInviteToken);
router.post('/token/:token', inviteController.useInviteToken);

module.exports = router;