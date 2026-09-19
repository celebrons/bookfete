// A QUELLE TAILLE les photos sont-elles reellement dessinees dans le PDF ?
//
//   node scripts/check-taille-photos-pdf.js <fichier.pdf>
//
// Le 2026-09-19 : « le rendu PDF n'est pas bon, beaucoup de photos non
// fideles au livre ». Tous les compteurs disaient pourtant « bon » : 56
// images sur 56, aucune tronquee, bon nombre de feuilles.
//
// Ce qu'aucun de ces compteurs ne regardait : la SURFACE occupee par chaque
// photo sur sa page. Une photo intacte, posee dans un timbre-poste au milieu
// d'une page blanche, coche toutes les cases et ne ressemble a rien.
//
// Un PDF dessine une image en posant une matrice (operateur `cm`) puis en
// appelant l'image (`Do`). La matrice porte la largeur et la hauteur en
// points. C'est cette taille-la qu'on lit ici — celle que l'oeil verra.

const fs = require('fs');
const zlib = require('zlib');

const FICHIER = process.argv[2];
if (!FICHIER) { console.log('usage: node scripts/check-taille-photos-pdf.js <fichier.pdf>'); process.exit(1); }

const PT_PAR_MM = 72 / 25.4;
const donnees = fs.readFileSync(FICHIER);
const brut = donnees.toString('latin1');

// Taille des feuilles.
const mediaBox = [...brut.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
  .map((m) => ({ l: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) }));

// Les flux de contenu compresses.
const flux = [];
const re = /stream\r?\n/g;
let m;
while ((m = re.exec(brut)) !== null) {
  const debut = m.index + m[0].length;
  const fin = brut.indexOf('endstream', debut);
  if (fin === -1) continue;
  const morceau = donnees.subarray(debut, fin);
  try {
    flux.push(zlib.inflateSync(morceau).toString('latin1'));
  } catch (_error) { /* pas un flux compresse : image, police... */ }
}

const feuilleL = mediaBox.length ? mediaBox[0].l : 0;
const feuilleH = mediaBox.length ? mediaBox[0].h : 0;

console.log(`${FICHIER}`);
console.log(`feuille : ${Math.round(feuilleL / PT_PAR_MM)} x ${Math.round(feuilleH / PT_PAR_MM)} mm`);
console.log(`flux de contenu lisibles : ${flux.length}`);
console.log('');

const surfaceFeuille = feuilleL * feuilleH;
let total = 0;
let minuscules = 0;
const tailles = [];

flux.forEach((contenu, index) => {
  // `a 0 0 d e f cm` puis, plus loin, `/X Do`. a = largeur, d = hauteur.
  const poses = [...contenu.matchAll(/([\d.-]+)\s+0\s+0\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+cm\s+(?:[^]{0,200}?)\/(\w+)\s+Do/g)];
  poses.forEach((p) => {
    const largeur = Math.abs(Number(p[1]));
    const hauteur = Math.abs(Number(p[2]));
    if (!largeur || !hauteur || largeur < 5) return;
    total += 1;
    const part = (largeur * hauteur) / surfaceFeuille;
    tailles.push({ feuille: index, mm: `${Math.round(largeur / PT_PAR_MM)}x${Math.round(hauteur / PT_PAR_MM)}`, part });
    if (part < 0.05) minuscules += 1;
  });
});

if (total === 0) {
  console.log('Aucune pose d image lisible (flux non compresses ou format inattendu).');
  process.exit(0);
}

tailles.sort((a, b) => a.part - b.part);
console.log('  les plus petites poses :');
tailles.slice(0, 10).forEach((t) => {
  console.log(`    feuille ${String(t.feuille).padStart(2)}  ${t.mm.padEnd(10)} mm   ${(t.part * 100).toFixed(1)} % de la feuille`);
});
console.log('');
console.log(`  poses d images        : ${total}`);
console.log(`  couvrant moins de 5 % : ${minuscules}`);
console.log('');
console.log(
  minuscules > 0
    ? ` ECHEC ${minuscules} photo(s) tiennent dans moins de 5 % de leur feuille`
    : '  OK   aucune photo reduite a un timbre-poste'
);
process.exit(minuscules > 0 ? 1 : 0);
