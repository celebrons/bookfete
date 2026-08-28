const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const authenticate = require('../middleware/auth');

router.post('/chapter', authenticate, inviteController.inviteToChapter);
router.post('/batch', authenticate, inviteController.sendBatchInvites);
router.get('/chapter/:chapterId', authenticate, inviteController.getChapterInvites);
router.post('/resend/:inviteId', authenticate, inviteController.resendInvite);
router.delete('/:inviteId', authenticate, inviteController.deleteInvite);
router.post('/request-revision', authenticate, inviteController.requestRevision);

router.get('/token/:token', inviteController.checkInviteToken);
router.post('/token/:token', inviteController.useInviteToken);

module.exports = router;
