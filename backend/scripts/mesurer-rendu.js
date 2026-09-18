// Combien coute REELLEMENT un rendu PDF : memoire de Node, memoire et
// nombre de processus du navigateur, duree.
//
//   node scripts/mesurer-rendu.js                 -> le livre dont le titre contient "montr"
//   node scripts/mesurer-rendu.js --livre "60 ans"
//
// Ecrit le 2026-09-18 apres que le noyau a tue Chrome pour manque de memoire
// sur une machine de 2 Go, en plein rendu :
//
//   Out of memory: Killed process (chrome)
//
// Mes mesures precedentes portaient sur un rendu isole, lance par un script,
// sur une machine au repos — elles annoncaient 842 Mo. En conditions reelles
// le meme rendu lancait HUIT processus navigateur et depassait le gigaoctet.
// Ce script existe pour que la prochaine affirmation sur le cout d'un rendu
// soit mesuree, pas supposee.

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');

const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const pdfService = require('../services/composition/pdfService');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const args = process.argv.slice(2);
const iLivre = args.indexOf('--livre');
const RECHERCHE = (iLivre > -1 ? args[iLivre + 1] : 'montr').toLowerCase();

const mo = (octets) => Math.round(octets / 1024 / 1024);

// Le navigateur est un ensemble de processus SEPARES : sa memoire n'apparait
// nulle part dans celle de Node, alors qu'elle pese sur la meme machine.
// C'est precisement ce que mes premieres mesures avaient sous-estime.
function navigateur() {
  if (process.platform === 'win32') return { processus: 0, memoireMo: 0 };
  try {
    const sortie = execSync(
      "ps -eo rss,args | grep -- '--headless' | grep -v grep || true",
      { encoding: 'utf8', timeout: 5000 }
    );
    const lignes = sortie.trim().split('\n').filter(Boolean);
    const octets = lignes.reduce((t, l) => t + (Number(l.trim().split(/\s+/)[0]) || 0) * 1024, 0);
    return { processus: lignes.length, memoireMo: mo(octets) };
  } catch (_error) {
    return { processus: 0, memoireMo: 0 };
  }
}

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

  console.log(`« ${livre.title} » — ${pages.length} pages, format ${livre.print_format}`);
  console.log('');

  let picNode = 0;
  let picNavigateur = 0;
  let picProcessus = 0;
  let picTotal = 0;

  // Echantillonnage serre : les pics durent quelques secondes et se
  // manquent facilement. Une mesure prise a la fin de chaque page tombe
  // systematiquement dans les creux — erreur commise le 2026-09-16.
  const sonde = setInterval(() => {
    const node = process.memoryUsage().rss;
    const nav = navigateur();
    picNode = Math.max(picNode, node);
    picNavigateur = Math.max(picNavigateur, nav.memoireMo * 1024 * 1024);
    picProcessus = Math.max(picProcessus, nav.processus);
    picTotal = Math.max(picTotal, node + nav.memoireMo * 1024 * 1024);
  }, 500);

  const depart = Date.now();
  let chemin = null;
  let echec = null;
  try {
    chemin = await pdfService.renderPdfFromPages({
      book: livre, pages, items, layouts, format,
      fileBaseName: 'mesure-rendu',
      onProgress: ({ phase, done, total }) => {
        const nav = navigateur();
        process.stdout.write(
          `\r   ${phase || 'pages'} ${done}/${total} — node ${mo(process.memoryUsage().rss)} Mo` +
          ` + navigateur ${nav.memoireMo} Mo (${nav.processus} proc.)    `
        );
      }
    });
  } catch (error) {
    echec = error.message;
  }
  clearInterval(sonde);
  console.log('\n');

  const secondes = (Date.now() - depart) / 1000;

  console.log(`  duree              : ${(secondes / 60).toFixed(1)} min`);
  console.log(`  pic node           : ${mo(picNode)} Mo`);
  console.log(`  pic navigateur     : ${mo(picNavigateur)} Mo   (${picProcessus} processus au plus)`);
  console.log(`  PIC TOTAL          : ${mo(picTotal)} Mo`);

  if (chemin && fs.existsSync(chemin)) {
    console.log(`  PDF produit        : ${(fs.statSync(chemin).size / 1024 / 1024).toFixed(1)} Mo`);
    fs.unlinkSync(chemin);
  }
  if (echec) console.log(`  ECHEC              : ${echec}`);

  const os = require('os');
  const marge = os.totalmem() - picTotal;
  console.log('');
  console.log(`  memoire de la machine : ${mo(os.totalmem())} Mo`);
  console.log(
    marge > 0
      ? `  marge restante        : ${mo(marge)} Mo`
      : `  DEPASSEMENT           : ${mo(-marge)} Mo de trop — le noyau tuera un processus`
  );

  process.exit(echec ? 1 : 0);
})();
