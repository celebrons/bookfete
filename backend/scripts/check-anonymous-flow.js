// backend/scripts/check-anonymous-flow.js
//
// Verifie le parcours COMPLET du demarrage sans compte contre le vrai
// backend et la vraie base (jamais des mocks) : session anonyme -> creation
// du livre -> refus de commande -> rattachement a un compte existant ->
// commande autorisee. Cree des donnees de test et les supprime toutes a la
// fin, y compris en cas d erreur.
//
// Necessite que le backend tourne. Par defaut localhost:5000 ; sur le
// serveur de test : CHECK_API_URL=http://127.0.0.1:5000/api
// Parcours COMPLET du demarrage sans compte, contre le vrai backend et la
// vraie base — pas des mocks. Nettoie tout ce qu'il cree.
// Chemins RELATIFS au script, jamais absolus : ecrit avant l'existence du
// serveur de test, ce script portait deux chemins Windows en dur et ne
// pouvait donc tourner que sur un seul poste. Il s'interrompait ailleurs sur
// « supabaseUrl is required » — c'est-a-dire qu'il ne verifiait plus rien la
// ou on en avait le plus besoin (constate le 2026-09-20).
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });
const { createClient } = require('@supabase/supabase-js');

// Le backend a verifier : celui qui tourne sur cette machine par defaut,
// ou celui qu'on lui designe.
const API = (process.env.CHECK_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
// La cle PUBLIQUE (celle du navigateur) : normalement dans frontend/.env,
// absent du serveur de deploiement. On accepte donc aussi les variables
// d'environnement, pour pouvoir lancer ce controle depuis n'importe ou.
const urlSupabase = () => process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const cleAnon = () => process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const anonClient = () => {
  if (!urlSupabase() || !cleAnon()) {
    throw new Error(
      'Cle publique introuvable. Lancez depuis un poste ayant frontend/.env, '
      + 'ou fournissez SUPABASE_URL et SUPABASE_ANON_KEY.'
    );
  }
  return createClient(urlSupabase(), cleAnon(), { auth: { persistSession: false } });
};

// Client service-role (backend) pour verifier en base et faire le menage.
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const admin = require('../config/supabase');

const call = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
};

const ok = (label, condition, detail = '') => {
  console.log(`${condition ? '  OK  ' : ' ECHEC'}  ${label}${detail ? '  -> ' + detail : ''}`);
  return condition;
};

(async () => {
  const created = { anonId: null, realId: null, bookId: null };

  try {
    // --- 1. Session anonyme --------------------------------------------
    const sb = anonClient();
    const { data: anon, error: anonErr } = await sb.auth.signInAnonymously();
    if (anonErr) throw new Error('connexion anonyme : ' + anonErr.message);
    created.anonId = anon.user.id;
    const anonToken = anon.session.access_token;
    ok('session anonyme ouverte', anon.user.is_anonymous === true);

    // --- 2. Creation du livre SANS compte -------------------------------
    const book = await call('/books', {
      token: anonToken,
      method: 'POST',
      body: { title: 'Livre sans compte (test)', collection_mode: 'solo', page_count: 30 }
    });
    created.bookId = book.payload?.id || book.payload?.book?.id;
    ok('livre cree sans compte', book.status === 201 || book.status === 200, `HTTP ${book.status}`);

    const { data: rows } = await admin.from('books').select('id,owner_id').eq('id', created.bookId);
    ok('livre bien rattache au compte anonyme', rows?.[0]?.owner_id === created.anonId);

    // --- 3. La commande doit etre REFUSEE --------------------------------
    const order = await call('/orders', {
      token: anonToken,
      method: 'POST',
      body: { bookId: created.bookId, type: 'pdf', quantity: 1 }
    });
    ok('commande refusee tant qu il n y a pas de compte', order.status === 403, `HTTP ${order.status}`);
    ok('  ... avec le drapeau requiresAccount', order.payload?.requiresAccount === true);

    // --- 4. Rattachement a un compte EXISTANT ----------------------------
    const email = `e2e-anonyme-${Date.now()}@test.local`;
    const { data: realUser, error: realErr } = await admin.auth.admin.createUser({
      email, password: 'MotDePasse123!', email_confirm: true
    });
    if (realErr) throw new Error('creation compte reel : ' + realErr.message);
    created.realId = realUser.user.id;

    const sb2 = anonClient();
    const { data: signed, error: signErr } = await sb2.auth.signInWithPassword({ email, password: 'MotDePasse123!' });
    if (signErr) throw new Error('connexion compte reel : ' + signErr.message);

    const link = await call('/auth/anonymous/link', {
      token: signed.session.access_token,
      method: 'POST',
      body: { anonymousToken: anonToken }
    });
    ok('livre transfere au compte reel', link.payload?.transferred === 1, JSON.stringify(link.payload));

    const { data: after } = await admin.from('books').select('owner_id').eq('id', created.bookId);
    ok('proprietaire mis a jour en base', after?.[0]?.owner_id === created.realId);

    // --- 5. Refus : un jeton NON anonyme ne transfere rien ---------------
    const abuse = await call('/auth/anonymous/link', {
      token: signed.session.access_token,
      method: 'POST',
      body: { anonymousToken: signed.session.access_token }
    });
    ok('un jeton non anonyme ne transfere rien', abuse.payload?.transferred === 0);

    // --- 6. La commande passe maintenant --------------------------------
    const order2 = await call('/orders', {
      token: signed.session.access_token,
      method: 'POST',
      body: { bookId: created.bookId, type: 'pdf', quantity: 1 }
    });
    // 400 attendu (livre non finalise) — l important est que ce ne soit PLUS
    // le refus "compte requis".
    ok('compte reel : plus de refus pour absence de compte', order2.status !== 403, `HTTP ${order2.status} — ${order2.payload?.error || ''}`);
  } catch (error) {
    console.log('\n  INTERROMPU :', error.message);
  } finally {
    console.log('\n--- menage ---');
    if (created.bookId) {
      await admin.from('book_content_items').delete().eq('book_id', created.bookId);
      await admin.from('book_pages').delete().eq('book_id', created.bookId);
      await admin.from('orders').delete().eq('book_id', created.bookId);
      await admin.from('books').delete().eq('id', created.bookId);
      console.log('  livre de test supprime');
    }
    for (const id of [created.anonId, created.realId].filter(Boolean)) {
      await admin.from('profiles').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    console.log('  comptes de test supprimes');
  }
})();
