// Etat de sante du serveur, lisible depuis l'application.
//
// Demande du 2026-09-18 : voir les consommations et les performances sans
// ouvrir de terminal.
//
// Volontairement limite a ce qui se lit depuis Node, donc DISPONIBLE PARTOUT
// — en local, sur Render, sur Scaleway. Les journaux systeme n'en font pas
// partie : `journalctl` demande des privileges et n'existe que sous Linux
// avec systemd. Les erreurs applicatives, elles, sont enregistrees dans le
// journal des evenements (eventLog), qui a l'avantage de fonctionner sur les
// trois environnements et de se lire au meme endroit.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { environnement } = require('./eventLog');

const mo = (octets) => Math.round(octets / 1024 / 1024);

// Espace disque de la partition qui porte l'application. `df` n'existe pas
// sous Windows : on renvoie null plutot que d'inventer, et l'ecran affiche
// alors un tiret.
function disque() {
  if (process.platform === 'win32') return null;
  try {
    const sortie = execSync('df -k / | tail -1', { encoding: 'utf8', timeout: 5000 });
    const colonnes = sortie.trim().split(/\s+/);
    const total = Number(colonnes[1]) * 1024;
    const utilise = Number(colonnes[2]) * 1024;
    if (!Number.isFinite(total) || total <= 0) return null;
    return { totalMo: mo(total), utiliseMo: mo(utilise), pourcent: Math.round((utilise / total) * 100) };
  } catch (_error) {
    return null;
  }
}

// La version deployee. Lue depuis git : c'est la seule source qui ne puisse
// pas mentir sur ce que le serveur execute reellement.
function version() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: path.join(__dirname, '..', '..'),
      encoding: 'utf8',
      timeout: 5000
    }).trim();
  } catch (_error) {
    return null;
  }
}

// Un rendu PDF lance un navigateur separe : sa presence est le signe le plus
// fiable qu'une generation tourne, et sa memoire est invisible autrement.
function navigateursDeRendu() {
  if (process.platform === 'win32') return null;
  try {
    const sortie = execSync(
      "ps -eo rss,args | grep -- '--headless' | grep -v grep || true",
      { encoding: 'utf8', timeout: 5000 }
    );
    const lignes = sortie.trim().split('\n').filter(Boolean);
    const memoire = lignes.reduce((total, l) => total + (Number(l.trim().split(/\s+/)[0]) || 0), 0);
    return { processus: lignes.length, memoireMo: Math.round(memoire / 1024) };
  } catch (_error) {
    return null;
  }
}

// La derniere sauvegarde. Son absence est en soi une information — c'est le
// filet qui remplace celui que l'offre gratuite de Supabase ne fournit pas.
function derniereSauvegarde() {
  const dossiers = [
    '/home/celebrons/sauvegardes',
    path.join(__dirname, '..', '..', 'sauvegardes')
  ];
  for (const dossier of dossiers) {
    try {
      if (!fs.existsSync(dossier)) continue;
      const fichiers = fs.readdirSync(dossier)
        .filter((n) => n.endsWith('.json.gz'))
        .map((n) => ({ nom: n, stat: fs.statSync(path.join(dossier, n)) }))
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
      if (fichiers.length === 0) continue;
      return {
        quand: new Date(fichiers[0].stat.mtimeMs).toISOString(),
        tailleMo: Number((fichiers[0].stat.size / 1024 / 1024).toFixed(2)),
        nombre: fichiers.length
      };
    } catch (_error) { /* dossier illisible : on essaie le suivant */ }
  }
  return null;
}

/**
 * Photographie de l'etat du serveur a l'instant present.
 *
 * Ne leve jamais : chaque mesure qui echoue vaut null, et l'ecran affiche un
 * tiret. Une page de supervision qui plante au moment ou ca va mal serait
 * une mauvaise plaisanterie.
 */
function etatServeur({ rendusEnCours = null } = {}) {
  const memoireProcessus = process.memoryUsage();
  const coeurs = os.cpus().length || 1;
  const charge = os.loadavg();

  return {
    environnement: environnement(),
    version: version(),
    node: process.version,
    plateforme: `${os.type()} ${os.release()}`,

    // Depuis quand le service tourne. Un redemarrage recent qu'on n'a pas
    // provoque soi-meme est le premier signe d'un plantage.
    demarreDepuisSecondes: Math.round(process.uptime()),
    machineDemarreeDepuisSecondes: Math.round(os.uptime()),

    memoire: {
      processusMo: mo(memoireProcessus.rss),
      machineUtiliseeMo: mo(os.totalmem() - os.freemem()),
      machineTotaleMo: mo(os.totalmem()),
      machineLibreMo: mo(os.freemem())
    },

    processeur: {
      coeurs,
      // La charge est un nombre de processus en attente : rapportee au
      // nombre de coeurs, elle devient un pourcentage comprehensible.
      charge1min: Number(charge[0].toFixed(2)),
      charge5min: Number(charge[1].toFixed(2)),
      charge15min: Number(charge[2].toFixed(2)),
      pourcent1min: Math.round((charge[0] / coeurs) * 100)
    },

    disque: disque(),
    navigateursDeRendu: navigateursDeRendu(),
    rendusEnCours,
    derniereSauvegarde: derniereSauvegarde(),
    mesureLe: new Date().toISOString()
  };
}

module.exports = { etatServeur };
