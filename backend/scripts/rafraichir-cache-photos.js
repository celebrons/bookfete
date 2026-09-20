// Remettre a jour l'en-tete de cache des photos deja deposees.
//
//   node scripts/rafraichir-cache-photos.js              (simulation)
//   node scripts/rafraichir-cache-photos.js --appliquer
//   node scripts/rafraichir-cache-photos.js --appliquer --originaux
//
// Les fichiers deposes avant le 2026-09-20 portent `max-age=3600` : une
// heure. Ils sont pourtant immuables (leur nom porte un identifiant unique),
// et storageService pose desormais un an sur les nouveaux depots. Ce script
// aligne les anciens.
//
// POURQUOI SEULEMENT LES DERIVEES PAR DEFAUT.
//
// Supabase ne sait pas changer un en-tete de cache sans reecrire le fichier :
// il faut donc le telecharger puis le redeposer. Sur ce projet :
//
//   derivees (preview + vignette)  710 fichiers, ~0,09 Go
//   originaux                      425 fichiers, ~0,43 Go
//
// Les derivees sont ce que le navigateur demande a chaque page depuis que le
// moteur de rendu les utilise (voir photoSource.js) : les rafraichir coute
// 0,09 Go une fois et supprime des retelechargements quotidiens. Les
// originaux, eux, ne sont plus servis qu'au massicot — les reecrire
// couterait 0,86 Go (aller-retour) pour presque rien. D'ou `--originaux`,
// qui existe mais n'est pas le defaut.
//
// Simulation par defaut : rien n'est ecrit sans `--appliquer`.

require('dotenv').config();
const supabase = require('../config/supabase');

const BUCKET = 'contribution-photos';
const CACHE_UN_AN = '31536000, immutable';

const args = process.argv.slice(2);
const APPLIQUER = args.includes('--appliquer');
const INCLURE_ORIGINAUX = args.includes('--originaux');

const mo = (o) => `${(o / 1024 / 1024).toFixed(1)} Mo`;

async function listerRecursivement(prefixe = '', profondeur = 0) {
  if (profondeur > 3) return [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefixe, { limit: 1000 });
  if (error) throw new Error(`list(${prefixe}) : ${error.message}`);

  const fichiers = [];
  for (const entree of data || []) {
    const chemin = prefixe ? `${prefixe}/${entree.name}` : entree.name;
    if (!entree.id) {
      // eslint-disable-next-line no-await-in-loop
      fichiers.push(...await listerRecursivement(chemin, profondeur + 1));
    } else {
      fichiers.push({
        chemin,
        taille: entree.metadata?.size || 0,
        type: entree.metadata?.mimetype || 'image/jpeg',
        cache: entree.metadata?.cacheControl || null
      });
    }
  }
  return fichiers;
}

const estUneDerivee = (chemin) => /_(thumb|preview)\.jpg$/i.test(chemin);

async function rafraichir(fichier) {
  const { data, error } = await supabase.storage.from(BUCKET).download(fichier.chemin);
  if (error) throw new Error(`telechargement : ${error.message}`);
  const contenu = Buffer.from(await data.arrayBuffer());

  // `upsert` : on remplace le fichier par lui-meme, seul l'en-tete change.
  const { error: erreurEnvoi } = await supabase.storage.from(BUCKET).upload(fichier.chemin, contenu, {
    contentType: fichier.type,
    cacheControl: CACHE_UN_AN,
    upsert: true
  });
  if (erreurEnvoi) throw new Error(`depot : ${erreurEnvoi.message}`);
  return contenu.length;
}

async function main() {
  console.log(`\nCache des photos — ${APPLIQUER ? 'APPLICATION' : 'simulation (rien ne sera ecrit)'}\n`);

  const tous = await listerRecursivement();
  const cibles = tous.filter((f) => {
    if (f.cache && f.cache.includes('31536000')) return false; // deja a jour
    return INCLURE_ORIGINAUX ? true : estUneDerivee(f.chemin);
  });

  const poids = cibles.reduce((s, f) => s + f.taille, 0);
  console.log(`  ${tous.length} fichiers au total`);
  console.log(`  ${cibles.length} a rafraichir (${mo(poids)})`);
  console.log(`  ${INCLURE_ORIGINAUX ? 'originaux INCLUS' : 'derivees seulement — ajoutez --originaux pour tout'}\n`);

  if (!APPLIQUER) {
    console.log('  Simulation terminee. Relancez avec --appliquer pour ecrire.\n');
    return;
  }

  let faits = 0;
  let echecs = 0;
  for (const fichier of cibles) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await rafraichir(fichier);
      faits += 1;
    } catch (error) {
      echecs += 1;
      console.log(`  ECHEC ${fichier.chemin} — ${error.message}`);
    }
    if ((faits + echecs) % 25 === 0) {
      console.log(`  ${faits + echecs} / ${cibles.length}...`);
    }
  }

  console.log(`\n  ${faits} fichiers rafraichis, ${echecs} echec(s).\n`);
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}\n`);
  process.exit(1);
});
