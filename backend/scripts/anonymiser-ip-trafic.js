// Anonymise les IP de trafic de plus de 90 jours (voir
// services/analytics/pageViews.js:purgeOldIps) — une IP est une donnee
// personnelle, elle ne doit pas s'accumuler indefiniment. Le reste de la
// visite (chemin, referrer, date) reste utile aux statistiques agregees et
// n'est pas touche.
require('dotenv').config();
const { purgeOldIps } = require('../services/analytics/pageViews');

purgeOldIps({ jours: 90 })
  .then(({ anonymized }) => {
    console.log(`[anonymiser-ip-trafic] ${anonymized} visite(s) anonymisee(s).`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('[anonymiser-ip-trafic] erreur :', error.message);
    process.exit(1);
  });
