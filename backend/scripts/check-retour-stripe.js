// Que voit un client qui revient de Stripe apres avoir paye ?
//
//   node scripts/check-retour-stripe.js
//   node scripts/check-retour-stripe.js --url https://78.232.5.181.sslip.io
//
// Le 2026-09-19, un vrai paiement a abouti sur une PAGE BLANCHE : ni message,
// ni erreur, et surtout la commande est restee « awaiting_payment » — le
// paiement n'a jamais ete enregistre, parce que c'est cette page qui le
// confirme au serveur. Le client avait paye pour rien.
//
// Ce script rejoue la scene dans un vrai navigateur : compte jetable, livre
// jetable, commande jetable en attente de paiement, puis l'URL de retour de
// Stripe. Il rapporte ce qui s'affiche et ce qui casse.
//
// Il ne touche a AUCUNE donnee reelle et supprime tout ce qu'il a cree, y
// compris en cas d'echec. Aucun paiement n'est effectue : l'identifiant de
// session Stripe est faux, ce qui suffit — on veut savoir si la PAGE tient,
// pas si Stripe repond.

require('dotenv').config();
const { spawn } = require('child_process');

const supabase = require('../config/supabase');
const pdfService = require('../services/composition/pdfService');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const BASE = String(valeur('--url', 'https://78.232.5.181.sslip.io')).replace(/\/$/, '');
// --modele <id> : recopie la configuration ET le contenu d un livre reel
// dans le livre jetable. En LECTURE SEULE sur l original — indispensable
// quand une page ne casse que pour un livre precis.
const MODELE = valeur('--modele', null);
const MOT_DE_PASSE = `jetable-${Math.random().toString(36).slice(2)}-A1!`;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const check = (cond, msg, detail = '') => {
  if (!cond) echecs += 1;
  console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg + (detail ? `   ${detail}` : ''));
};

// Le navigateur, pilote par CDP — meme protocole que le rendu PDF.
async function ouvrirNavigateur() {
  const chemin = await pdfService.resolveBrowserPath();
  if (!chemin) throw new Error('Aucun navigateur headless disponible.');
  const port = 9700 + Math.floor(Math.random() * 200);
  const child = spawn(chemin, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, '--remote-allow-origins=*'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch (_e) { /* le navigateur n est pas encore la */ }
    // eslint-disable-next-line no-await-in-loop
    await attendre(200);
  }
  const reponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const cible = await reponse.json();

  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  let id = 0;
  const pending = new Map();
  const problemes = [];
  const httpEnErreur = [];

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id !== undefined && pending.has(m.id)) {
      const { resolve } = pending.get(m.id);
      pending.delete(m.id);
      resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params && m.params.exceptionDetails;
      const texte = (d && d.exception && d.exception.description) || (d && d.text) || '?';
      problemes.push('exception : ' + texte.split('\n')[0]);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params && m.params.type === 'error') {
      const texte = (m.params.args || [])
        .map((a) => {
          if (a.value !== undefined) return String(a.value);
          if (a.description) return a.description;
          return '';
        })
        .filter(Boolean)
        .join(' ');
      if (texte) problemes.push('console.error : ' + texte.split('\n')[0].slice(0, 300));
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      httpEnErreur.push(m.params.response.status + ' ' + m.params.response.url);
    }
  });

  const call = (methode, params = {}) => new Promise((resolve) => {
    const n = ++id;
    pending.set(n, { resolve });
    ws.send(JSON.stringify({ id: n, method: methode, params }));
  });

  const evaluer = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : undefined;
  };

  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.enable');

  return {
    evaluer,
    problemes,
    httpEnErreur,
    aller: async (url, ms = 6000) => {
      await call('Page.navigate', { url });
      await attendre(ms);
    },
    fermer: () => {
      try { ws.close(); } catch (_e) { /* deja fermee */ }
      child.kill();
    }
  };
}

// Le livre jetable : neuf par defaut, calque sur un livre reel avec
// --modele. On ne recopie que des COLONNES DE MISE EN FORME, jamais le
// proprietaire ni les jetons de partage.
async function gabaritDuLivre(userId, marque) {
  const base = {
    title: `Livre ${marque}`,
    owner_id: userId,
    page_count: 30,
    print_format: 'standard',
    collection_mode: 'solo'
  };
  if (!MODELE) return base;

  const { data: modele } = await supabase.from('books').select('*').eq('id', MODELE).single();
  if (!modele) throw new Error(`livre modele introuvable : ${MODELE}`);
  return {
    ...base,
    page_count: modele.page_count,
    print_format: modele.print_format,
    template_id: modele.template_id,
    cover_config: modele.cover_config,
    back_cover_config: modele.back_cover_config,
    cover_overrides: modele.cover_overrides,
    page_count_mode: modele.page_count_mode,
    collection_mode: modele.collection_mode
  };
}

// Le contenu : photos et textes, tels quels. Les fichiers eux-memes ne
// bougent pas — seules les lignes qui les referencent sont dupliquees.
async function copierLeContenu(bookId) {
  if (!MODELE) return 0;
  let total = 0;
  for (const table of ['book_content_items', 'book_pages']) {
    // eslint-disable-next-line no-await-in-loop
    const { data: lignes } = await supabase.from(table).select('*').eq('book_id', MODELE);
    if (!lignes || lignes.length === 0) continue;
    const copies = lignes.map((ligne) => {
      const copie = { ...ligne, book_id: bookId };
      delete copie.id;
      delete copie.created_at;
      delete copie.updated_at;
      return copie;
    });
    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase.from(table).insert(copies);
    if (error) throw new Error(`copie de ${table} : ${error.message}`);
    total += copies.length;
  }
  return total;
}

