// Le fichier d'impression a-t-il la structure exigee par Gelato ?
//
//   node scripts/check-structure-gelato.js chemin/vers/fichier.pdf
//
// Le gabarit officiel (telecharge le 2026-09-16 pour un livre declare a 32
// pages) donne la regle : 1 couverture enveloppante, puis `pageCount` pages
// interieures dont la PREMIERE et la DERNIERE sont blanches (les gardes,
// collees aux plats). Soit `pageCount - 2` pages composables.
//
// On ne relit pas le code qui a produit le fichier : on lit le FICHIER. Les
// pages y sont des images ; une garde blanche se reconnait a son entropie
// quasi nulle, une page composee a la sienne, bien plus riche.

const fs = require('fs');
const path = require('path');
const sharp = require('../config/sharp');

const fichier = process.argv[2];
if (!fichier || !fs.existsSync(fichier)) {
  console.log('Usage : node scripts/check-structure-gelato.js <fichier.pdf>');
  process.exit(1);
}

let echecs = 0;
const check = (cond, msg) => { if (!cond) echecs += 1; console.log((cond ? '  OK  ' : ' ECHEC') + ' ' + msg); };

// Les images sont stockees telles quelles (DCTDecode) : un flux JPEG commence
// par FF D8 FF et se termine par FF D9. On les releve dans l'ordre du fichier,
// qui est celui des pages.
//
// Ce releve naif trouve aussi de faux positifs : la sequence FF D8 FF peut
// apparaitre par hasard dans des donnees compressees. On les ecarte en ne
// gardant que les images que sharp sait reellement decoder.
// Les pages interieures sont en JPEG, mais la couverture enveloppante est
// deposee en PNG : ne chercher que du JPEG la faisait disparaitre du releve,
// et le controle concluait a tort « aucune couverture ».
function extraireImages(donnees) {
  const trouves = [];
  const PNG_ENTETE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const PNG_FIN = Buffer.from('IEND', 'ascii');

  let i = 0;
  while (i < donnees.length - 8) {
    if (donnees[i] === 0xFF && donnees[i + 1] === 0xD8 && donnees[i + 2] === 0xFF) {
      let j = i + 3;
      while (j < donnees.length - 1) {
        if (donnees[j] === 0xFF && donnees[j + 1] === 0xD9) break;
        j += 1;
      }
      if (j < donnees.length - 1) {
        trouves.push(donnees.subarray(i, j + 2));
        i = j + 2;
        continue;
      }
    }
    if (donnees.subarray(i, i + 8).equals(PNG_ENTETE)) {
      const fin = donnees.indexOf(PNG_FIN, i);
      if (fin > -1) {
        trouves.push(donnees.subarray(i, fin + 8));
        i = fin + 8;
        continue;
      }
    }
    i += 1;
  }
  return trouves;
}

(async () => {
  const donnees = fs.readFileSync(fichier);
  const bruts = extraireImages(donnees);

  const images = [];
  for (const buffer of bruts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const meta = await sharp(buffer).metadata();
      // eslint-disable-next-line no-await-in-loop
      const stats = await sharp(buffer).stats();
      images.push({ buffer, width: meta.width, height: meta.height, entropie: stats.entropy });
    } catch (_err) {
      // faux positif : ce n'etait pas une image
    }
  }

  console.log(`${path.basename(fichier)} — ${images.length} images lisibles\n`);

  // Le nombre de pages se lit dans l'arbre des pages du PDF. La couverture,
  // elle, n'est pas relevable par signature : PDFKit la reencode (le PDF ne
  // stocke pas le PNG tel quel), contrairement aux pages interieures qui
  // restent des flux JPEG intacts. On la compte donc par difference.
  const totalPages = Number((donnees.toString('latin1').match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/) || [])[1] || 0);
  const interieur = images;

  console.log(`  info  ${totalPages} pages dans le document`);
  check(
    totalPages === interieur.length + 1,
    `1 couverture enveloppante + ${interieur.length} pages interieures = ${interieur.length + 1} pages attendues`
  );

  // Une garde blanche : entropie quasi nulle.
  const estBlanche = (im) => im.entropie < 0.5;
  const premiere = interieur[0];
  const derniere = interieur[interieur.length - 1];

  console.log(`  info  ${interieur.length} images interieures distinctes`);
  console.log(`  info  entropie de la 1re : ${premiere?.entropie.toFixed(2)}, de la derniere : ${derniere?.entropie.toFixed(2)}`);
  console.log('');

  check(premiere && estBlanche(premiere), 'la PREMIERE page interieure est une garde blanche');
  check(derniere && estBlanche(derniere), 'la DERNIERE page interieure est une garde blanche');

  const composables = interieur.filter((im) => !estBlanche(im));
  check(composables.length > 0, `des pages composees sont presentes (${composables.length})`);

  console.log(echecs === 0 ? '\nRESULTAT : OK' : `\nRESULTAT : ${echecs} echec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
})();
