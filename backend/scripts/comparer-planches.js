// La mise en planches abime-t-elle la mise en page ?
//
//   node scripts/comparer-planches.js --livre "Portugal" --page 4
//
// Le 2026-09-19 : « le rendu PDF n'est pas bon, pages 5 et 6, 7 et 8, 9,
// 13 et 14 — beaucoup de photos non fideles au livre ». Les compteurs
// disaient pourtant tous « bon » : 56 images sur 56, aucune tronquee.
//
// Ce script rend LA MEME page deux fois — seule dans sa feuille, puis en
// planche — et produit deux images a comparer. Si elles different, le defaut
// est dans la mise en planches, pas dans le contenu.

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
const PAGE = Number(valeur('--page', 4));
const SORTIE = path.join(__dirname, '..', 'tmp', 'apercu');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function capturer(htmlPath, selecteur, fichier, echelle = 0.5) {
  const browserPath = await pdfService.resolveBrowserPath();
  const port = 9650 + Math.floor(Math.random() * 200);
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
    await attendre(25000);

    const boite = await call('Runtime.evaluate', {
      expression: `(() => {
        const e = document.querySelector(${JSON.stringify(selecteur)});
        if (!e) return '';
        const r = e.getBoundingClientRect();
        return JSON.stringify({ x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
      })()`,
      returnByValue: true
    });
    const b = boite?.result?.value ? JSON.parse(boite.result.value) : null;
    if (!b) { console.log(`  ${selecteur} introuvable`); return null; }

    const shot = await call('Page.captureScreenshot', {
      format: 'png',
      clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: echelle },
      captureBeyondViewport: true
    });
    fs.writeFileSync(fichier, Buffer.from(shot.data, 'base64'));
    ws.close();
    return { fichier, largeur: Math.round(b.w), hauteur: Math.round(b.h) };
  } finally {
    child.kill();
  }
}

(async () => {
  const { data: livres } = await supabase.from('books').select('*');
  const livre = (livres || []).find((b) => (b.title || '').toLowerCase().includes(RECHERCHE));
  if (!livre) { console.log(`Aucun livre « ${RECHERCHE} ».`); process.exit(1); }

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

  fs.mkdirSync(SORTIE, { recursive: true });

  // 1. La page SEULE, telle que l'ancien rendu la produisait.
  const page = pages.find((p) => Number(p.page_index) === PAGE);
  if (!page) { console.log(`Page ${PAGE} introuvable.`); process.exit(1); }
  const htmlSeule = pageRenderer.renderSinglePageHtml({ book: livre, page, items, layouts, format });
  const cheminSeule = path.join(SORTIE, 'page-seule.html');
  fs.writeFileSync(cheminSeule, htmlSeule, 'utf8');
  const seule = await capturer(cheminSeule, '.page', path.join(SORTIE, `page-${PAGE}-seule.png`), 0.5);

  // 2. La meme page, en planche.
  const htmlPlanches = pageRenderer.renderBookHtml({
    book: livre, pages, items, layouts, format, spreadLayout: true
  });
  const cheminPlanches = path.join(SORTIE, 'planches.html');
  fs.writeFileSync(cheminPlanches, htmlPlanches, 'utf8');
  // La page d'index PAGE est la (PAGE+1)e .page du document (la couverture
  // occupe la premiere).
  const enPlanche = await capturer(
    cheminPlanches,
    `.page:nth-of-type(${PAGE + 2})`,
    path.join(SORTIE, `page-${PAGE}-planche.png`),
    0.5
  );

  console.log('');
  console.log(`  page seule   : ${seule ? `${seule.largeur} x ${seule.hauteur} px` : '—'}`);
  console.log(`  en planche   : ${enPlanche ? `${enPlanche.largeur} x ${enPlanche.hauteur} px` : '—'}`);
  console.log('');
  console.log('  Deux tailles differentes = la mise en planches deforme la page.');
  process.exit(0);
})();
