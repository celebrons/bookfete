// Regarder ce que le PDF contient vraiment, page par page.
//
//   node scripts/voir-pages.js --livre "Portugal" --feuilles 4,5,6
//
// Ecrit le 2026-09-19 apres trois diagnostics successifs qui portaient tous
// sur des MESURES (poids, nombre d'images, images tronquees) alors que le
// reproche etait VISUEL : « photos non fideles au livre, tronquees,
// coupees ». Un fichier peut etre parfait sur tous les compteurs et mauvais
// a l'oeil.
//
// Ce script produit une image par feuille, a regarder.

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
const FEUILLES = String(valeur('--feuilles', '3,4,5'))
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isInteger(n));
const SORTIE = valeur('--sortie', path.join(__dirname, '..', 'tmp', 'apercu'));

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

  const html = pageRenderer.renderBookHtml({
    book: livre, pages, items, layouts, format, spreadLayout: true
  });

  fs.mkdirSync(SORTIE, { recursive: true });
  const htmlPath = path.join(SORTIE, 'apercu.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browserPath = await pdfService.resolveBrowserPath();
  const port = 9600 + Math.floor(Math.random() * 200);
  const child = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
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
    const rep = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    const cible = await rep.json();

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

    await call('Page.enable', {});
    await call('Page.navigate', { url: pathToFileURL(htmlPath).href });
    await attendre(45000);

    // Une image par feuille demandee, a l'echelle 1 : on regarde un cadrage,
    // pas une qualite d'impression.
    for (const numero of FEUILLES) {
      // eslint-disable-next-line no-await-in-loop
      const boite = await call('Runtime.evaluate', {
        expression: `(() => {
          const f = document.querySelectorAll('.feuille')[${numero}];
          if (!f) return '';
          const r = f.getBoundingClientRect();
          return JSON.stringify({ x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
        })()`,
        returnByValue: true
      });
      const b = boite?.result?.value ? JSON.parse(boite.result.value) : null;
      if (!b) { console.log(`  feuille ${numero} : introuvable`); continue; }

      // eslint-disable-next-line no-await-in-loop
      const shot = await call('Page.captureScreenshot', {
        format: 'png',
        clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 0.55 },
        captureBeyondViewport: true
      });
      const fichier = path.join(SORTIE, `feuille-${numero}.png`);
      fs.writeFileSync(fichier, Buffer.from(shot.data, 'base64'));
      console.log(`  feuille ${numero} -> ${fichier}`);
    }

    ws.close();
  } finally {
    child.kill();
  }
  process.exit(0);
})();
