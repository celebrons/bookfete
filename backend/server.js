const express = require('express');
const cors = require('cors');
require('dotenv').config();

const quietStartup = process.env.QUIET_STARTUP !== '0';
if (quietStartup) {
  const originalLog = console.log;
  const suppressedStartupPatterns = [
    'debug routes auth',
    'routes auth enregistr',
    'chargement des routes invitations',
    'fonctions disponibles',
    'routes invitations charg',
    'mode simulation - emails non configur'
  ];

  console.log = (...args) => {
    const message = args.map((value) => String(value || '')).join(' ').toLowerCase();
    if (suppressedStartupPatterns.some((pattern) => message.includes(pattern))) {
      return;
    }
    originalLog(...args);
  };
}

const app = express();
const PORT = process.env.PORT || 5001;

const orderRoutes = require('./routes/orders');
const authRoutes = require('./routes/auth');
const bookCreationRoutes = require('./routes/bookCreation');
const bookRoutes = require('./routes/books');
const chapterRoutes = require('./routes/chapters');
const inviteRoutes = require('./routes/invites');
const compositionRoutes = require('./routes/composition');
const productRoutes = require('./routes/products');
const collectiveRoutes = require('./routes/collective');

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://bookfete-front.onrender.com', 'https://bookfete.onrender.com']
    : '*'
}));

if (typeof orderRoutes.handleStripeWebhook === 'function') {
  app.post(
    '/api/orders/webhook/stripe',
    express.raw({ type: 'application/json' }),
    orderRoutes.handleStripeWebhook
  );
}

app.use(express.json());

app.use('/api/auth', authRoutes);
// Espace d administration (lecture seule) — voir middleware/requireAdmin.js
app.use('/api/admin', require('./routes/admin'));
app.use('/api/books/create', bookCreationRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/orders', orderRoutes);
app.use('/', compositionRoutes);
app.use('/', productRoutes);
app.use('/', collectiveRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Diagnostic d'impression (2026-09-11) : sert a verifier EN LIGNE, sans
// lancer une vraie commande, qu'une instance (Render notamment) est
// reellement capable de produire un fichier d'impression. Les deux causes
// de panne les plus probables en hebergement sont visibles ici : pas de
// navigateur headless installe (donc pas de PDF possible) et cle Gelato
// absente. Aucune donnee sensible n'est exposee : uniquement des booleens
// et le chemin du binaire navigateur.
app.get('/api/health/printing', async (_req, res) => {
  try {
    const pdfService = require('./services/composition/pdfService');
    const browserPath = await pdfService.resolveBrowserPath();
    res.json({
      browserAvailable: Boolean(browserPath),
      browserPath: browserPath || null,
      gelatoConfigured: Boolean(process.env.GELATO_API_KEY),
      gelatoLiveOrders: process.env.GELATO_LIVE_ORDERS === '1',
      ready: Boolean(browserPath) && Boolean(process.env.GELATO_API_KEY),
      // Detail affiche UNIQUEMENT quand le navigateur manque : sur une
      // machine distante, "browserAvailable: false" tout seul ne dit pas si
      // puppeteer est absent, si son Chromium n'a pas ete telecharge, ou
      // s'il se trouve ailleurs que la ou on le cherche. Sans ca, le
      // diagnostic exige un acces au serveur (vecu le 2026-09-12).
      ...(browserPath ? {} : { diagnostic: await pdfService.describeBrowserResolution() })
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`API started on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Startup failed: port ${PORT} is already in use.`);
    process.exit(1);
    return;
  }
  if (error?.code === 'EACCES') {
    console.error(`Startup failed: insufficient permissions for port ${PORT}.`);
    process.exit(1);
    return;
  }
  console.error('Startup failed:', error?.message || error);
  process.exit(1);
});
