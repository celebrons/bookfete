// Le PDF contient-il TOUTES les photos du livre, entieres ?
//
//   node scripts/check-pdf-fidele.js --livre "Portugal"
//
// Signale le 2026-09-19 : « beaucoup de photos non fideles au livre,
// tronquees, coupees ». Cause trouvee : le rendu n'attendait que 8 secondes
// le chargement des photos, et imprimait avec 47 sur 56 encore en cours.
//
// Ce controle regarde le PDF PRODUIT, pas le document de depart : il compte
// les images que le fichier contient reellement et verifie qu'aucune n'est
// tronquee. Une image tronquee se reconnait a ce qu'un decodeur refuse de la
// lire entierement — c'est exactement ce que voit l'oeil du lecteur.

require('dotenv').config();
const fs = require('fs');

const sharp = require('../config/sharp');
const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const pdfService = require('../services/composition/pdfService');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const RECHERCHE = String(valeur('--livre', 'portugal')).toLowerCase();

let echecs = 0;
const check = (cond, msg, detail = '') => {
  if (!cond) echecs += 1;
  console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg + (detail ? `   ${detail}` : ''));
};

// Les images JPEG d'un PDF se reperent a leurs marqueurs de debut et de fin.
const extraireJpegs = (donnees) => {
  const trouves = [];
  let i = 0;
  while (i < donnees.length - 3) {
    if (donnees[i] === 0xFF && donnees[i + 1] === 0xD8 && donnees[i + 2] === 0xFF) {
      let j = i + 3;
      while (j < donnees.length - 1 && !(donnees[j] === 0xFF && donnees[j + 1] === 0xD9)) j += 1;
      if (j < donnees.length - 1) { trouves.push(donnees.subarray(i, j + 2)); i = j + 2; continue; }
    }
    i += 1;
  }
  return trouves;
};

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

  // La reference n est PAS le nombre de photos en base : une photothque
  // contient aussi des photos non placees. Ce qui compte, c est ce que le
  // document a reellement demande — une <img> par photo posee sur une page.
  const pageRenderer = require('../services/composition/pageRenderer');
  const html = pageRenderer.renderBookHtml({
    book: livre, pages, items, layouts, format, spreadLayout: true
  });
  const photosDuLivre = (html.match(/<img/g) || []).length;
  const photosEnBase = (items || []).filter((i) => i?.kind === 'photo').length;

  console.log(
    `« ${livre.title} » — ${pages.length} pages, ${photosDuLivre} photos placees `
    + `(${photosEnBase} dans la phototheque)\n`
  );
  console.log('  Generation...');

  const t0 = Date.now();
  const chemin = await pdfService.renderPdfByPrinting({
    book: livre, pages, items, layouts, format,
    spreadLayout: true,
    fileBaseName: 'check-fidelite',
    onProgress: ({ phase, done, total }) => {
      process.stdout.write(`\r   ${phase} ${done}/${total}          `);
    }
  });
  console.log(`\n  produit en ${Math.round((Date.now() - t0) / 1000)} s\n`);

  const donnees = fs.readFileSync(chemin);
  const jpegs = extraireJpegs(donnees);

  // Une image tronquee ne se decode pas entierement : sharp le dit.
  let lisibles = 0;
  let tronquees = 0;
  const largeurs = [];
  for (const image of jpegs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const meta = await sharp(image).metadata();
      if (!meta.width || meta.width < 200) continue;
      // eslint-disable-next-line no-await-in-loop
      await sharp(image).raw().toBuffer();
      lisibles += 1;
      largeurs.push(meta.width);
    } catch (_error) {
      tronquees += 1;
    }
  }

  console.log(`  images dans le PDF   : ${jpegs.length}`);
  console.log(`  decodables en entier : ${lisibles}`);
  console.log(`  tronquees            : ${tronquees}`);
  console.log(`  poids                : ${(donnees.length / 1048576).toFixed(1)} Mo`);
  console.log('');

  check(tronquees === 0, 'aucune image tronquee dans le PDF', tronquees ? `${tronquees} tronquee(s)` : '');
  check(
    lisibles >= photosDuLivre,
    `toutes les photos placees sont presentes (${photosDuLivre} attendues)`,
    lisibles < photosDuLivre ? `${lisibles} trouvees` : ''
  );

  console.log('');
  console.log(`  fichier : ${chemin}`);
  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
