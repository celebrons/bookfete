// Une connexion par mot de passe empeche-t-elle les AUTRES d'utiliser le site ?
//
//   node scripts/check-contamination-session.js
//   CHECK_API_URL=https://78.232.5.181.sslip.io/api node scripts/check-contamination-session.js
//
// Ecrit le 2026-09-21, apres « new row violates row-level security policy
// for table books ».
//
// Le serveur parle a la base avec une cle de service, qui contourne RLS.
// Mais `signInWithPassword` RETIENT sa session sur le client qui l'appelle :
// lance sur le client partage du backend, il le transformait en client de la
// derniere personne connectee. A partir de la, le serveur agissait au nom de
// cette personne pour TOUT LE MONDE — et plus aucun livre ne pouvait etre
// cree, jusqu'au redemarrage.
//
// Un test unitaire verifie que le code appelle le bon client. Celui-ci
// verifie la CONSEQUENCE, sur le vrai serveur : apres une connexion, un
// inconnu peut-il encore creer son livre ?
//
// Cree deux comptes jetables et les supprime, y compris en cas d'erreur.

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const API = (process.env.CHECK_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

function cleAnonyme() {
  const depuisEnv = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  if (depuisEnv && url) return { url, key: depuisEnv };

  const chemin = path.join(__dirname, '../../frontend/.env');
  if (!fs.existsSync(chemin)) throw new Error('Cle publique introuvable (frontend/.env absent).');
  const contenu = fs.readFileSync(chemin, 'utf8');
  const lire = (c) => (contenu.match(new RegExp(`^${c}=(.*)$`, 'm')) || [])[1]?.trim();
  return { url: lire('REACT_APP_SUPABASE_URL'), key: lire('REACT_APP_SUPABASE_ANON_KEY') };
}

let echecs = 0;
const verifier = (libelle, ok, detail) => {
  console.log(`  ${ok ? 'OK   ' : 'ECHEC'}  ${libelle}${detail ? ` -> ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  const admin = require('../config/supabase');
  const { url, key } = cleAnonyme();

  const suffixe = Math.random().toString(36).slice(2, 8);
  const email = `contamination-${suffixe}@celebrons-test.local`;
  const motDePasse = `Jetable-${suffixe}-A1!`;
  const aSupprimer = [];
  const livresASupprimer = [];

  console.log(`\nContamination de session sur ${API}\n`);

  try {
    // --- 1. Un compte avec mot de passe, et une connexion ------------------
    const { data: cree, error: erreurCreation } = await admin.auth.admin.createUser({
      email, password: motDePasse, email_confirm: true
    });
    if (erreurCreation) throw new Error(`creation du compte : ${erreurCreation.message}`);
    aSupprimer.push(cree.user.id);

    const connexion = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: motDePasse })
    });
    verifier('connexion par mot de passe acceptee', connexion.ok, `HTTP ${connexion.status}`);

    // --- 2. QUELQU'UN D'AUTRE cree son livre -------------------------------
    // C'est ici que tout se jouait : si la connexion precedente a laisse sa
    // session sur le client partage, cette creation est refusee par RLS.
    const anon = createClient(url, key, { auth: { persistSession: false } });
    const { data: visiteur, error: erreurSession } = await anon.auth.signInAnonymously();
    if (erreurSession) throw new Error(`session anonyme : ${erreurSession.message}`);
    aSupprimer.push(visiteur.user.id);

    const creation = await fetch(`${API}/books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${visiteur.session.access_token}`
      },
      body: JSON.stringify({ title: 'Livre apres connexion (test)', collection_mode: 'solo' })
    });
    const corps = await creation.json().catch(() => ({}));
    if (corps?.id) livresASupprimer.push(corps.id);

    verifier(
      'un AUTRE visiteur peut creer son livre apres cette connexion',
      creation.status === 201,
      creation.status === 201 ? 'HTTP 201' : `HTTP ${creation.status} — ${corps?.error || ''}`
    );

    // --- 3. Et le serveur lit-il toujours pour tout le monde ? -------------
    const lecture = await fetch(`${API}/books/${corps?.id}`, {
      headers: { Authorization: `Bearer ${visiteur.session.access_token}` }
    });
    verifier('le livre est relisible par son proprietaire', lecture.ok, `HTTP ${lecture.status}`);
  } finally {
    console.log('\n--- menage ---');
    for (const id of livresASupprimer) {
      // eslint-disable-next-line no-await-in-loop
      await admin.from('books').delete().eq('id', id);
    }
    for (const id of aSupprimer) {
      // eslint-disable-next-line no-await-in-loop
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    console.log('  comptes et livres de test supprimes');
  }

  console.log(`\nRESULTAT : ${echecs === 0 ? 'OK — une connexion ne contamine plus le serveur' : `${echecs} ECHEC(S)`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}\n`);
  process.exit(1);
});
