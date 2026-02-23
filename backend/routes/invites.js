// C:\Users\USER\bookfete\backend\routes\invites.js
const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const authenticate = require('../middleware/auth');

console.log('🔍 Chargement des routes invitations...');

// Routes protégées (pour les organisateurs)
router.post('/chapter', authenticate, inviteController.inviteToChapter);
router.post('/batch', authenticate, inviteController.sendBatchInvites);
router.get('/chapter/:chapterId', authenticate, inviteController.getChapterInvites);
router.post('/resend/:inviteId', authenticate, inviteController.resendInvite);
router.delete('/:inviteId', authenticate, inviteController.deleteInvite);

// Routes publiques (pour les contributeurs)
router.get('/token/:token', inviteController.checkInviteToken);
router.post('/token/:token', inviteController.useInviteToken);

// Routes de debug
router.get('/debug', inviteController.debugSimple);
router.get('/debug/:token', inviteController.debugInvites);

console.log('✅ Routes invitations enregistrées:');
console.log('   POST /api/invites/chapter');
console.log('   POST /api/invites/batch');
console.log('   GET  /api/invites/chapter/:chapterId');
console.log('   POST /api/invites/resend/:inviteId');
console.log('   DELETE /api/invites/:inviteId');
console.log('   GET  /api/invites/token/:token');
console.log('   POST /api/invites/token/:token');
console.log('   GET  /api/invites/debug');
console.log('   GET  /api/invites/debug/:token');

module.exports = router;