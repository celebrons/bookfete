// backend/test-server.js
const express = require('express');
const cors = require('cors');
const app = express();

// CORS ultra-permissif en premier
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong', ok: true });
});

app.post('/api/invites', (req, res) => {
  console.log('📨 Requête reçue sur /api/invites');
  res.json({ success: true, message: 'Test OK' });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Test server running on http://localhost:${PORT}`);
});