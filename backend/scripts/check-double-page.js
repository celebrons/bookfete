// Sur une photo en double page, quelle MOITIE sort sur quelle page ?
//
//   node scripts/check-double-page.js
//
// Signale trois fois (2026-09-15, 16) : « les photos sur double page sont
// inversees — la partie gauche se retrouve sur la droite ».
//
// Les deux controles precedents disaient OK et le defaut restait : ils
// appelaient capturePagesAsImages DIRECTEMENT, avec des pages numerotees
// comme dans l'atelier. Or le PDF passe d'abord par composeCoversIntoPages,
// qui RENUMEROTE tout (`page_index: index`) pour placer la couverture en
// tete : la page interieure 0 devient l'index 1. Le rendu, lui, deduit la
// moitie a afficher de la PARITE de l'index — elle etait donc inversee dans
// le PDF, et seulement dans le PDF. Le controle passait a cote du seul
// endroit ou le defaut existait.
//
// Ici on suit donc la chaine ENTIERE, exactement comme l'export reel :
// composeCoversIntoPages -> capturePagesAsImages. Et on ne raisonne pas sur
// la parite : on pose une image DISSYMETRIQUE (moitie gauche ROUGE, moitie
// droite BLEUE) et on regarde la couleur qui sort de chaque page.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const sharp = require('../config/sharp');
const pdfService = require('../services/composition/pdfService');
const coverComposer = require('../services/composition/coverComposer');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

let echecs = 0;
const check = (cond, msg) => { if (!cond) echecs += 1; console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg); };

(async () => {
  const temoin = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 220, g: 30, b: 30 } }
  })
    .composite([{
      input: await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 30, g: 30, b: 220 } } }).png().toBuffer(),
      left: 1000,
      top: 0
    }])
    .png()
    .toBuffer();

  const chemin = path.join(os.tmpdir(), `temoin-double-page-${Date.now()}.png`);
  fs.writeFileSync(chemin, temoin);
  const url = pathToFileURL(chemin).href;

  const items = [{ id: 'p1', kind: 'photo', url, metadata: { width: 2000, height: 1000, orientation: 'landscape' } }];
  const layouts = [{ id: 'l-spread', slug: 'FULL_PHOTO_SPREAD', kind: 'photo' }];

  // Deux pages interieures consecutives portant la MEME photo : c'est ainsi
  // que l'atelier ecrit une double page.
  const pageInterieure = (index) => ({
    page_index: index,
    layout_id: 'l-spread',
    content: { kind: 'photo', blocks: [{ kind: 'photo', layoutId: 'l-spread', itemIds: ['p1'] }], itemIds: ['p1'] }
  });

  const formatId = 'standard';
  const format = { formatId, ...resolveCoverFormat(formatId), ...resolveFormatDensity(formatId) };

  // La double page occupe les pages interieures 4 et 5 (cas du livre reel).
  const interiorPages = [0, 1, 2, 3, 4, 5].map(pageInterieure);
  const book = { id: 'temoin', title: 'Temoin double page', print_format: formatId };

  // LA CHAINE REELLE : couvertures comprises, donc pages renumerotees.
  const pages = coverComposer.composeCoversIntoPages({
    book, items, template: null, interiorPages, format
  });

  const captures = await pdfService.capturePagesAsImages({
    book, pages, items, layouts, format, scale: 1
  });

  const teinte = async (buffer) => {
    const { dominant } = await sharp(buffer).stats();
    return dominant.r > dominant.b ? 'ROUGE' : 'BLEU';
  };

  // Dans le document final : couverture = page 1, page blanche inseree =
  // page 2, donc la page interieure i est la page PDF i + 3. Avec
  // /PageLayout TwoPageLeft, les pages impaires sont a GAUCHE : la page
  // interieure d'index PAIR est donc la page de GAUCHE de la double page.
  const captureDeLaPageInterieure = (i) => captures[i + 1]; // +1 : couverture en tete

  const gauche = await teinte(captureDeLaPageInterieure(4)); // interieure 4 (paire)
  const droite = await teinte(captureDeLaPageInterieure(5)); // interieure 5 (impaire)

  console.log('');
  console.log(`  page interieure 4 (PDF 7, a gauche)  -> moitie ${gauche === 'ROUGE' ? 'GAUCHE (rouge)' : 'DROITE (bleue)'}`);
  console.log(`  page interieure 5 (PDF 8, a droite)  -> moitie ${droite === 'ROUGE' ? 'GAUCHE (rouge)' : 'DROITE (bleue)'}`);
  console.log('');

  check(gauche !== droite, 'les deux pages montrent bien des moities DIFFERENTES');
  check(gauche === 'ROUGE', "la page de GAUCHE porte la moitie GAUCHE de l'image");
  check(droite === 'BLEU', "la page de DROITE porte la moitie DROITE de l'image");

  fs.unlinkSync(chemin);
  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s) — les moities sont inversees`);
  process.exit(echecs === 0 ? 0 : 1);
})();
