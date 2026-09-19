// Le site repond-il, page par page, dans un vrai navigateur ?
//
//   node scripts/check-parcours.js
//   node scripts/check-parcours.js --url https://bookfete-front.onrender.com
//
// Ecrit le 2026-09-19 apres « j'ai l'impression que rien ne marche » : des
// boutons muets, des pages blanches, des « failed to fetch ». Impossible de
// repondre a ca par une opinion — il faut ouvrir les pages et regarder.
//
// Le navigateur est NEUF a chaque lancement : aucun cache, aucune session
// d'avant. C'est volontaire, parce que c'est precisement ce qui distingue un
// site casse d'un navigateur resté sur une version perimee du site.
//
// Compte jetable, supprime a la fin. Aucune donnee reelle touchee.

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
const MOT_DE_PASSE = `jetable-${Math.random().toString(36).slice(2)}-A1!`;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;

async function ouvrirNavigateur() {
  const chemin = await pdfService.resolveBrowserPath();
  if (!chemin) throw new Error('Aucun navigateur headless disponible.');
  const port = 9400 + Math.floor(Math.random() * 200);
  const child = spawn(chemin, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    // Profil neuf : pas de cache, pas de session. C'est le coeur du test.
    '--incognito',
    `--remote-debugging-port=${port}`, '--remote-allow-origins=*'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch (_e) { /* pas encore pret */ }
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
  const urlsParRequete = new Map();
  let problemes = [];
  let echecsReseau = [];

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
      const t = (d && d.exception && d.exception.description) || (d && d.text) || '?';
      problemes.push(t.split('\n')[0].slice(0, 160));
    }
    // « Failed to fetch » cote navigateur, c'est CA : une requete qui n'aboutit
    // pas du tout (reseau, CORS, certificat). A ne pas confondre avec un 4xx,
    // qui est une reponse.
    if (m.method === 'Network.requestWillBeSent') {
      urlsParRequete.set(m.params.requestId, m.params.request.url);
    }
    if (m.method === 'Network.loadingFailed') {
      const url = urlsParRequete.get(m.params.requestId) || '(url inconnue)';
      echecsReseau.push(`${m.params.errorText || 'echec'} — ${url.replace(BASE, '').slice(0, 110)}`);
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      const { status, url } = m.params.response;
      echecsReseau.push(`${status} ${url.replace(BASE, '')}`);
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
    call,
    remettreACompteur: () => { problemes = []; echecsReseau = []; },
    get problemes() { return problemes; },
    get echecsReseau() { return echecsReseau; },
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

(async () => {
  console.log(`Parcours sur ${BASE}`);
  console.log('navigateur neuf, sans cache ni session\n');

  const marque = `parcours-${Date.now()}`;
  const email = `${marque}@celebrons-test.invalid`;
  let userId = null;
  let navigateur = null;

  try {
    const { data: cree, error } = await supabase.auth.admin.createUser({
      email, password: MOT_DE_PASSE, email_confirm: true
    });
    if (error) throw new Error(`compte jetable : ${error.message}`);
    userId = cree.user.id;

    navigateur = await ouvrirNavigateur();

    // Se connecter une fois, puis visiter.
    await navigateur.aller(`${BASE}/login`, 5000);
    await navigateur.evaluer([
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
    ].join('\n'));
    await attendre(7000);

    const pages = [
      ['/', 'accueil'],
      ['/dashboard', 'tableau de bord'],
      ['/orders', 'mes commandes'],
      ['/admin', 'administration'],
      ['/profile', 'profil']
    ];

    console.log('  page                  contenu   erreurs JS   reseau');
    console.log('  ' + '-'.repeat(56));

    for (const [chemin, nom] of pages) {
      navigateur.remettreACompteur();
      // eslint-disable-next-line no-await-in-loop
      await navigateur.aller(`${BASE}${chemin}`, 7000);
      // eslint-disable-next-line no-await-in-loop
      const taille = await navigateur.evaluer(
        "document.getElementById('root') ? document.getElementById('root').innerHTML.length : 0"
      );
      const js = navigateur.problemes.length;
      const reseau = navigateur.echecsReseau.length;
      const vide = !taille || taille < 200;

      if (vide || js > 0 || reseau > 0) echecs += 1;

      console.log(
        '  ' + nom.padEnd(22)
        + String(taille || 0).padEnd(10)
        + String(js).padEnd(13)
        + String(reseau)
      );

      if (js > 0) navigateur.problemes.slice(0, 2).forEach((x) => console.log(`      JS  ${x}`));
      if (reseau > 0) [...new Set(navigateur.echecsReseau)].slice(0, 3).forEach((x) => console.log(`      NET ${x}`));
    }
  } catch (error) {
    echecs += 1;
    console.log(` ECHEC ${error.message}`);
  } finally {
    if (navigateur) navigateur.fermer();
    if (userId) await supabase.auth.admin.deleteUser(userId);
    console.log('\n  compte jetable supprime');
  }

  console.log(echecs === 0
    ? '\nRESULTAT : OK — tout repond dans un navigateur neuf'
    : `\nRESULTAT : ${echecs} page(s) en defaut`);
  process.exit(echecs === 0 ? 0 : 1);
})();