(async () => {
  console.log(`Retour de Stripe sur ${BASE}\n`);

  const marque = `jetable-${Date.now()}`;
  const email = `${marque}@celebrons-test.invalid`;
  let userId = null;
  let bookId = null;
  let orderId = null;
  let navigateur = null;

  try {
    // 1. Un compte, un livre, une commande : tous jetables.
    const { data: cree, error: erreurUser } = await supabase.auth.admin.createUser({
      email, password: MOT_DE_PASSE, email_confirm: true
    });
    if (erreurUser) throw new Error(`compte jetable : ${erreurUser.message}`);
    userId = cree.user.id;

    const { data: livre, error: erreurLivre } = await supabase
      .from('books')
      .insert(await gabaritDuLivre(userId, marque))
      .select('id')
      .single();
    if (erreurLivre) throw new Error(`livre jetable : ${erreurLivre.message}`);
    bookId = livre.id;
    const copiees = await copierLeContenu(bookId);

    const fausseSession = `cs_test_${marque}`;
    const { data: commande, error: erreurCommande } = await supabase
      .from('orders')
      .insert({
        book_id: bookId,
        owner_id: userId,
        type: 'pack',
        status: 'awaiting_payment',
        metadata: {
          pricing: { pages: 30, printFormat: 'standard', pdfUnitCents: 3900, printUnitCents: 7450 },
          stripeCheckoutSessionId: fausseSession,
          stripeCheckoutCreatedAt: new Date().toISOString()
        }
      })
      .select('id')
      .single();
    if (erreurCommande) throw new Error(`commande jetable : ${erreurCommande.message}`);
    orderId = commande.id;

    console.log(`  compte, livre et commande jetables crees (${marque})`);
    console.log(MODELE ? `  contenu recopie depuis ${MODELE} : ${copiees} lignes` : '');

    // 2. Se connecter, comme un client.
    navigateur = await ouvrirNavigateur();
    await navigateur.aller(`${BASE}/login`, 5000);

    const remplir = [
      '(() => {',
      '  const poser = (el, v) => {',
      "    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');",
      '    d.set.call(el, v);',
      "    el.dispatchEvent(new Event('input', { bubbles: true }));",
      '  };',
      `  poser(document.querySelector('input[type="email"]'), ${JSON.stringify(email)});`,
      `  poser(document.querySelector('input[type="password"]'), ${JSON.stringify(MOT_DE_PASSE)});`,
      "  document.querySelector('form.auth-form').requestSubmit();",
      '  return true;',
      '})()'
    ].join('\n');
    await navigateur.evaluer(remplir);
    await attendre(8000);

    const chemin = await navigateur.evaluer('location.pathname');
    check(chemin !== '/login', 'la connexion aboutit', `arrive sur ${chemin}`);

    // 3. LE moment qui a echoue : le retour de Stripe.
    navigateur.problemes.length = 0;
    navigateur.httpEnErreur.length = 0;

    const retour = `${BASE}/book/${bookId}/checkout?payment=success&orderId=${orderId}&session_id=${fausseSession}`;
    await navigateur.aller(retour, 14000);

    const vu = await navigateur.evaluer([
      'JSON.stringify({',
      '  chemin: location.pathname,',
      "  racine: document.getElementById('root') ? document.getElementById('root').innerHTML.length : 0,",
      '  texte: document.body.innerText.trim().slice(0, 400)',
      '})'
    ].join('\n'));
    const page = JSON.parse(vu || '{}');

    console.log('');
    check(page.racine > 0, 'la page affiche quelque chose', `${page.racine} caracteres dans #root`);
    check(
      String(page.texte || '').length > 30,
      'le client lit un message',
      page.texte ? `« ${page.texte.split('\n').slice(0, 3).join(' / ')} »` : '(page vide)'
    );

    if (navigateur.problemes.length) {
      console.log('');
      console.log('  Erreurs JavaScript :');
      navigateur.problemes.slice(0, 6).forEach((p) => console.log(`    ${p}`));
    }
    if (navigateur.httpEnErreur.length) {
      console.log('');
      console.log('  Reponses HTTP en erreur :');
      [...new Set(navigateur.httpEnErreur)].slice(0, 6).forEach((p) => console.log(`    ${p}`));
    }
    check(navigateur.problemes.length === 0, 'aucune erreur JavaScript');

    // 4. La commande a-t-elle bouge ?
    const { data: apres } = await supabase.from('orders').select('status').eq('id', orderId).single();
    console.log('');
    console.log(`  statut de la commande apres le retour : ${apres && apres.status}`);
    console.log('  (une session Stripe inventee ne peut pas etre confirmee : ce qui');
    console.log('   compte ici est que la PAGE tienne et le dise au client)');
  } catch (error) {
    echecs += 1;
    console.log(` ECHEC ${error.message}`);
  } finally {
    if (navigateur) navigateur.fermer();
    // Nettoyage, quoi qu il arrive.
    if (orderId) await supabase.from('orders').delete().eq('id', orderId);
    if (bookId) {
      await supabase.from('book_pages').delete().eq('book_id', bookId);
      await supabase.from('book_content_items').delete().eq('book_id', bookId);
      await supabase.from('books').delete().eq('id', bookId);
    }
    if (userId) await supabase.auth.admin.deleteUser(userId);
    console.log('\n  donnees jetables supprimees');
  }

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
