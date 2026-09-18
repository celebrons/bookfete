// Ce serveur est-il capable de faire tourner Celebrons ?
//
//   node scripts/check-serveur.js
//   node scripts/check-serveur.js --rendus 3      (par defaut 2)
//
// Ecrit pour valider une instance Scaleway DEV1-S avant toute migration
// (2026-09-18). A lancer SUR le serveur, apres le deploiement.
//
// Ce script est en LECTURE SEULE sur vos donnees reelles : il lit un livre
// existant pour rendre un vrai PDF, mais toute ecriture se fait sur un livre
// jetable qu'il cree et supprime lui-meme. Il ne touche ni Render, ni le
// stockage, ni aucune commande.
//
// Il repond a une question a la fois, dans l'ordre ou elles se posent :
// l'environnement, la base, les photos, l'ecriture, le rendu, la qualite du
// rendu, la tenue dans la duree, et la consommation de ressources.

require('dotenv').config();
const os = require('os');
const fs = require('fs');

const supabase = require('../config/supabase');
const pdfService = require('../services/composition/pdfService');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const coverComposer = require('../services/composition/coverComposer');
const sharp = require('../config/sharp');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const args = process.argv.slice(2);
const iRendus = args.indexOf('--rendus');
const NB_RENDUS = iRendus > -1 ? Math.max(1, Number(args[iRendus + 1]) || 2) : 2;

// --livre <mot> : choisir le livre a rendre. Sans lui, le script prend le
// premier livre compose venu — qui peut etre un petit format et donner une
// mesure trop optimiste. Le verdict doit porter sur le cas le plus lourd.
const iLivre = args.indexOf('--livre');
const RECHERCHE = iLivre > -1 ? String(args[iLivre + 1] || '').toLowerCase() : null;

const resultats = [];
const check = (cond, msg, detail = '') => {
  resultats.push({ ok: Boolean(cond), msg });
  console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg + (detail ? `   ${detail}` : ''));
  return Boolean(cond);
};
const info = (msg) => console.log(`  info  ${msg}`);
const titre = (t) => console.log(`\n=== ${t}`);

const mo = (octets) => Math.round(octets / 1024 / 1024);

// Les trois familles chargees par le rendu (voir pageRenderer.GOOGLE_FONTS_LINK).
const POLICES = 'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Playfair+Display:wght@400;500&family=Inter:wght@400;500;600;700';

