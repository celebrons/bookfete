// LE BOUTON « TELECHARGER » MARCHE-T-IL DU PREMIER COUP ?
//
//   node scripts/check-bouton-telecharger.js
//   node scripts/check-bouton-telecharger.js --url https://78.232.5.181.sslip.io
//
// Signale deux fois le 2026-09-19 : « je suis toujours oblige de cliquer
// deux fois sur telecharger ». Mes deux corrections precedentes portaient
// sur la ROUTE, qui repond parfaitement du premier coup quand on l'appelle
// en HTTP. Le defaut est donc dans le NAVIGATEUR, entre le clic et le
// fichier — et c'est la qu'il faut aller regarder.
//
// Ce script clique VRAIMENT sur le bouton, une seule fois, et observe :
// les requetes partent-elles ? une erreur JavaScript ? le telechargement
// est-il declenche ?
//
// Compte, livre et commande jetables, supprimes a la fin.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const supabase = require('../config/supabase');
const { createClient } = require('@supabase/supabase-js');
const pdfService = require('../services/composition/pdfService');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const BASE = String(valeur('--url', 'https://78.232.5.181.sslip.io')).replace(/\/$/, '');
const MODELE = String(valeur('--modele', 'portugal')).toLowerCase();

const envFront = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', '.env'), 'utf8');
const lireFront = (nom) => (envFront.match(new RegExp(`^${nom}=(.+)$`, 'm')) || [])[1];
const URL_SUPABASE = lireFront('REACT_APP_SUPABASE_URL') || process.env.SUPABASE_URL;
const ANON = lireFront('REACT_APP_SUPABASE_ANON_KEY');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const check = (cond, msg, detail = '') => {
  if (!cond) echecs += 1;
  console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg + (detail ? `   ${detail}` : ''));
};

async function ouvrirNavigateur(dossierTelechargements) {
  const chemin = await pdfService.resolveBrowserPath();
  const port = 9300 + Math.floor(Math.random() * 200);
  const child = spawn(chemin, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, '--remote-allow-origins=*'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 80; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch (_e) { /* pas pret */ }
    // eslint-disable-next-line no-await-in-loop
    await attendre(200);
  }
  const rep = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const cible = await rep.json();

  // eslint-disable-next-line global-require
  const WsLib = require('ws');
  const ws = new WsLib(cible.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  let id = 0;
  const pending = new Map();
  const journalJs = [];
  const requetes = [];
  const telechargements = [];
  const reponses = [];
  const echecsReseau = [];
  const urlsParRequete = new Map();

  ws.on('message', (donnees) => {
    const m = JSON.parse(String(donnees));
    if (m.id !== undefined && pending.has(m.id)) {
      const { resolve } = pending.get(m.id); pending.delete(m.id); resolve(m.result); return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params?.exceptionDetails;
      journalJs.push('exception : ' + String(d?.exception?.description || d?.text || '?').split('\n')[0]);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
      const t = (m.params.args || []).map((a) => a.value ?? a.description ?? '').filter(Boolean).join(' ');
      if (t) journalJs.push('console.error : ' + t.split('\n')[0].slice(0, 200));
    }
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (u.includes('/api/')) requetes.push(`${m.params.request.method} ${u.replace(BASE, '')}`);
    }
    if (m.method === 'Network.requestWillBeSent') urlsParRequete.set(m.params.requestId, m.params.request.url);
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url;
      if (u.includes('/api/')) {
        const sd = m.params.response.securityDetails;
        reponses.push(
          `${m.params.response.status} ${m.params.response.protocol || '?'} `
          + `[${sd ? sd.issuer : 'sans TLS'}] ${u.replace(BASE, '')}`
        );
      }
    }
    if (m.method === 'Network.loadingFailed') {
      const u = String(urlsParRequete.get(m.params.requestId) || '?').replace(BASE, '');
      echecsReseau.push(`${m.params.errorText} [${m.params.type}] ${u}`);
    }
    if (m.method === 'Browser.downloadWillBegin') telechargements.push(m.params.suggestedFilename || 'sans nom');
    if (m.method === 'Page.downloadWillBegin') telechargements.push(m.params.suggestedFilename || 'sans nom');
  });

  const call = (methode, params = {}) => new Promise((resolve) => {
    const n = ++id; pending.set(n, { resolve });
    ws.send(JSON.stringify({ id: n, method: methode, params }));
  });

  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.enable');
  // Accepter les telechargements et les observer.
  await call('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: dossierTelechargements, eventsEnabled: true
  });

  return {
    call,
    journalJs,
    requetes,
    telechargements,
    reponses,
    echecsReseau,
    evaluer: async (expr) => {
      const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r?.result?.value;
    },
    aller: async (url, ms = 7000) => { await call('Page.navigate', { url }); await attendre(ms); },
    fermer: () => { try { ws.close(); } catch (_e) { /* deja fermee */ } child.kill(); }
  };
}

