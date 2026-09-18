// Le PDF de lecture est-il bien en planches, et la double page entiere ?
//
//   node scripts/check-pdf-planches.js
//   node scripts/check-pdf-planches.js --livre "60 ans"
//
// Demande du 2026-09-19 : « produire le PDF avec 2 pages, comme ca lorsqu il
// y a une photo sur 2 pages elle est pas perdue ».
//
// Jusqu ici on comptait sur le mode d affichage du lecteur — une page blanche
// inseree apres la couverture, plus une preference /PageLayout que la plupart
// des lecteurs ignorent. Desormais la feuille PORTE les deux pages : le
// raccord ne depend plus de personne.
//
// Ce controle verifie la geometrie ET le contenu : une feuille deux fois plus
// large ne prouve rien si les deux moities ne s y retrouvent pas.

require('dotenv').config();
const fs = require('fs');

const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const pageRenderer = require('../services/composition/pageRenderer');
const pdfService = require('../services/composition/pdfService');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const args = process.argv.slice(2);
const iLivre = args.indexOf('--livre');
const RECHERCHE = (iLivre > -1 ? args[iLivre + 1] : 'montr').toLowerCase();

const PT_PAR_MM = 72 / 25.4;

let echecs = 0;
const check = (cond, msg, detail = '') => {
  if (!cond) echecs += 1;
  console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg + (detail ? `   ${detail}` : ''));
};

// Les pages d'un PDF de Chrome sont rangees dans un arbre equilibre : compter
// les objets /Type /Page, jamais le premier /Count venu (erreur du 2026-09-18).
const compterPages = (d) => (d.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

// La taille de feuille se lit dans les /MediaBox.
const tailles = (d) => [...d.toString('latin1').matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
  .map((m) => ({ largeurPt: Number(m[3]) - Number(m[1]), hauteurPt: Number(m[4]) - Number(m[2]) }));

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

  console.log(`« ${livre.title} » — ${pages.length} pages composees, ${format.trimWidthMm}x${format.trimHeightMm} mm\n`);

  // --- Le contenu : les deux moities sont-elles sur la MEME feuille ?
  const html = pageRenderer.renderBookHtml({
    book: livre, pages, items, layouts, format, spreadLayout: true
  });

  const feuilles = [...html.matchAll(/<div class="feuille[^"]*">([\s\S]*?)(?=<div class="feuille|<\/body>)/g)]
    .map((m) => m[1]);

  console.log(`  ${feuilles.length} feuilles pour ${pages.length} pages`);

  const feuillesAvecDemiGauche = feuilles.filter((f) => f.includes('is-spread-left'));
  const feuillesCompletes = feuillesAvecDemiGauche.filter((f) => f.includes('is-spread-right'));

  check(
    feuillesAvecDemiGauche.length > 0,
    `des doubles pages sont presentes (${feuillesAvecDemiGauche.length})`
  );
  check(
    feuillesCompletes.length === feuillesAvecDemiGauche.length,
    'chaque double page a ses DEUX moities sur la meme feuille',
    `${feuillesCompletes.length} / ${feuillesAvecDemiGauche.length}`
  );

  // La couverture et la 4e restent seules, comme dans un vrai livre.
  const pagesParFeuille = feuilles.map((f) => (f.match(/class="page[ "]/g) || []).length);
  check(pagesParFeuille[0] === 1, 'la couverture est seule sur sa feuille');
  check(
    pagesParFeuille[pagesParFeuille.length - 1] === 1,
    'la 4e de couverture est seule sur sa feuille'
  );

  // --- La geometrie : le PDF reellement produit.
  console.log('');
  console.log('  Generation du PDF...');
  const chemin = await pdfService.renderPdfByPrinting({
    book: livre, pages, items, layouts, format,
    spreadLayout: true,
    fileBaseName: 'check-planches'
  });

  const donnees = fs.readFileSync(chemin);
  const nbPages = compterPages(donnees);
  const mediaBox = tailles(donnees);

  const largeurAttendueMm = format.trimWidthMm * 2;
  const largeurMm = mediaBox.length ? Math.round(mediaBox[0].largeurPt / PT_PAR_MM) : 0;
  const hauteurMm = mediaBox.length ? Math.round(mediaBox[0].hauteurPt / PT_PAR_MM) : 0;

  console.log('');
  console.log(`  feuille : ${largeurMm} x ${hauteurMm} mm`);
  check(
    Math.abs(largeurMm - largeurAttendueMm) <= 1,
    `la feuille fait bien deux pages de large (${largeurAttendueMm} mm attendus)`
  );
  check(
    Math.abs(hauteurMm - format.trimHeightMm) <= 1,
    `la hauteur reste celle d une page (${format.trimHeightMm} mm)`
  );
  check(
    nbPages === feuilles.length,
    `le PDF compte ${feuilles.length} feuilles`,
    nbPages !== feuilles.length ? `trouve : ${nbPages}` : ''
  );
  check(
    nbPages < pages.length,
    'il y a moins de feuilles que de pages — les pages sont bien appariees',
    `${nbPages} feuilles pour ${pages.length} pages`
  );

  console.log('');
  console.log(`  poids : ${(donnees.length / 1024 / 1024).toFixed(1)} Mo`);
  console.log(`  fichier conserve : ${chemin}`);

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
