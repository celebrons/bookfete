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
// CONFIGURATION CORS - AVEC VOS URLS RENDER
// ============================================
const allowedOrigins = [
  'http://localhost:3000',
  'https://bookfete-front.onrender.com',  // ✅ VOTRE FRONTEND RENDER
  /\.onrender\.com$/  // Accepte tous les sous-domaines onrender.com (optionnel)
];

app.use(cors({
  origin: function(origin, callback) {
    // Permettre les requêtes sans origin (comme Postman ou curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => 
      typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
    )) {
      callback(null, true);
    } else {
      console.log('❌ Origine non autorisée CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  exposedHeaders: ['ngrok-skip-browser-warning'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Middleware pour parser le JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// MIDDLEWARE DE LOGS (optionnel, pour debug)
// ============================================
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.originalUrl} - Origine: ${req.headers.origin || 'inconnue'}`);
  next();
});

// ============================================
// ROUTES PUBLIQUES
// ============================================

// Route de test
app.get('/api/ping', (req, res) => {
  console.log('✅ Ping reçu de:', req.headers.origin || 'origine inconnue');
  res.json({ 
    message: 'pong', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
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
  console.log(`📡 URL Render: https://bookfete.onrender.com`);
  console.log('\n📋 Frontend autorisé:');
  console.log(`   - http://localhost:3000`);
  console.log(`   - https://bookfete-front.onrender.com`);
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