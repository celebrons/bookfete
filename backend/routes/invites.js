const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const authenticate = require('../middleware/auth');

// Middleware d'authentification pour toutes les routes
router.use(authenticate);

// Routes principales
router.post('/', inviteController.inviteContributors);
router.get('/project/:projectId', inviteController.getProjectInvites);
router.get('/project/:projectId/stats', inviteController.getInviteStats);
router.post('/:inviteId/resend', inviteController.resendInvite);
router.delete('/:inviteId', inviteController.deleteInvite);

// Route de test
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Route /api/invites fonctionne !',
    user: req.user?.email,
    userId: req.user?.id
  });
});

module.exports = router;