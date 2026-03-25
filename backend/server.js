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
const aiRoutes = require('./routes/ai');

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
app.use('/api/books/create', bookCreationRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/orders', orderRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
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
