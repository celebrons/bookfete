// C:\Users\USER\bookfete\backend\server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://bookfete-front.onrender.com', 'https://bookfete.onrender.com']
    : '*'
}));
app.use(express.json());

// ============================================
// ROUTES - Version mise à jour (sans projects)
// ============================================
const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books'); // À créer si nécessaire
const chapterRoutes = require('./routes/chapters');
const contributionRoutes = require('./routes/contributions');
const inviteRoutes = require('./routes/invites');
const aiRoutes = require('./routes/ai');

// ============================================
// ANCIENNES ROUTES À SUPPRIMER (commentées)
// ============================================
// const projectRoutes = require('./routes/projects'); // ← À SUPPRIMER
// const orderRoutes = require('./routes/orders');     // ← À SUPPRIMER

// ============================================
// ROUTES ACTIVES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/contributions', contributionRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/ai', aiRoutes);

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📝 Routes disponibles:`);
  console.log(`   - /api/auth`);
  console.log(`   - /api/books`);
  console.log(`   - /api/chapters`);
  console.log(`   - /api/contributions`);
  console.log(`   - /api/invites`);
  console.log(`   - /api/ai`);
  console.log(`   - /api/health`);
});