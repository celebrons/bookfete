// La barre de progression dit-elle la VERITE ? Et ce rendu tient-il dans la
// memoire de l'hebergeur ?
//
//   node scripts/check-pdf-progress.js              -> mecanisme seul (echelle 1, ~2 min)
//   node scripts/check-pdf-progress.js --production -> echelle reelle + mesure memoire (~4 min)
//   node scripts/check-pdf-progress.js "60 ans"     -> un autre livre
//
// Pourquoi ce script existe : le 2026-09-15, un PDF est reste « en cours »
// pendant quinze minutes sans jamais arriver, sans qu'aucun ecran ne puisse
// dire s'il avancait ou s'il etait mort. Une barre de progression n'a de
// valeur que si elle reflete le travail REEL : une animation decorative
// aurait fait attendre sans informer, c'est-a-dire pire que rien.
//
// On rend donc un vrai livre et on regarde les rapports d'avancement arriver :
// un par page, dans l'ordre, sans trou ni recul, avec le total connu des le
// debut (sinon la barre saute), puis la phase d'assemblage (sinon elle reste
// figee a 100 % sans explication).
//
// La mesure memoire repond a l'autre moitie de la question : sur Render, un
// depassement ne produit pas une erreur applicative, le processus est TUE — et
// le rendu meurt avec lui, ce qui ressemble exactement a « bloque depuis
// quinze minutes ». Node et le navigateur headless sont deux processus, mais
// ils partagent le meme plafond d'instance : c'est leur SOMME qui compte.

require('dotenv').config();
const fs = require('fs');
const supabase = require('../config/supabase');
const svc = require('../services/composition/bookContentService');
const catalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const pdfService = require('../services/composition/pdfService');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

let echecs = 0;
const check = (cond, msg) => { if (!cond) echecs += 1; console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg); };

const arguments_ = process.argv.slice(2);
const production = arguments_.includes('--production');
const recherche = arguments_.find((a) => !a.startsWith('--')) || 'montr';

(async () => {
  const { data: books } = await supabase.from('books').select('*');
  const livre = (books || []).find((b) => (b.title || '').toLowerCase().includes(recherche.toLowerCase()));
  if (!livre) { console.log(`Aucun livre dont le titre contient « ${recherche} ».`); process.exit(1); }

  const format = { formatId: livre.print_format, ...resolveCoverFormat(livre.print_format), ...resolveFormatDensity(livre.print_format) };
  const [interiorPages, items, layouts] = await Promise.all([
    svc.listPagesForRender(livre.id, livre.page_count),
    svc.listContentItems(livre.id),
    catalog.listActiveLayouts()
  ]);
  const template = livre.template_id ? await catalog.getTemplateById(livre.template_id) : null;
  const pages = coverComposer.composeCoversIntoPages({ book: livre, items, template, interiorPages, format });

  console.log(`« ${livre.title} » — ${pages.length} pages, echelle ${production ? 'de production' : '1'}\n`);

  let pic = 0;
  const sonde = setInterval(() => { pic = Math.max(pic, process.memoryUsage().rss); }, 250);

  const rapports = [];
  const depart = Date.now();
  const chemin = await pdfService.renderPdfFromPages({
    book: livre, pages, items, layouts, format,
    ...(production ? {} : { scale: 1 }),
    fileBaseName: 'controle-progression',
    onProgress: (p) => {
      rapports.push({ ...p, a: Date.now() - depart });
      const mo = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
      process.stdout.write(`\r   ${p.phase ? `[${p.phase}] ` : ''}${p.done}/${p.total} — ${mo} Mo    `);
    }
  });
  clearInterval(sonde);
  console.log('\n');

  // Les rapports de capture n'ont pas de phase : c'est l'appelant qui nomme
  // la phase (meme convention que services/printing/gelatoPrintFile.js).
  const parPage = rapports.filter((r) => !r.phase);
  const assemblage = rapports.filter((r) => r.phase === 'assembling');

  check(rapports.length > 0, 'le rendu rapporte bien son avancement');
  check(parPage.length === pages.length, `un rapport par page rendue (${parPage.length} pour ${pages.length} pages)`);
  check(parPage.every((r) => r.total === pages.length), 'le TOTAL est connu des le premier rapport (la barre ne saute pas)');
  check(parPage.every((r, i) => r.done === i + 1), 'le compteur avance page par page, sans trou ni recul');
  check(assemblage.length === 1, "la phase d'assemblage est annoncee (la barre ne reste pas figee a 100%)");
  check(
    assemblage.length === 1 && parPage.length > 0 && assemblage[0].a >= parPage[parPage.length - 1].a,
    "l'assemblage est annonce APRES la derniere page"
  );

  const secondes = (Date.now() - depart) / 1000;
  const taille = fs.statSync(chemin).size;
  console.log('');
  console.log(`  duree            : ${(secondes / 60).toFixed(1)} min (${(secondes / pages.length).toFixed(1)} s/page)`);
  console.log(`  pic memoire Node : ${(pic / 1024 / 1024).toFixed(0)} Mo`);
  console.log(`  PDF produit      : ${(taille / 1024 / 1024).toFixed(1)} Mo`);
  if (production) {
    console.log('');
    console.log('  Le navigateur headless est un processus SEPARE, non mesure ici, mais');
    console.log("  il partage le plafond memoire de l'instance. Mesure du 2026-09-15 sur");
    console.log('  ce livre : ~311 Mo pour le navigateur, ~305 Mo pour Node, soit ~616 Mo');
    console.log("  au total — au-dessus des 512 Mo d'une instance Render Free/Starter.");
  }
  fs.unlinkSync(chemin);

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
