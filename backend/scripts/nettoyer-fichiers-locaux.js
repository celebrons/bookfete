// Supprime les PDF et HTML de travail devenus vieux, sur le DISQUE du serveur.
//
//   node scripts/nettoyer-fichiers-locaux.js              -> liste seulement
//   node scripts/nettoyer-fichiers-locaux.js --appliquer   -> supprime
//   node scripts/nettoyer-fichiers-locaux.js --jours 15 --appliquer
//
// A ne pas confondre avec nettoyer-fichiers-impression.js, qui s'occupe du
// stockage Supabase. Ici, c'est la place sur la machine.
//
// Chaque fabrication depose un PDF de ~43 Mo dans tmp/composition-preview, et
// rien ne les effacait. Mesure du 2026-09-19 sur le serveur Scaleway : disque
// a 81 %, 1,6 Go libres — soit environ trente-sept livres avant la panne. Un
// disque plein ne se manifeste pas par un message clair : le site se met a
// echouer un peu partout, sans raison apparente.
//
// POURQUOI GARDER TRENTE JOURS ET PAS TROIS
//
// Ces fichiers ne sont plus du brouillon : depuis le 2026-09-19, c'est le
// fichier sur le disque qui permet de retelecharger un PDF apres un
// redemarrage du serveur (les jobs vivent en memoire et n'y survivent pas).
// Les effacer trop tot rendrait a nouveau le bouton « telecharger » muet.
// Un mois laisse largement le temps a un client de recuperer son livre.
//
// Par prudence, le script ne supprime rien sans --appliquer.

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const APPLIQUER = args.includes('--appliquer');
// Number(x) || 30 vaut 30 quand x vaut ZERO : « --jours 0 » ne supprimait
// donc rien, en annoncant tranquillement qu il gardait tout. Constate le
// 2026-09-19, disque plein, en essayant de faire le menage en urgence.
const joursDemandes = Number(valeur('--jours', 30));
const JOURS = Number.isFinite(joursDemandes) && joursDemandes >= 0 ? joursDemandes : 30;

const DOSSIERS = [
  path.join(__dirname, '..', 'tmp', 'composition-preview'),
  path.join(__dirname, '..', 'tmp', 'pdf-exports')
];

const mo = (octets) => (octets / 1024 / 1024).toFixed(1);

const limite = Date.now() - JOURS * 24 * 60 * 60 * 1000;

let total = 0;
let poids = 0;
let gardes = 0;
let poidsGarde = 0;

console.log(`Menage des fichiers de travail — plus vieux que ${JOURS} jours\n`);

DOSSIERS.forEach((dossier) => {
  if (!fs.existsSync(dossier)) return;

  const fichiers = fs.readdirSync(dossier)
    .map((nom) => ({ nom, chemin: path.join(dossier, nom) }))
    .filter((f) => {
      try { return fs.statSync(f.chemin).isFile(); } catch (_e) { return false; }
    })
    .map((f) => ({ ...f, stat: fs.statSync(f.chemin) }));

  const aSupprimer = fichiers.filter((f) => f.stat.mtimeMs < limite);
  const aGarder = fichiers.filter((f) => f.stat.mtimeMs >= limite);

  gardes += aGarder.length;
  poidsGarde += aGarder.reduce((s, f) => s + f.stat.size, 0);

  if (aSupprimer.length === 0) return;

  console.log(`${path.basename(dossier)} : ${aSupprimer.length} fichier(s)`);
  aSupprimer.forEach((f) => {
    const age = Math.round((Date.now() - f.stat.mtimeMs) / 86400000);
    console.log(`  ${mo(f.stat.size).padStart(7)} Mo  ${age} j  ${f.nom.slice(0, 70)}`);
    total += 1;
    poids += f.stat.size;
    if (APPLIQUER) {
      try {
        fs.unlinkSync(f.chemin);
      } catch (error) {
        console.log(`    (suppression impossible : ${error.message})`);
      }
    }
  });
  console.log('');
});

// UN AGE NE SUFFIT PAS : IL FAUT UN PLAFOND DE TAILLE.
//
// Le 2026-09-19, le disque de la machine Scaleway s est rempli en une
// journee de tests — chaque fabrication laisse ~40 Mo — et la generation
// suivante a echoue sur « no space left on device ». La retention etait
// pourtant en place : trente jours, et rien n avait trente jours.
//
// On supprime donc AUSSI les plus anciens tant que le dossier depasse son
// budget, quel que soit leur age. L espace disque est une contrainte dure ;
// l age n est qu une preference.
const BUDGET_MO = Number(valeur('--budget', 1500)) || 1500;

if (poidsGarde / 1048576 > BUDGET_MO) {
  const restants = [];
  DOSSIERS.forEach((dossier) => {
    if (!fs.existsSync(dossier)) return;
    fs.readdirSync(dossier).forEach((nom) => {
      const chemin = path.join(dossier, nom);
      try {
        const stat = fs.statSync(chemin);
        if (stat.isFile()) restants.push({ chemin, nom, stat });
      } catch (_e) { /* disparu entre-temps */ }
    });
  });
  restants.sort((x, y) => x.stat.mtimeMs - y.stat.mtimeMs);

  let poidsCourant = restants.reduce((t, f) => t + f.stat.size, 0);
  const plafond = BUDGET_MO * 1048576;
  console.log(``);
  console.log(`Budget depasse : ${mo(poidsCourant)} Mo pour ${BUDGET_MO} Mo autorises.`);
  for (const f of restants) {
    if (poidsCourant <= plafond) break;
    console.log(`  ${mo(f.stat.size).padStart(7)} Mo  ${f.nom.slice(0, 60)}`);
    poidsCourant -= f.stat.size;
    total += 1;
    poids += f.stat.size;
    gardes -= 1;
    poidsGarde -= f.stat.size;
    if (APPLIQUER) {
      try { fs.unlinkSync(f.chemin); } catch (_e) { /* deja parti */ }
    }
  }
  console.log(``);
}

console.log(`A garder   : ${gardes} fichier(s), ${mo(poidsGarde)} Mo`);
console.log(
  total === 0
    ? 'A supprimer : rien'
    : `A supprimer : ${total} fichier(s), ${mo(poids)} Mo`
);
console.log(
  APPLIQUER
    ? '\nSupprimes.'
    : '\nRien supprime. Relancer avec --appliquer pour agir.'
);
