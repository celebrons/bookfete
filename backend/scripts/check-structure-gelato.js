// LE FICHIER D'IMPRESSION RESPECTE-T-IL LES REGLES DE GELATO ?
//
//   node scripts/check-structure-gelato.js <fichier.pdf>
//   node scripts/check-structure-gelato.js <fichier.pdf> --pages 30
//
// Les regles, validees avec Gelato et jamais remises en cause :
//
//   1. UN SEUL fichier PDF.
//   2. Page 1 = la couverture enveloppante, a SA taille (plus large que
//      l'interieur : elle couvre plat avant, dos et plat arriere).
//   3. Pages 2..N = le cahier interieur, toutes a la MEME taille
//      (trim + 3 mm de fond perdu par cote).
//   4. Le cahier compte EXACTEMENT pageCount + 2 pages.
//   5. La PREMIERE et la DERNIERE page interieure sont BLANCHES : ce sont
//      les gardes, collees aux plats de la couverture.
//
// Un fichier a 35 pages au lieu de 33 a deja ete refuse par Gelato avec
// « Product requires exactly 33 page(s), while file(s) contain 35 page(s) »
// (2026-09-16). Ce controle existe pour que ca n'arrive plus.
//
// REECRIT le 2026-09-19. L'ancienne version deduisait les pages du nombre
// d'IMAGES : elle supposait une image pleine page par page, ce qui n'est
// vrai que de l'ancienne methode par captures. Depuis que Chrome ecrit le
// PDF lui-meme, une page porte autant d'images qu'elle a de photos — et le
// controleur annoncait 8 pages pour un fichier qui en comptait 33. Il lit
// maintenant la STRUCTURE du PDF, pas son contenu graphique.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FICHIER = process.argv[2];
const args = process.argv.slice(2);
const iPages = args.indexOf('--pages');
const PAGES_DECLAREES = iPages > -1 ? Number(args[iPages + 1]) : null;

if (!FICHIER) {
  console.log('usage: node scripts/check-structure-gelato.js <fichier.pdf> [--pages 30]');
  process.exit(1);
}

const PT_PAR_MM = 72 / 25.4;
let echecs = 0;
const check = (cond, msg, detail = '') => {
  if (!cond) echecs += 1;
  console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg + (detail ? `   ${detail}` : ''));
};
const info = (msg) => console.log(`  info  ${msg}`);

const donnees = fs.readFileSync(FICHIER);
const brut = donnees.toString('latin1');

// Les objets du PDF, par numero. Sert a retrouver le flux de contenu d'une
// page a partir de sa reference /Contents.
const objets = new Map();
for (const m of brut.matchAll(/(\d+)\s+0\s+obj\b/g)) {
  objets.set(Number(m[1]), m.index);
}

// Le flux d'un objet, decompresse quand il l'est.
const fluxDe = (numero) => {
  const debut = objets.get(numero);
  if (debut === undefined) return '';
  const finObjet = brut.indexOf('endobj', debut);
  const entete = brut.slice(debut, finObjet);
  const m = /stream\r?\n/.exec(entete);
  if (!m) return '';
  const debutFlux = debut + m.index + m[0].length;
  const finFlux = brut.indexOf('endstream', debutFlux);
  if (finFlux === -1) return '';
  const morceau = donnees.subarray(debutFlux, finFlux);
  if (entete.includes('/FlateDecode')) {
    try {
      return zlib.inflateSync(morceau).toString('latin1');
    } catch (_error) {
      return '';
    }
  }
  return morceau.toString('latin1');
};

// LES PAGES. On compte les objets /Type /Page, jamais un /Count : Chrome
// range ses pages dans un arbre equilibre ou plusieurs noeuds portent un
// compte PARTIEL. Prendre le premier venu donne un chiffre faux — erreur
// commise le 2026-09-18 (8 pages annoncees au lieu de 32).
const pages = [];
for (const m of brut.matchAll(/(\d+)\s+0\s+obj\s*<<([^]*?)>>\s*(?:stream|endobj)/g)) {
  const corps = m[2];
  if (!/\/Type\s*\/Page[^s]/.test(corps)) continue;
  const boite = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/.exec(corps);
  const contenu = /\/Contents\s+(\d+)\s+0\s+R/.exec(corps);
  pages.push({
    numero: Number(m[1]),
    largeurMm: boite ? Math.round(((Number(boite[3]) - Number(boite[1])) / PT_PAR_MM) * 10) / 10 : null,
    hauteurMm: boite ? Math.round(((Number(boite[4]) - Number(boite[2])) / PT_PAR_MM) * 10) / 10 : null,
    contenu: contenu ? Number(contenu[1]) : null
  });
}

