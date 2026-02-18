// C:\Users\USER\bookfete\backend\server.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();

// Import des routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const inviteRoutes = require('./routes/invites');
const contributionRoutes = require('./routes/contributions');
const orderRoutes = require('./routes/orders');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// CONFIGURATION CORS ULTRA-PERMISSIVE
// ============================================
app.use(cors({
  origin: '*',  // Accepte TOUTES les origines (localhost, ngrok, etc.)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));

// Middleware pour parser le JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// ROUTES PUBLIQUES
// ============================================

// Route de test
app.get('/api/ping', (req, res) => {
  console.log('✅ Ping reçu de:', req.headers.origin || 'origine inconnue');
  res.json({ 
    message: 'pong', 
    timestamp: new Date().toISOString()
  });
});

// Route pour lister toutes les routes disponibles
app.get('/api/routes', (req, res) => {
  res.json({
    routes: [
      '/api/ping',
      '/api/auth/test',
      '/api/auth/profile',
      '/api/projects',
      '/api/invites',
      '/api/contribute/:token',
      '/api/orders/generate/:projectId'
    ]
  });
});

// ============================================
// ROUTES PROTÉGÉES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/contribute', contributionRoutes);
app.use('/api/orders', orderRoutes);

// ============================================
// GESTION DES ERREURS 404
// ============================================
app.use('*', (req, res) => {
  console.log(`❌ Route non trouvée: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route non trouvée',
    method: req.method,
    path: req.originalUrl
  });
});

// ============================================
// GESTION DES ERREURS GLOBALES
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err.stack);
  res.status(500).json({ 
    error: 'Erreur serveur interne',
    message: err.message 
  });
});

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('✅ SERVEUR DÉMARRÉ AVEC SUCCÈS');
  console.log('='.repeat(60));
  console.log(`📡 URL locale: http://localhost:${PORT}`);
  console.log('\n📋 Routes configurées:');
  console.log(`   - GET  /api/ping`);
  console.log(`   - GET  /api/routes`);
  console.log(`   - GET  /api/auth/test`);
  console.log(`   - POST /api/auth/profile`);
  console.log(`   - POST /api/projects`);
  console.log(`   - POST /api/invites`);
  console.log(`   - GET  /api/contribute/:token`);
  console.log(`   - POST /api/orders/generate/:projectId`);
  console.log('='.repeat(60) + '\n');
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur...');
  server.close(() => {
    console.log('✅ Serveur arrêté');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Arrêt du serveur...');
  server.close(() => {
    console.log('✅ Serveur arrêté');
    process.exit(0);
  });
});

module.exports = app;