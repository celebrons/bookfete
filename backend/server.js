const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { logEvent } = require('./services/events/eventLog');
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

// DERRIERE UN PROXY ?
//
// Quand un serveur web (Caddy, le routeur de Render) se place devant
// l'application, toutes les requetes lui arrivent de 127.0.0.1 : la vraie
// adresse du visiteur est dans X-Forwarded-For. Sans ce reglage, la
// limitation de debit compte donc TOUT LE MONDE dans le meme seau — un
// seul visiteur un peu actif bloquerait tous les autres — et
// express-rate-limit leve ERR_ERL_UNEXPECTED_X_FORWARDED_FOR (constate le
// 2026-09-18 sur Scaleway, derriere Caddy).
//
// Volontairement DESACTIVE par defaut : faire confiance a cet en-tete sans
// proxy devant permettrait a n'importe qui de l'inventer et de contourner
// la limitation. TRUST_PROXY vaut le nombre de proxys traverses (1 dans
// notre cas), et ne doit etre pose que la ou il y en a vraiment un.
const proxysDeConfiance = Number(process.env.TRUST_PROXY);
app.set(
  'trust proxy',
  Number.isInteger(proxysDeConfiance) && proxysDeConfiance > 0 ? proxysDeConfiance : false
);

// ORIGINES AUTORISEES.
//
// La liste etait ecrite en dur sur les deux adresses Render : tout autre
// hebergement etait refuse par le navigateur sans moyen de le configurer
// (rencontre le 2026-09-18 en montant un second environnement). Elle se
// regle desormais par ALLOWED_ORIGINS, une liste separee par des virgules.
//
// Les deux adresses Render restent le defaut : sans variable, le
// comportement en production ne change pas d'un iota.
const ORIGINES_PAR_DEFAUT = [
  'https://bookfete-front.onrender.com',
  'https://bookfete.onrender.com'
];
const originesAutorisees = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (originesAutorisees.length > 0 ? originesAutorisees : ORIGINES_PAR_DEFAUT)
    : '*'
}));

if (typeof orderRoutes.handleStripeWebhook === 'function') {
  app.post(
    '/api/orders/webhook/stripe',
    express.raw({ type: 'application/json' }),
    orderRoutes.handleStripeWebhook
  );
}

// EN-TETES DE SECURITE.
//
// `contentSecurityPolicy: false` : la politique par defaut de helmet
// bloquerait les polices Google que le rendu charge, et les images servies
// depuis Supabase. Une politique adaptee est a ecrire le jour ou le site
// sera servi par ce meme processus en production ; d'ici la, mieux vaut la
// desactiver franchement que la laisser casser le rendu en silence.
//
// `crossOriginResourcePolicy: false` : le site et l'API sont sur deux
// origines differentes sur Render.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(express.json());

// LIMITATION DE DEBIT.
//
// L'API n'avait aucune protection : n'importe qui pouvait marteler les
// routes, y compris celle qui declenche un rendu PDF — 2 minutes de calcul
// et ~850 Mo de memoire sur une machine qui en a 2 Go. Quelques appels
// simultanes suffisaient a la faire tomber.
//
// Deux limites, parce que toutes les routes ne coutent pas la meme chose :
// une generale, large, qui ne genera jamais un usage normal ; une seconde
// bien plus stricte sur ce qui lance un rendu.
const limiteGenerale = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes. Reessayez dans une minute.' }
});

// Un rendu dure plusieurs minutes : au-dela de quelques demandes par quart
// d'heure, c'est un abus ou une boucle, jamais un client qui compose son
// livre.
const limiteRendu = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de generations demandees. Attendez quelques minutes.' }
});

// Applique AVANT les routes, sinon il ne protegerait rien.
app.use('/api', limiteGenerale);
app.use('/api/books/:id/export-final-pdf', limiteRendu);
app.use('/api/orders/:orderId/gelato-test', limiteRendu);

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

// SERVIR LE SITE depuis ce meme serveur.
//
// Sur Render, le site et l'API sont deux services distincts : ce serveur ne
// sert que l'API et n'a jamais eu a s'en occuper. Sur une machine unique
// (Scaleway, 2026-09-18), il n'y a qu'un processus — il doit donc aussi
// rendre les fichiers du site, sinon il ne reste que des routes /api et
// aucune page a ouvrir dans un navigateur.
//
// DELIBEREMENT conditionne a SERVE_FRONTEND=1, et non active des que le
// dossier existe : le repli SPA ci-dessous repond a TOUTES les URL
// inconnues. Sur Render, ou un autre service sert deja le site, l'activer
// sans le vouloir transformerait les 404 en pages HTML — un changement de
// comportement en production qu'on ne veut pas provoquer par accident.
const SERVIR_LE_SITE = process.env.SERVE_FRONTEND === '1';
const DOSSIER_SITE = path.join(__dirname, '..', 'frontend', 'build');

if (SERVIR_LE_SITE && fs.existsSync(path.join(DOSSIER_SITE, 'index.html'))) {
  app.use(express.static(DOSSIER_SITE));

  // Repli SPA : les routes du site (/book/xxx/atelier...) n'existent que
  // dans le navigateur. Toute URL qui n'est ni un fichier ni une route /api
  // doit donc renvoyer index.html, a charge du routeur React de s'y
  // retrouver. Les routes /api gardent leur 404 en JSON.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(DOSSIER_SITE, 'index.html'));
  });
} else if (SERVIR_LE_SITE) {
  console.warn('SERVE_FRONTEND=1 mais frontend/build est introuvable : seule l API est servie.');
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, _next) => {
  console.error('Server error:', err);

  // Une erreur non rattrapee finissait uniquement dans les journaux du
  // serveur — invisibles depuis Render, et introuvables sans SSH sur
  // Scaleway. Elle rejoint desormais le journal des evenements, consultable
  // depuis l espace d administration sur les trois environnements.
  logEvent({
    type: 'server.error',
    level: 'error',
    actor: req?.user?.email,
    message: err.message,
    metadata: {
      route: req?.originalUrl,
      methode: req?.method,
      pile: String(err.stack || '').split(String.fromCharCode(10)).slice(0, 3).join(' | ')
    }
  });

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
