// backend/scripts/check-admin-flow.js
//
// Verifie l'espace d'administration contre le vrai backend et la vraie base.
// Cree un compte de test, l'utilise, puis le supprime — y compris en cas
// d'erreur.
//
// Le backend doit tourner AVEC l'email de test dans ADMIN_EMAILS :
//   ADMIN_EMAILS=<email> node server.js
// L'email est affiche au demarrage du script si on le lance sans argument.

require('dotenv').config();
const supabase = require('../config/supabase');
const { createClient } = require('@supabase/supabase-js');

const API = 'http://localhost:5000/api';
const EMAIL = process.argv[2] || 'admin-test@celebrons.local';
const PASSWORD = 'MotDePasseAdmin123!';

const ok = (label, condition, detail = '') => {
  console.log(`${condition ? '  OK  ' : ' ECHEC'}  ${label}${detail ? '  -> ' + detail : ''}`);
  return condition;
};

(async () => {
  let userId = null;
  try {
    // Compte de test (supprime a la fin).
    const existing = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const already = (existing.data?.users || []).find((u) => u.email === EMAIL);
    if (already) {
      userId = already.id;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: EMAIL, password: PASSWORD, email_confirm: true
      });
      if (error) throw new Error('creation du compte de test : ' + error.message);
      userId = data.user.id;
    }

    // Le backend n'a que la cle service-role : la cle publique vit cote
    // frontend. On la lit la-bas pour ouvrir une VRAIE session utilisateur,
    // comme le ferait le navigateur — un jeton service-role ne prouverait
    // rien du parcours reel.
    require('dotenv').config({ path: '../frontend/.env' });
    const client = createClient(
      process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
      process.env.REACT_APP_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
    const { data: signed, error: signErr } = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signErr) throw new Error('connexion : ' + signErr.message);
    const headers = { Authorization: `Bearer ${signed.session.access_token}` };

    const me = await (await fetch(`${API}/admin/me`, { headers })).json();
    if (!ok('reconnu comme administrateur', me.isAdmin === true, JSON.stringify(me))) {
      console.log('\n  -> Relancez le backend avec : ADMIN_EMAILS=' + EMAIL);
      return;
    }

    const res = await fetch(`${API}/admin/books`, { headers });
    const list = await res.json();
    ok('liste des livres accessible', res.status === 200, `HTTP ${res.status}`);
    ok('tous les livres sont renvoyes', (list.books || []).length === list.total, `${list.total} livre(s)`);

    console.log('\n  Livres vus par l administration :');
    for (const book of list.books || []) {
      const who = book.owner.anonymous ? 'sans compte' : (book.owner.email || 'email inconnu');
      console.log(`    - ${(book.title || 'Sans titre').padEnd(24)} | ${book.lifecycleLabel.padEnd(22)} | ${who}`);
      console.log(`      ${book.counts.photos} photos, ${book.counts.texts} textes, ${book.counts.pages} pages, ${book.counts.orders} commande(s)`);
    }

    const first = (list.books || [])[0];
    if (first) {
      const preview = await fetch(`${API}/admin/books/${first.id}/preview.html`, { headers });
      const html = await preview.text();
      ok('consultation du livre (rendu HTML complet)', preview.status === 200 && html.includes('<!doctype html>'),
        `${Math.round(html.length / 1024)} Ko`);
    }

    const search = await (await fetch(`${API}/admin/books?search=zzzintrouvable`, { headers })).json();
    ok('la recherche filtre bien', (search.books || []).length === 0);
  } catch (error) {
    console.log('\n  INTERROMPU :', error.message);
  } finally {
    if (userId) {
      await supabase.from('profiles').delete().eq('id', userId);
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      console.log('\n  compte de test supprime');
    }
  }
})();
