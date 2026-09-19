// Regarder un envoi a l'imprimeur se derouler, SANS rien lancer.
//
//   node scripts/observer-envoi.js
//   node scripts/observer-envoi.js --minutes 30
//
// Ecrit le 2026-09-19 : apres une journee ou mes propres tests occupaient la
// machine pendant que l'utilisateur essayait de s'en servir, c'est LUI qui
// lance l'envoi et moi qui regarde.
//
// Ce script est en LECTURE SEULE : il interroge la base toutes les dix
// secondes et n'ecrit nulle part. Il ne cree aucune donnee, ne touche ni au
// serveur ni a Gelato.

require('dotenv').config();
const supabase = require('../config/supabase');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const MINUTES = Number(valeur('--minutes', 40));

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const heure = (iso) => String(iso || '').slice(11, 19);

(async () => {
  const depart = new Date().toISOString();
  console.log(`Observation des envois a l'imprimeur (lecture seule)`);
  console.log(`depuis ${heure(depart)}, pendant ${MINUTES} min\n`);

  const dejaVus = new Set();
  let derniereProgression = '';
  let commandeSuivie = null;
  const echeance = Date.now() + MINUTES * 60 * 1000;

  while (Date.now() < echeance) {
    // 1. Les evenements metier.
    // eslint-disable-next-line no-await-in-loop
    const { data: evenements } = await supabase
      .from('app_events')
      .select('*')
      .gte('created_at', depart)
      .order('created_at', { ascending: true });

    for (const e of (evenements || [])) {
      if (dejaVus.has(e.id)) continue;
      dejaVus.add(e.id);
      const detail = e.metadata ? JSON.stringify(e.metadata).slice(0, 150) : '';
      console.log(`\n${heure(e.created_at)} | ${(e.level || 'info').toUpperCase().padEnd(5)} | ${e.type}`);
      if (e.message) console.log(`         ${e.message}`);
      if (detail && detail !== '{}') console.log(`         ${detail}`);

      if (e.type === 'gelato.submit.started' && e.order_id) commandeSuivie = e.order_id;

      if (e.type === 'gelato.submitted') {
        console.log('\n  >>> ENVOI ABOUTI');
      }
      if (e.type === 'gelato.submit.failed') {
        console.log('\n  >>> ENVOI ECHOUE');
      }
    }

    // 2. L'avancement, lu sur la commande suivie.
    if (commandeSuivie) {
      // eslint-disable-next-line no-await-in-loop
      const { data: commande } = await supabase
        .from('orders').select('status, metadata').eq('id', commandeSuivie).maybeSingle();
      const p = commande?.metadata?.gelatoProgress;
      const ligne = p ? `${p.phase} ${p.done}/${p.total}` : '';
      if (ligne && ligne !== derniereProgression) {
        derniereProgression = ligne;
        process.stdout.write(`\r         avancement : ${ligne}          `);
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await attendre(10000);
  }

  console.log('\n\nFin de l observation.');
  process.exit(0);
})();