(async () => {
  console.log(`Le bouton « telecharger » sur ${BASE}\n`);

  const marque = `bouton-${Date.now()}`;
  const email = `${marque}@celebrons-test.invalid`;
  const motDePasse = `jetable-${Math.random().toString(36).slice(2)}-A1!`;
  const dossier = path.join(__dirname, '..', 'tmp', marque);
  fs.mkdirSync(dossier, { recursive: true });

  let userId = null;
  let bookId = null;
  let orderId = null;
  let navigateur = null;

  try {
    console.log('1. Compte, livre et commande PDF payee');
    const { data: cree, error: eu } = await supabase.auth.admin.createUser({
      email, password: motDePasse, email_confirm: true
    });
    if (eu) throw new Error(`compte : ${eu.message}`);
    userId = cree.user.id;

    const { data: livres } = await supabase.from('books').select('*');
    const modele = (livres || []).find((b) => (b.title || '').toLowerCase().includes(MODELE));
    if (!modele) throw new Error(`livre modele « ${MODELE} » introuvable`);

    const { data: livre, error: el } = await supabase.from('books').insert({
      title: `Livre ${marque}`, owner_id: userId, page_count: modele.page_count,
      print_format: modele.print_format, template_id: modele.template_id,
      cover_config: modele.cover_config, back_cover_config: modele.back_cover_config,
      cover_overrides: modele.cover_overrides, page_count_mode: modele.page_count_mode,
      collection_mode: modele.collection_mode
    }).select('id').single();
    if (el) throw new Error(`livre : ${el.message}`);
    bookId = livre.id;

    const { data: items } = await supabase.from('book_content_items').select('*').eq('book_id', modele.id);
    const corr = new Map();
    const copies = (items || []).map((l) => {
      const c = { ...l, book_id: bookId };
      delete c.id; delete c.created_at; delete c.updated_at;
      return { ancien: l.id, ligne: c };
    });
    if (copies.length) {
      const { data: ins, error } = await supabase.from('book_content_items')
        .insert(copies.map((c) => c.ligne)).select('id');
      if (error) throw new Error(`photos : ${error.message}`);
      (ins || []).forEach((l, i) => corr.set(copies[i].ancien, l.id));
    }
    const renum = (v) => {
      if (typeof v === 'string') return corr.get(v) || v;
      if (Array.isArray(v)) return v.map(renum);
      if (v && typeof v === 'object') {
        const o = {};
        Object.entries(v).forEach(([k, x]) => { o[corr.get(k) || k] = renum(x); });
        return o;
      }
      return v;
    };
    const { data: pagesM } = await supabase.from('book_pages').select('*').eq('book_id', modele.id);
    const cp = (pagesM || []).map((l) => {
      const c = { ...l, book_id: bookId, content: renum(l.content) };
      delete c.id; delete c.created_at; delete c.updated_at;
      return c;
    });
    if (cp.length) {
      const { error } = await supabase.from('book_pages').insert(cp);
      if (error) throw new Error(`pages : ${error.message}`);
    }
    await supabase.from('books').update({
      cover_overrides: renum(modele.cover_overrides), cover_config: renum(modele.cover_config)
    }).eq('id', bookId);

    const { data: cmd, error: ec } = await supabase.from('orders').insert({
      book_id: bookId, owner_id: userId, type: 'pdf', status: 'paid',
      paid_at: new Date().toISOString(),
      metadata: { pricing: { pages: modele.page_count, printFormat: modele.print_format, pdfUnitCents: 3900 } }
    }).select('id').single();
    if (ec) throw new Error(`commande : ${ec.message}`);
    orderId = cmd.id;
    console.log('   cree\n');

    console.log('2. Fabrication du PDF (pour avoir quelque chose a telecharger)');
    const client = createClient(URL_SUPABASE, ANON);
    const { data: sess, error: es } = await client.auth.signInWithPassword({ email, password: motDePasse });
    if (es) throw new Error(`connexion : ${es.message}`);
    const entetes = { Authorization: `Bearer ${sess.session.access_token}`, 'Content-Type': 'application/json' };

    const lancement = await fetch(`${BASE}/api/books/${bookId}/export-final-pdf`, {
      method: 'POST', headers: entetes, body: JSON.stringify({ forceRegenerate: true })
    });
    const { jobId } = await lancement.json();
    let statut = '';
    const echeance = Date.now() + 10 * 60 * 1000;
    while (Date.now() < echeance) {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(`${BASE}/api/books/${bookId}/export-final-pdf/${jobId}/status`, { headers: entetes });
      // eslint-disable-next-line no-await-in-loop
      const c = await r.json().catch(() => ({}));
      statut = c.status;
      if (statut === 'ready' || statut === 'failed') break;
      // eslint-disable-next-line no-await-in-loop
      await attendre(3000);
    }
    check(statut === 'ready', 'le PDF est fabrique', `statut : ${statut}`);
    if (statut !== 'ready') throw new Error('pas de PDF a telecharger');

    // La commande doit porter le job, comme apres un vrai parcours.
    await supabase.from('orders').update({
      status: 'pdf_ready',
      metadata: {
        pricing: { pages: modele.page_count, printFormat: modele.print_format, pdfUnitCents: 3900 },
        pdfJobId: jobId, pdfReady: true, pdfCompletedAt: new Date().toISOString()
      }
    }).eq('id', orderId);
    console.log('');

    console.log('3. Ouverture de la page de commande, dans un navigateur');
    navigateur = await ouvrirNavigateur(dossier);
    await navigateur.aller(`${BASE}/login`, 5000);
    await navigateur.evaluer([
      '(() => {',
      '  const poser = (el, v) => {',
      "    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');",
      '    d.set.call(el, v);',
      "    el.dispatchEvent(new Event('input', { bubbles: true }));",
      '  };',
      `  poser(document.querySelector('input[type="email"]'), ${JSON.stringify(email)});`,
      `  poser(document.querySelector('input[type="password"]'), ${JSON.stringify(motDePasse)});`,
      "  document.querySelector('form.auth-form').requestSubmit();",
      '  return true;',
      '})()'
    ].join('\n'));
    await attendre(7000);

    await navigateur.aller(`${BASE}/book/${bookId}/checkout`, 18000);

    const bouton = await navigateur.evaluer(
      "(() => { const b = [...document.querySelectorAll('button')].find((x) => /t[ée]l[ée]charger/i.test(x.textContent)); return b ? b.textContent.trim() : ''; })()"
    );
    check(Boolean(bouton), 'le bouton de telechargement est present', bouton || 'introuvable');
    if (!bouton) throw new Error('bouton introuvable');
    console.log('');

    console.log('4. UN SEUL CLIC');
    navigateur.requetes.length = 0;
    navigateur.journalJs.length = 0;
    navigateur.telechargements.length = 0;
    navigateur.reponses.length = 0;
    navigateur.echecsReseau.length = 0;

    await navigateur.evaluer(
      "(() => { const b = [...document.querySelectorAll('button')].find((x) => /t[ée]l[ée]charger/i.test(x.textContent)); b.click(); return true; })()"
    );
    await attendre(25000);

    const fichiers = fs.readdirSync(dossier).filter((n) => !n.endsWith('.crdownload'));
    console.log(`   requetes API : ${navigateur.requetes.length ? navigateur.requetes.join(' | ') : 'aucune'}`);
    console.log(`   telechargements annonces : ${navigateur.telechargements.join(', ') || 'aucun'}`);
    console.log(`   fichiers recus : ${fichiers.join(', ') || 'aucun'}`);
    console.log(`   reponses HTTP  : ${navigateur.reponses.join(' | ') || 'aucune'}`);
    console.log(`   echecs reseau  : ${navigateur.echecsReseau.join(' | ') || 'aucun'}`);
    if (navigateur.journalJs.length) {
      console.log('   erreurs JS :');
      navigateur.journalJs.slice(0, 4).forEach((x) => console.log(`     ${x}`));
    }
    const etatBouton = await navigateur.evaluer(
      "(() => { const b = [...document.querySelectorAll('button')].find((x) => /t[ée]l[ée]charg/i.test(x.textContent)); return b ? b.textContent.trim() + (b.disabled ? ' [desactive]' : '') : 'disparu'; })()"
    );
    const message = await navigateur.evaluer(
      "(() => { const n = document.querySelector('.orders-notice, .notice, [class*=notice]'); return n ? n.innerText.trim().slice(0, 160) : ''; })()"
    );
    console.log(`   bouton apres : ${etatBouton}`);
    if (message) console.log(`   message affiche : « ${message} »`);
    console.log('');

    check(fichiers.length > 0, 'UN SEUL CLIC suffit a recuperer le fichier', fichiers.length ? '' : 'aucun fichier');
    check(navigateur.journalJs.length === 0, 'aucune erreur JavaScript');
  } catch (error) {
    echecs += 1;
    console.log(`\n ECHEC ${error.message}`);
  } finally {
    if (navigateur) navigateur.fermer();
    if (orderId) await supabase.from('orders').delete().eq('id', orderId);
    if (bookId) {
      await supabase.from('book_pages').delete().eq('book_id', bookId);
      await supabase.from('book_content_items').delete().eq('book_id', bookId);
      await supabase.from('books').delete().eq('id', bookId);
    }
    if (userId) await supabase.auth.admin.deleteUser(userId);
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (_e) { /* deja parti */ }
    console.log('\n  donnees jetables supprimees');
  }

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
