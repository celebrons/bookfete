// C:\Users\USER\bookfete\backend\routes\invites.js
const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const authenticate = require('../middleware/auth');

console.log('🔍 Chargement des routes invitations...');
console.log('✅ Fonctions disponibles:', Object.keys(inviteController));

// Routes protégées (pour les organisateurs)
if (inviteController.inviteToChapter) {
  router.post('/chapter', authenticate, inviteController.inviteToChapter);
  console.log('✅ POST /api/invites/chapter');
} else {
  console.log('❌ inviteToChapter manquant');
}

if (inviteController.sendBatchInvites) {
  router.post('/batch', authenticate, inviteController.sendBatchInvites);
  console.log('✅ POST /api/invites/batch');
} else {
  console.log('❌ sendBatchInvites manquant');
}

if (inviteController.getChapterInvites) {
  router.get('/chapter/:chapterId', authenticate, inviteController.getChapterInvites);
  console.log('✅ GET /api/invites/chapter/:chapterId');
} else {
  console.log('❌ getChapterInvites manquant');
}

if (inviteController.resendInvite) {
  router.post('/resend/:inviteId', authenticate, inviteController.resendInvite);
  console.log('✅ POST /api/invites/resend/:inviteId');
} else {
  console.log('❌ resendInvite manquant');
}

if (inviteController.deleteInvite) {
  router.delete('/:inviteId', authenticate, inviteController.deleteInvite);
  console.log('✅ DELETE /api/invites/:inviteId');
} else {
  console.log('❌ deleteInvite manquant');
}

if (inviteController.requestRevision) {
  router.post('/request-revision', authenticate, inviteController.requestRevision);
  console.log('✅ POST /api/invites/request-revision');
} else {
  console.log('❌ requestRevision manquant');
}

// Routes publiques (pour les contributeurs)
if (inviteController.checkInviteToken) {
  router.get('/token/:token', inviteController.checkInviteToken);
  console.log('✅ GET /api/invites/token/:token');
} else {
  console.log('❌ checkInviteToken manquant');
}

if (inviteController.useInviteToken) {
  router.post('/token/:token', inviteController.useInviteToken);
  console.log('✅ POST /api/invites/token/:token');
} else {
  console.log('❌ useInviteToken manquant');
}

// Routes de debug (optionnelles)
if (inviteController.debugSimple) {
  router.get('/debug', inviteController.debugSimple);
  console.log('✅ GET /api/invites/debug');
}

if (inviteController.debugInvites) {
  router.get('/debug/:token', inviteController.debugInvites);
  console.log('✅ GET /api/invites/debug/:token');
}

console.log('✅ Routes invitations chargées');

module.exports = router;
