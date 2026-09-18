// Les deux methodes de rendu produisent-elles le MEME livre ?
//
//   node scripts/comparer-methodes-pdf.js
//   node scripts/comparer-methodes-pdf.js --livre "60 ans" --bleed 3
//
// Deux facons de fabriquer le PDF coexistent :
//   - par CAPTURES : chaque page est photographiee, les images sont empilees ;
//   - par IMPRESSION : Chrome ecrit le PDF lui-meme (renderPdfByPrinting).
//
// La seconde consomme quatre fois moins de memoire et integre les photos a
// leur resolution d origine. Encore faut-il qu'elle produise le meme livre :
// meme nombre de pages, memes dimensions, memes photos, et surtout les
// moities d une double page du bon cote.
//
// Ce script ne conclut pas sur le poids du fichier — c'est exactement l'erreur
// qui avait fait ecarter printToPDF pendant des mois. Il mesure les PIXELS.

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');

const sharp = require('../config/sharp');
const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const pdfService = require('../services/composition/pdfService');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const MM_PAR_POUCE = 25.4;
const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const RECHERCHE = String(valeur('--livre', 'montr')).toLowerCase();
const BLEED = Number(valeur('--bleed', 0)) || 0;

let echecs = 0;
const check = (cond, msg, detail = '') => {
  if (!cond) echecs += 1;
  console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg + (detail ? `   ${detail}` : ''));
};

// Les pages d'un PDF produit par Chrome sont rangees dans un ARBRE equilibre :
// plusieurs noeuds intermediaires portent chacun un /Count partiel. Prendre le
// premier venu donne un chiffre faux — erreur commise le 2026-09-18, qui avait
// fait croire a 8 pages au lieu de 32. On compte les objets /Type /Page.
const compterPages = (donnees) => (donnees.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

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

  console.log(`« ${livre.title} » — ${pages.length} pages composees, ${format.trimWidthMm}x${format.trimHeightMm} mm`);
  console.log(BLEED > 0 ? `fond perdu : ${BLEED} mm` : 'sans fond perdu');
  console.log('');

  const mesurer = async (nom, fabrique) => {
    let pic = 0;
    const sonde = setInterval(() => { pic = Math.max(pic, process.memoryUsage().rss); }, 250);
    const t0 = Date.now();
    const chemin = await fabrique();
    clearInterval(sonde);

    const donnees = fs.readFileSync(chemin);
    const jpegs = extraireJpegs(donnees);
    const largeurs = [];
    for (const img of jpegs) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const m = await sharp(img).metadata();
        if (m.width > 200) largeurs.push(m.width);
      } catch (_e) { /* pas une image */ }
    }
    largeurs.sort((a, b) => b - a);
    const largeurPouces = (format.trimWidthMm + BLEED * 2) / MM_PAR_POUCE;

    const resultat = {
      nom,
      chemin,
      secondes: Math.round((Date.now() - t0) / 1000),
      picMo: Math.round(pic / 1024 / 1024),
      poidsMo: Number((donnees.length / 1024 / 1024).toFixed(1)),
      pages: compterPages(donnees),
      images: largeurs.length,
      dpiMax: largeurs.length ? Math.round(largeurs[0] / largeurPouces) : 0
    };

    console.log(`${nom} : ${resultat.pages} pages, ${resultat.poidsMo} Mo, ${resultat.secondes} s, pic ${resultat.picMo} Mo, ${resultat.images} images, ~${resultat.dpiMax} dpi`);
    return resultat;
  };

  const commun = { book: livre, pages, items, layouts, format, bleedMm: BLEED, insertInsideCover: true };

  const captures = await mesurer('captures  ', () => pdfService.renderPdfFromPages({
    ...commun, fileBaseName: 'comparaison-captures'
  }));

  const impression = await mesurer('impression', () => pdfService.renderPdfByPrinting({
    ...commun, fileBaseName: 'comparaison-impression'
  }));

  console.log('');
  console.log('=== Le livre produit est-il le meme ?');

  check(
    impression.pages === captures.pages,
    `meme nombre de pages (${captures.pages})`,
    impression.pages !== captures.pages ? `impression : ${impression.pages}` : ''
  );
  check(impression.images > 0, `les photos sont bien integrees (${impression.images})`);
  check(
    impression.dpiMax >= 200,
    `resolution compatible impression (~${impression.dpiMax} dpi, 200 minimum)`
  );

  console.log('');
  console.log('=== Ce que l impression fait gagner');
  const gainMemoire = captures.picMo - impression.picMo;
  const gainTemps = captures.secondes - impression.secondes;
  console.log(`  memoire : ${captures.picMo} -> ${impression.picMo} Mo   (${gainMemoire > 0 ? '-' : '+'}${Math.abs(gainMemoire)} Mo)`);
  console.log(`  duree   : ${captures.secondes} -> ${impression.secondes} s   (${gainTemps > 0 ? '-' : '+'}${Math.abs(gainTemps)} s)`);
  console.log(`  finesse : ${captures.dpiMax} -> ${impression.dpiMax} dpi`);
  console.log(`  poids   : ${captures.poidsMo} -> ${impression.poidsMo} Mo`);

  console.log('');
  console.log('  Fichiers conserves pour inspection :');
  console.log(`    ${captures.chemin}`);
  console.log(`    ${impression.chemin}`);

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
