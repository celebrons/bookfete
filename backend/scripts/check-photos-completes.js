// Les photos ont-elles le temps d'arriver avant que Chrome n'imprime ?
//
//   node scripts/check-photos-completes.js
//   node scripts/check-photos-completes.js --livre "Portugal"
//
// Signale le 2026-09-19 : « beaucoup de photos non fideles au livre,
// tronquees, coupees » — pages 5-6, 7-8 (double page), 9, 13-14 du livre
// Portugal 2025.
//
// Une photo tronquee dans un PDF n'est pas un probleme de mise en page :
// c'est une image que le navigateur n'avait pas fini de decoder au moment
// d'imprimer. Le rendu par impression charge TOUTES les photos du livre dans
// un seul document, la ou l'ancien rendu en chargeait quelques-unes par
// page — le delai d'attente, lui, n'a pas bouge.
//
// Ce script ne conclut pas a l'oeil : il compte, seconde par seconde,
// combien d'images sont reellement pretes.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const pageRenderer = require('../services/composition/pageRenderer');
const pdfService = require('../services/composition/pdfService');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const RECHERCHE = String(valeur('--livre', 'portugal')).toLowerCase();
const PLAFOND_MS = Number(valeur('--plafond', 120000)) || 120000;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { data: livres } = await supabase.from('books').select('*');
  const livre = (livres || []).find((b) => (b.title || '').toLowerCase().includes(RECHERCHE));
  if (!livre) { console.log(`Aucun livre dont le titre contient « ${RECHERCHE} ».`); process.exit(1); }

  const format = {
    formatId: livre.print_format,
    ...resolveCoverFormat(livre.print_format),
    ...resolveFormatDensity(livre.print_format)
  };
  const [interiorPages, items, layouts] = await Promise.all([
    bookContentService.listPagesForRender(livre.id, livre.page_count),
    bookContentService.listContentItems(livre.id),
    templateCatalog.listActiveLayouts()
  ]);
  const template = livre.template_id ? await templateCatalog.getTemplateById(livre.template_id) : null;
  const pages = coverComposer.composeCoversIntoPages({ book: livre, items, template, interiorPages, format });

  console.log(`« ${livre.title} » — ${pages.length} pages\n`);

  // Le MEME document que celui qui part a l'impression : photos allegees
  // comprises, puisque c'est leur chargement qu'on mesure.
  const html = pageRenderer.renderBookHtml({
    book: livre,
    pages,
    items: pdfService.__allegerPourLesTests
      ? pdfService.__allegerPourLesTests(items, 2000)
      : items,
    layouts,
    format,
    spreadLayout: true
  });

  const dossier = pdfService.PDF_PREVIEW_DIR;
  fs.mkdirSync(dossier, { recursive: true });
  const htmlPath = path.join(dossier, `mesure-photos-${Date.now()}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browserPath = await pdfService.resolveBrowserPath();
  const port = 9200 + Math.floor(Math.random() * 300);
  const child = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--renderer-process-limit=1', '--no-zygote',
    `--remote-debugging-port=${port}`, '--remote-allow-origins=*'
  ], { stdio: 'ignore' });

  try {
    for (let i = 0; i < 80; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.ok) break;
      } catch (_e) { /* pas pret */ }
      // eslint-disable-next-line no-await-in-loop
      await attendre(200);
    }
    const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    const cible = await r.json();

    const ws = new WebSocket(cible.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });

    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== undefined && pending.has(m.id)) {
        const { resolve } = pending.get(m.id);
        pending.delete(m.id);
        resolve(m.result);
      }
    });
    const call = (methode, params = {}) => new Promise((resolve) => {
      const n = ++id;
      pending.set(n, { resolve });
      ws.send(JSON.stringify({ id: n, method: methode, params }));
    });
    const evaluer = async (expr) => {
      const res = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
      return res && res.result ? res.result.value : undefined;
    };

    const t0 = Date.now();
    await call('Page.navigate', { url: pathToFileURL(htmlPath).href });

    console.log('  seconde   pretes / total');
    console.log('  ' + '-'.repeat(28));

    let total = 0;
    let completesA8s = null;
    let toutPretA = null;

    while (Date.now() - t0 < PLAFOND_MS) {
      // eslint-disable-next-line no-await-in-loop
      const brut = await evaluer(
        'JSON.stringify({ t: document.images.length, p: Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length })'
      );
      const c = JSON.parse(brut || '{}');
      total = c.t || 0;
      const s = Math.round((Date.now() - t0) / 1000);

      if (completesA8s === null && Date.now() - t0 >= 8000) completesA8s = c.p || 0;
      if (total > 0 && c.p === total) { toutPretA = s; break; }

      if (s % 2 === 0) console.log(`  ${String(s).padStart(5)} s   ${String(c.p || 0).padStart(4)} / ${total}`);
      // eslint-disable-next-line no-await-in-loop
      await attendre(1000);
    }

    console.log('');
    console.log(`  photos dans le document        : ${total}`);
    console.log(`  pretes au bout de 8 s          : ${completesA8s === null ? '(non mesure)' : completesA8s}`);
    console.log(`  toutes pretes au bout de       : ${toutPretA === null ? `plus de ${Math.round(PLAFOND_MS / 1000)} s` : `${toutPretA} s`}`);
    console.log('');

    const seuil = 8000;
    if (completesA8s !== null && total > 0 && completesA8s < total) {
      const manquantes = total - completesA8s;
      console.log(` ECHEC ${manquantes} photo(s) sur ${total} n'etaient PAS pretes quand le rendu imprime`);
      console.log(`       (IMAGE_WAIT_TIMEOUT_MS vaut ${seuil} ms)`);
      console.log('       C est exactement ce qui produit des photos tronquees.');
    } else {
      console.log('  OK   toutes les photos etaient pretes avant la limite');
    }

    ws.close();
  } finally {
    child.kill();
    fs.unlink(htmlPath, () => {});
  }
  process.exit(0);
})();
