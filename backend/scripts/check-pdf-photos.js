// Les photos apparaissent-elles REELLEMENT dans le PDF ?
//
//   node scripts/check-pdf-photos.js            -> le livre dont le titre contient "montr"
//   node scripts/check-pdf-photos.js "60 ans"   -> un autre livre
//
// Pourquoi ce script existe : le 2026-09-15, un PDF genere depuis un vrai
// livre est arrive avec des pages entierement blanches, une image tronquee, et
// la photo de 4e de couverture absente. Aucun test ne pouvait le voir — ils
// comparent du HTML, or le HTML etait PARFAIT. Le defaut etait dans la
// CAPTURE : `Page.navigate` rend la main des que la navigation commence, et le
// client CDP ignorait les evenements, donc impossible d'attendre le
// chargement. On sondait `document.images` sur une page parfois pas encore
// analysee : liste vide, attente terminee aussitot, capture d'une page
// blanche. Une COURSE, gagnee sur les pages legeres et perdue sur les autres —
// d'ou des absences apparemment aleatoires.
//
// On ne verifie donc pas le HTML : on capture pour de vrai et on MESURE les
// pixels. L'entropie d'une image dit sa richesse : proche de 0 pour une page
// blanche, au-dela de 4 pour une photo.
//
// Verifie le 2026-09-15 que ce controle attrape bien le defaut pour lequel il
// a ete ecrit : en retablissant la course, il remonte 6 echecs dont quatre
// pages a 0,00 d'entropie.

require('dotenv').config();
const sharp = require('../config/sharp');
const supabase = require('../config/supabase');
const svc = require('../services/composition/bookContentService');
const catalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const pdfService = require('../services/composition/pdfService');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

let echecs = 0;
const check = (cond, msg) => { if (!cond) echecs += 1; console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg); };

// Une page contenant une photo a des centaines de teintes distinctes ;
// une page de texte sur fond creme en a quelques dizaines au plus.
const SEUIL_COULEURS = 400;

(async () => {
  const { data: books } = await supabase.from('books').select('*');
  const livre = books.find((b) => (b.title || '').toLowerCase().includes(process.argv[2] || 'montr'));
  if (!livre) { console.log('livre introuvable'); process.exit(1); }

  const format = { formatId: livre.print_format, ...resolveCoverFormat(livre.print_format), ...resolveFormatDensity(livre.print_format) };
  const [interiorPages, items, layouts] = await Promise.all([
    svc.listPagesForRender(livre.id, livre.page_count),
    svc.listContentItems(livre.id),
    catalog.listActiveLayouts()
  ]);
  const template = livre.template_id ? await catalog.getTemplateById(livre.template_id) : null;
  const pages = coverComposer.composeCoversIntoPages({ book: livre, items, template, interiorPages, format });

  const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
  const layoutsById = Object.fromEntries(layouts.map((l) => [l.id, l]));

  // Quelles pages DOIVENT contenir au moins une photo ?
  const attenduAvecPhoto = pages.map((page) => {
    const ids = [
      ...(page.content?.itemIds || []),
      ...((page.content?.blocks || []).flatMap((b) => b.itemIds || []))
    ].filter(Boolean);
    return ids.some((id) => itemsById[id]?.kind === 'photo');
  });

  const nbAttendues = attenduAvecPhoto.filter(Boolean).length;
  console.log(`« ${livre.title} » — ${pages.length} pages (couvertures comprises), ${nbAttendues} devraient porter une photo\n`);

  // Echelle 1 : on verifie la PRESENCE des photos, pas leur finesse. A
  // l'echelle de production (3), ce controle prendrait plusieurs minutes.
  const captures = await pdfService.capturePagesAsImages({
    book: livre, pages, items, layouts, format, scale: 1
  });

  let manquantes = 0;
  for (let i = 0; i < captures.length; i += 1) {
    /* eslint-disable no-await-in-loop */
    const stats = await sharp(captures[i]).stats();
    // `entropy` mesure la richesse de l'image : une page blanche est proche
    // de 0, une photo depasse largement 4.
    const entropie = stats.entropy;
    const doitAvoirPhoto = attenduAvecPhoto[i];
    const semblePhoto = entropie > 3;

    // Les couvertures sont exclues de ce controle global : leur photo est un
    // encart, pas une page pleine (voir le controle dedie plus bas).
    const estCouverture = i === 0 || i === captures.length - 1;
    if (doitAvoirPhoto && !semblePhoto && !estCouverture) {
      manquantes += 1;
      const nom = i === 0 ? 'couverture' : (i === captures.length - 1 ? '4e de couverture' : `page ${i}`);
      console.log(`   ⚠️  ${nom} : photo attendue, page quasi vide (entropie ${entropie.toFixed(2)})`);
    }
  }

  check(manquantes === 0, `toutes les photos des pages interieures sont presentes (${manquantes} manquante(s))`);

  // La 4e de couverture merite un controle a part : c'est elle qui manquait.
  //
  // Mesurer l'entropie de la page ENTIERE ne convient pas ici : la photo de
  // 4e n'occupe qu'un encart (55% x 28%, soit ~13% de la surface), le reste
  // etant un aplat. Une page avec photo et une page sans donnent toutes deux
  // une entropie basse — le test disait « manquante » alors qu'elle etait
  // bien la. On recadre donc sur la zone de l'encart, et on y exige une vraie
  // richesse d'image.
  const quatrieme = pages[pages.length - 1];
  const aUnePhoto = (quatrieme.content?.itemIds || []).filter(Boolean).length > 0;
  if (aUnePhoto) {
    const capture = captures[captures.length - 1];
    const meta = await sharp(capture).metadata();
    // `stats()` mesure l'image D'ENTREE, sans appliquer les operations du
    // pipeline : enchainer `.extract().stats()` renvoyait donc l'entropie de
    // la page entiere, exactement le chiffre qu'on cherchait a eviter. Il faut
    // materialiser le recadrage en buffer, puis repartir de ce buffer.
    const recadre = await sharp(capture)
      .extract({
        left: Math.round(meta.width * 0.34),
        top: Math.round(meta.height * 0.36),
        width: Math.round(meta.width * 0.32),
        height: Math.round(meta.height * 0.18)
      })
      .toBuffer();
    const encart = await sharp(recadre).stats();
    check(encart.entropy > 4, `la 4e de couverture porte bien sa photo (entropie de l encart ${encart.entropy.toFixed(2)})`);
  } else {
    console.log('  info  la 4e de couverture n a pas de photo dans ce livre');
  }

  // La double page : les DEUX moities doivent etre remplies.
  const spreadIndexes = [];
  interiorPages.forEach((page, idx) => {
    const slug = page.layout_id ? layoutsById[page.layout_id]?.slug : null;
    if (slug === 'FULL_PHOTO_SPREAD') spreadIndexes.push(idx);
  });
  if (spreadIndexes.length === 0) {
    console.log('  info  aucune photo sur double page dans ce livre');
  } else {
    console.log(`  info  double(s) page(s) aux pages ${spreadIndexes.map((i) => i + 1).join(', ')}`);
    for (const idx of spreadIndexes) {
      const st = await sharp(captures[idx + 1]).stats(); // +1 : la couverture est en tete
      check(st.entropy > 3, `la moitie de la page ${idx + 1} est bien remplie (entropie ${st.entropy.toFixed(2)})`);
    }
  }

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