console.log(`${path.basename(FICHIER)} — ${(donnees.length / 1048576).toFixed(1)} Mo\n`);

check(pages.length > 0, 'le fichier contient des pages lisibles');
if (!pages.length) process.exit(1);

info(`${pages.length} pages dans le document`);

// --- Regle 2 : la couverture est la premiere page, et plus large.
const couverture = pages[0];
const interieures = pages.slice(1);
info(`couverture : ${couverture.largeurMm} x ${couverture.hauteurMm} mm`);

check(
  couverture.largeurMm > (interieures[0]?.largeurMm || 0),
  'la premiere page est la couverture enveloppante (plus large que l interieur)',
  `${couverture.largeurMm} contre ${interieures[0]?.largeurMm} mm`
);

// --- Regle 3 : toutes les pages interieures a la meme taille.
const taillesInterieures = [...new Set(interieures.map((p) => `${p.largeurMm}x${p.hauteurMm}`))];
info(`interieur : ${taillesInterieures.join(', ')} mm`);
check(
  taillesInterieures.length === 1,
  'toutes les pages interieures ont la meme taille',
  taillesInterieures.length > 1 ? taillesInterieures.join(' / ') : ''
);

// --- Regle 4 : le compte, quand il est connu.
if (Number.isFinite(PAGES_DECLAREES) && PAGES_DECLAREES > 0) {
  const attendu = PAGES_DECLAREES + 2;
  check(
    interieures.length === attendu,
    `le cahier compte ${attendu} pages (${PAGES_DECLAREES} declarees + 2 gardes)`,
    `trouve ${interieures.length}`
  );
  check(
    pages.length === attendu + 1,
    `le fichier compte ${attendu + 1} pages en tout`,
    `trouve ${pages.length}`
  );
} else {
  info(`cahier de ${interieures.length} pages — passez --pages <n> pour verifier le compte`);
}

// --- Regle 5 : les gardes sont BLANCHES.
//
// Une page est BLANCHE de deux facons, selon la methode de fabrication :
//
//   - rendu par impression : elle ne dessine rien du tout ;
//   - rendu par captures : elle dessine UNE image pleine page... qui est la
//     photographie d'une page vide.
//
// Un controle qui ne connaitrait que la premiere declarerait non conforme un
// fichier de l'ancienne methode qui l'est parfaitement. On regarde donc aussi
// CE QUE PESE l'image : une page uniforme compresse en quelques kilo-octets,
// une page de photos en centaines.
const jpegsDuPdf = (() => {
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
})();

// Mesure du 2026-09-19 sur un vrai fichier : une garde blanche pese 46 Ko
// en 2449x3243, une page composee entre 941 et 1361 Ko. Le seuil se pose
// donc largement entre les deux.
const SEUIL_IMAGE_VIDE_KO = 200;

// Le rapprochement image <-> page n'est legitime QUE si le fichier porte
// exactement une image par page INTERIEURE : c'est la signature du rendu
// par captures. La couverture, elle, est un PNG et n'apparait pas dans
// cette liste — l'image d'indice i est donc la page interieure d'indice i.
//
// Le rendu par impression pose autant d'images qu'il y a de photos, et ses
// pages blanches ne dessinent rien du tout : on n'arrive jamais jusqu'ici.
const uneImageParPage = jpegsDuPdf.length === interieures.length;

const dessineQuelqueChose = (page, indexDansLeDocument = -1) => {
  if (!page.contenu) return false;
  const flux = fluxDe(page.contenu);
  if (/\b(Tj|TJ)\b/.test(flux)) return true;
  if (!/\bDo\b/.test(flux)) return false;

  // La page dessine une image : est-elle vide ?
  if (uneImageParPage && indexDansLeDocument >= 0) {
    const image = jpegsDuPdf[indexDansLeDocument];
    if (image) return image.length > SEUIL_IMAGE_VIDE_KO * 1024;
  }
  return true;
};

const premiere = interieures[0];
const derniere = interieures[interieures.length - 1];

check(
  premiere && !dessineQuelqueChose(premiere, 0),
  'la PREMIERE page interieure est une garde blanche'
);
check(
  derniere && !dessineQuelqueChose(derniere, interieures.length - 1),
  'la DERNIERE page interieure est une garde blanche'
);

// --- Et le reste n'est pas vide, sinon le livre le serait.
const composees = interieures.filter(dessineQuelqueChose).length;
info(`${composees} pages interieures portent du contenu`);
check(composees > 0, 'des pages composees sont presentes');

console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
process.exit(echecs === 0 ? 0 : 1);
