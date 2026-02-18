// C:\Users\USER\bookfete\backend\routes\projects.js
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const authenticate = require('../middleware/auth');
const upload = require('../middleware/upload');

// Toutes les routes projects nécessitent une authentification
router.use(authenticate);

// Routes principales
router.post('/', upload.single('coverImage'), projectController.createProject);
router.get('/', projectController.getUserProjects);
router.get('/:projectId', projectController.getProjectById);
router.put('/:projectId', projectController.updateProject);
router.delete('/:projectId', projectController.deleteProject);

// Nouvelles routes pour la gestion des contributions
router.post('/:projectId/close', projectController.closeContributions);
router.post('/:projectId/reopen', projectController.reopenContributions);

module.exports = router;