(async () => {
  const depart = Date.now();

  // ------------------------------------------------------------ 1. La machine
  titre('1. La machine et son navigateur');
  info(`${os.type()} ${os.release()} — ${os.cpus().length} coeur(s), ${mo(os.totalmem())} Mo de RAM`);
  info(`node ${process.version}`);

  const majeur = Number(process.version.slice(1).split('.')[0]);
  check(majeur >= 18, `node ${process.version} convient (18 minimum)`);
  check(os.totalmem() >= 1.8 * 1024 * 1024 * 1024, `au moins 2 Go de RAM (${mo(os.totalmem())} Mo)`);

  const navigateur = await pdfService.resolveBrowserPath();
  check(Boolean(navigateur), 'un navigateur headless est disponible', navigateur || '');
  if (!navigateur) {
    console.log('\nSans navigateur, le rendu PDF est impossible. Voir deploy/install-serveur.sh.');
    process.exit(1);
  }

  // --------------------------------------------------------------- 2. La base
  titre('2. La base de donnees');
  let livres = [];
  try {
    const { data, error } = await supabase.from('books').select('id, title, page_count, print_format, owner_id');
    if (error) throw error;
    livres = data || [];
    check(true, `connexion Supabase etablie (${livres.length} livres)`);
  } catch (error) {
    check(false, 'connexion Supabase', error.message);
    process.exit(1);
  }

  // Un livre reel, composé, pour rendre un VRAI PDF.
  let livre = null;
  const candidats = RECHERCHE
    ? livres.filter((l) => (l.title || '').toLowerCase().includes(RECHERCHE))
    : livres;
  for (const candidat of candidats) {
    // eslint-disable-next-line no-await-in-loop
    const pages = await bookContentService.listPagesForRender(candidat.id, candidat.page_count);
    if (pages.length >= 4) { livre = { ...candidat, pages }; break; }
  }
  check(Boolean(livre), 'un livre existant est lisible et compose', livre ? `« ${livre.title} » (${livre.pages.length} pages)` : '');
  if (!livre) process.exit(1);

  const items = await bookContentService.listContentItems(livre.id);
  const photos = items.filter((i) => i.kind === 'photo' && i.url);
  check(photos.length > 0, `les photos du livre sont referencees (${photos.length})`);

  // ------------------------------------------------------------- 3. Les photos
  titre('3. Acces aux photos (stockage Supabase, inchange)');
  let photosLues = 0;
  for (const photo of photos.slice(0, 3)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const reponse = await fetch(photo.url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
      if (reponse.ok || reponse.status === 206) photosLues += 1;
    } catch (_error) { /* comptee comme echec */ }
  }
  check(photosLues === Math.min(3, photos.length), `les photos sont telechargeables depuis ce serveur (${photosLues}/${Math.min(3, photos.length)})`);

  // ------------------------------------------------------------- 4. Les polices
  titre('4. Polices (chargees depuis Google Fonts a chaque rendu)');
  try {
    const reponse = await fetch(`https://fonts.googleapis.com/css2?family=${POLICES}&display=swap`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120' }
    });
    const css = reponse.ok ? await reponse.text() : '';
    const familles = ['Cormorant Garamond', 'Playfair Display', 'Inter'].filter((f) => css.includes(f));
    check(familles.length === 3, `les 3 familles sont accessibles depuis ce serveur`, familles.join(', '));
    if (familles.length < 3) {
      info("sans elles, le rendu retombe sur des polices de substitution et la mise en page bouge");
    }
  } catch (error) {
    check(false, 'acces a Google Fonts', error.message);
  }

  // --------------------------------------------------------- 5. Ecriture (jetable)
  titre('5. Ecriture en base (sur un livre jetable, supprime ensuite)');
  let livreTest = null;
  try {
    const { data, error } = await supabase.from('books').insert({
      owner_id: livre.owner_id,
      // books.title est NOT NULL : une chaine vide plutot qu'une migration.
      title: '',
      page_count: 30,
      print_format: 'standard'
    }).select('id').single();
    if (error) throw error;
    livreTest = data.id;
    check(true, 'creation d un contenu de test');

    const { error: erreurModif } = await supabase.from('books')
      .update({ page_count: 32 }).eq('id', livreTest);
    check(!erreurModif, 'modification d un contenu de test', erreurModif?.message || '');
  } catch (error) {
    check(false, 'ecriture en base', error.message);
  } finally {
    if (livreTest) {
      const { error } = await supabase.from('books').delete().eq('id', livreTest);
      check(!error, 'le contenu de test a bien ete supprime (rien ne reste)', error?.message || '');
    }
  }

  // ------------------------------------------------------ 6. Le rendu PDF reel
  titre(`6. Generation de ${NB_RENDUS} vrai(s) PDF`);
  const format = { formatId: livre.print_format, ...resolveCoverFormat(livre.print_format), ...resolveFormatDensity(livre.print_format) };
  const layouts = await templateCatalog.listActiveLayouts();
  const template = null;
  const pages = coverComposer.composeCoversIntoPages({
    book: livre, items, template, interiorPages: livre.pages, format
  });

  const mesures = [];
  let dernierChemin = null;

  for (let tour = 1; tour <= NB_RENDUS; tour += 1) {
    let picMemoire = 0;
    const sonde = setInterval(() => { picMemoire = Math.max(picMemoire, process.memoryUsage().rss); }, 250);
    const cpuAvant = process.cpuUsage();
    const t0 = Date.now();

    try {
      // eslint-disable-next-line no-await-in-loop
      const chemin = await pdfService.renderPdfFromPages({
        book: livre, pages, items, layouts, format,
        fileBaseName: `check-serveur-${tour}`,
        onProgress: ({ phase, done, total }) => {
          process.stdout.write(`\r   rendu ${tour}/${NB_RENDUS} — ${phase || 'pages'} ${done}/${total} — ${mo(process.memoryUsage().rss)} Mo    `);
        }
      });
      clearInterval(sonde);
      const cpu = process.cpuUsage(cpuAvant);
      const secondes = (Date.now() - t0) / 1000;
      const taille = fs.statSync(chemin).size;
      mesures.push({ tour, secondes, picMemoire, taille, cpuMs: (cpu.user + cpu.system) / 1000 });
      if (dernierChemin && fs.existsSync(dernierChemin)) fs.unlinkSync(dernierChemin);
      dernierChemin = chemin;
      process.stdout.write('\r' + ' '.repeat(70) + '\r');
      check(true, `rendu ${tour} termine`, `${secondes.toFixed(0)} s, ${mo(taille)} Mo, pic ${mo(picMemoire)} Mo`);
    } catch (error) {
      clearInterval(sonde);
      process.stdout.write('\r' + ' '.repeat(70) + '\r');
      check(false, `rendu ${tour}`, error.message);
      break;
    }
  }

  check(mesures.length === NB_RENDUS, `le processus tient sur ${NB_RENDUS} generations consecutives`);

  // ------------------------------------------- 7. Le PDF produit est-il correct ?
  titre('7. Qualite du PDF produit');
  if (dernierChemin && fs.existsSync(dernierChemin)) {
    const donnees = fs.readFileSync(dernierChemin);

    const nbPages = Number((donnees.toString('latin1').match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/) || [])[1] || 0);
    // pages composees + couverture + 4e + la page blanche inseree apres la couverture
    const attendu = pages.length + 1;
    check(nbPages === attendu, `le document compte ${attendu} pages`, `trouve : ${nbPages}`);

    // Les images sont stockees telles quelles : on peut les relire et mesurer.
    const jpegs = [];
    let i = 0;
    while (i < donnees.length - 3) {
      if (donnees[i] === 0xFF && donnees[i + 1] === 0xD8 && donnees[i + 2] === 0xFF) {
        let j = i + 3;
        while (j < donnees.length - 1 && !(donnees[j] === 0xFF && donnees[j + 1] === 0xD9)) j += 1;
        if (j < donnees.length - 1) { jpegs.push(donnees.subarray(i, j + 2)); i = j + 2; continue; }
      }
      i += 1;
    }

    let riches = 0;
    let vides = 0;
    let dimensions = null;
    for (const buffer of jpegs) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const stats = await sharp(buffer).stats();
        // eslint-disable-next-line no-await-in-loop
        if (!dimensions) dimensions = await sharp(buffer).metadata();
        if (stats.entropy > 3) riches += 1; else vides += 1;
      } catch (_error) { /* pas une image */ }
    }

    info(`${jpegs.length} images dans le document — ${riches} riches, ${vides} quasi vides`);
    check(riches > 0, 'les photos sont bien integrees au PDF (pages non blanches)');

    if (dimensions) {
      // A l'echelle de production, une page doit faire trimWidth x trimHeight
      // en millimetres, soit 96/25.4 px/mm multiplies par l'echelle de capture.
      const largeurAttendue = Math.round(format.trimWidthMm * (96 / 25.4) * pdfService.SCREENSHOT_SCALE);
      const ecart = Math.abs(dimensions.width - largeurAttendue);
      info(`pages capturees en ${dimensions.width} x ${dimensions.height} px (attendu ~${largeurAttendue} de large)`);
      check(ecart <= 2, `les dimensions de page sont respectees (${format.trimWidthMm} x ${format.trimHeightMm} mm)`);
    }

    fs.unlinkSync(dernierChemin);
  } else {
    check(false, 'aucun PDF a inspecter');
  }

  // ------------------------------------------------- 8. Ressources et verdict
  titre('8. Ressources consommees');
  if (mesures.length > 0) {
    const picMax = Math.max(...mesures.map((m) => m.picMemoire));
    const dureeMoy = mesures.reduce((s, m) => s + m.secondes, 0) / mesures.length;
    const cpuMoy = mesures.reduce((s, m) => s + m.cpuMs, 0) / mesures.length;

    info(`duree moyenne d un rendu : ${(dureeMoy / 60).toFixed(1)} min pour ${pages.length} pages`);
    info(`pic memoire du processus node : ${mo(picMax)} Mo`);
    info(`temps processeur par rendu : ${(cpuMoy / 1000).toFixed(0)} s`);
    info(`charge moyenne systeme : ${os.loadavg().map((n) => n.toFixed(2)).join(' / ')}`);
    info(`memoire libre restante : ${mo(os.freemem())} Mo sur ${mo(os.totalmem())} Mo`);

    // Le navigateur est un processus SEPARE : il ne figure pas dans le pic
    // ci-dessus, mais il partage la RAM de la machine. Mesure sous Windows le
    // 2026-09-16 : ~250 Mo, stable du debut a la fin d'un livre.
    const besoinEstime = picMax + 250 * 1024 * 1024;
    info(`besoin total estime (node + navigateur) : ~${mo(besoinEstime)} Mo`);
    check(
      besoinEstime < os.totalmem() * 0.8,
      'la memoire de cette machine suffit, avec de la marge',
      `${mo(besoinEstime)} Mo requis sur ${mo(os.totalmem())} Mo`
    );
  }

  const echecs = resultats.filter((r) => !r.ok);
  console.log(`\n${'='.repeat(64)}`);
  console.log(`${resultats.length - echecs.length}/${resultats.length} verifications reussies en ${((Date.now() - depart) / 60000).toFixed(1)} min`);
  if (echecs.length > 0) {
    console.log('\nCe qui ne fonctionne pas :');
    echecs.forEach((e) => console.log(`  - ${e.msg}`));
  }
  console.log(echecs.length === 0 ? '\nVERDICT : ce serveur peut faire tourner Celebrons.' : `\nVERDICT : ${echecs.length} point(s) a regler avant de s'en servir.`);
  process.exit(echecs.length === 0 ? 0 : 1);
})();
