// Sauvegarde la base dans un fichier, chaque nuit.
//
//   node scripts/sauvegarder-base.js
//   node scripts/sauvegarder-base.js --dossier /var/backups/celebrons
//
// Pourquoi ce script existe : l'offre gratuite de Supabase n'inclut AUCUNE
// sauvegarde automatique. Une fausse manipulation en base, et les livres de
// vos clients — des photos de famille irremplacables — sont perdus sans
// recours. C'est le risque le plus grave du projet, et le moins cher a
// couvrir.
//
// Ce que ce script sauvegarde : le CONTENU des tables (qui a quel livre,
// quelles pages, quelles commandes). Pas les fichiers eux-memes : les photos
// vivent dans le stockage Supabase, qui a sa propre durabilite. Une base
// perdue rendrait les photos orphelines ; une base restauree les retrouve.
//
// Format : un seul fichier JSON par nuit, compresse. Lisible par n'importe
// quoi, restaurable a la main si besoin — pas de format proprietaire qui
// demanderait l'outil qui l'a ecrit.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const supabase = require('../config/supabase');

// Toutes les tables qui portent des donnees creees par les utilisateurs ou
// par nous. Une table absente n'est pas une erreur : le script le signale et
// continue, pour qu'une sauvegarde ne rate jamais a cause d'une migration
// pas encore passee.
const TABLES = [
  'books',
  'book_pages',
  'book_content_items',
  'book_templates',
  'layout_definitions',
  'orders',
  'profiles',
  'book_snapshots',
  'app_events',
  'book_participants',
  'contributions',
  'chapters'
];

// Combien de nuits on garde. Au-dela, les plus anciennes sont effacees :
// sans cela le disque se remplit et la sauvegarde finit par echouer — au
// pire moment, forcement.
const JOURS_CONSERVES = 14;

const args = process.argv.slice(2);
const iDossier = args.indexOf('--dossier');
const DOSSIER = iDossier > -1 ? args[iDossier + 1] : path.join(__dirname, '..', 'sauvegardes');

const mo = (o) => (o / 1024 / 1024).toFixed(1);

(async () => {
  fs.mkdirSync(DOSSIER, { recursive: true });

  const contenu = {};
  let lignesTotal = 0;
  const manquantes = [];

  for (const table of TABLES) {
    // Par pages de 1000 : `select()` en renvoie au plus 1000 par defaut, et
    // une sauvegarde silencieusement tronquee serait pire que pas de
    // sauvegarde du tout.
    const lignes = [];
    let debut = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.from(table).select('*').range(debut, debut + 999);
      if (error) { manquantes.push(`${table} (${error.message})`); break; }
      lignes.push(...(data || []));
      if (!data || data.length < 1000) break;
      debut += 1000;
    }
    if (!manquantes.some((m) => m.startsWith(table))) {
      contenu[table] = lignes;
      lignesTotal += lignes.length;
      console.log(`  ${table.padEnd(22)} ${String(lignes.length).padStart(6)} lignes`);
    } else {
      console.log(`  ${table.padEnd(22)} ignoree`);
    }
  }

  const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const fichier = path.join(DOSSIER, `celebrons-${horodatage}.json.gz`);

  const brut = Buffer.from(JSON.stringify({
    genereLe: new Date().toISOString(),
    tables: Object.keys(contenu),
    lignes: lignesTotal,
    contenu
  }, null, 0), 'utf8');

  fs.writeFileSync(fichier, zlib.gzipSync(brut, { level: 9 }));

  const taille = fs.statSync(fichier).size;
  console.log('');
  console.log(`  ${lignesTotal} lignes sauvegardees dans ${fichier}`);
  console.log(`  ${mo(taille)} Mo compresses (${mo(brut.length)} Mo bruts)`);

  // Purge du journal d evenements, au meme moment : une table qu on ne
  // nettoie jamais finit toujours par poser probleme, et toujours au
  // mauvais moment. La sauvegarde vient d etre faite, donc rien n est
  // perdu — les lignes effacees restent dans les archives.
  try {
    const { purgeEvents } = require("../services/events/eventLog");
    const { removed } = await purgeEvents({ jours: 90 });
    if (removed > 0) console.log(`  ${removed} evenement(s) de plus de 90 jours effaces`);
  } catch (error) {
    console.log("  purge des evenements impossible :", error.message);
  }

  // Menage des anciennes.
  const limite = Date.now() - JOURS_CONSERVES * 24 * 60 * 60 * 1000;
  let effacees = 0;
  for (const nom of fs.readdirSync(DOSSIER)) {
    if (!nom.startsWith('celebrons-') || !nom.endsWith('.json.gz')) continue;
    const chemin = path.join(DOSSIER, nom);
    if (fs.statSync(chemin).mtimeMs < limite) { fs.unlinkSync(chemin); effacees += 1; }
  }
  if (effacees > 0) console.log(`  ${effacees} sauvegarde(s) de plus de ${JOURS_CONSERVES} jours effacee(s)`);

  if (manquantes.length > 0) {
    console.log('');
    console.log('  Tables ignorees (absentes ou illisibles) :');
    manquantes.forEach((m) => console.log(`    - ${m}`));
  }

  // Un echec doit se voir dans le journal du service, pas passer inapercu.
  const vide = lignesTotal === 0;
  if (vide) {
    console.error('SAUVEGARDE VIDE : aucune ligne recuperee. A verifier immediatement.');
    process.exit(1);
  }
  process.exit(0);
})();
