// Supprime les fichiers d'impression ORPHELINS du stockage Supabase.
//
//   node scripts/nettoyer-fichiers-impression.js            -> liste seulement
//   node scripts/nettoyer-fichiers-impression.js --appliquer -> supprime
//
// Chaque envoi a l'imprimeur depose un PDF sous orders/<id>/print-ready.pdf
// (~46 Mo pour un livre de 30 pages). Rien ne les efface ensuite : apres
// quelques essais, ils pesent plus lourd que tout le reste du projet reuni
// (674 Mo sur 1 Go mesures le 2026-09-16, alors que le palier gratuit
// Supabase s'arrete a 1 Go).
//
// Un fichier est dit ORPHELIN quand la commande correspondante n'existe plus
// en base : plus rien ne le reference, ni l'application ni l'imprimeur. Les
// fichiers des commandes VIVANTES ne sont jamais touches — Gelato peut encore
// avoir besoin de les telecharger.
//
// Par prudence, le script ne supprime rien sans --appliquer.

require('dotenv').config();
const supabase = require('../config/supabase');

const BUCKET = 'print-files';
const appliquer = process.argv.includes('--appliquer');
const mo = (o) => (o / 1024 / 1024).toFixed(1);

(async () => {
  const { data: orders, error: err } = await supabase.from('orders').select('id');
  if (err) { console.log('Lecture des commandes impossible :', err.message); process.exit(1); }
  const vivantes = new Set((orders || []).map((o) => o.id));

  const orphelins = [];
  const gardes = [];

  // 1. Les fichiers des commandes, sous orders/<id>/.
  const { data: dossiers } = await supabase.storage.from(BUCKET).list('orders', { limit: 1000 });
  for (const dossier of dossiers || []) {
    // eslint-disable-next-line no-await-in-loop
    const { data: fichiers } = await supabase.storage.from(BUCKET).list(`orders/${dossier.name}`, { limit: 100 });
    (fichiers || []).forEach((f) => {
      const entree = { chemin: `orders/${dossier.name}/${f.name}`, taille: f.metadata?.size || 0 };
      (vivantes.has(dossier.name) ? gardes : orphelins).push(entree);
    });
  }

  // 2. Les residus des SCRIPTS d'essai, qui ne correspondent a aucune
  //    commande et que rien ne relit : test-orders/ (scripts/gelato-test-order.js,
  //    ancien format a deux fichiers separes) et diagnostic/ (GET
  //    /api/health/printing). Toujours orphelins par nature.
  for (const prefixe of ['test-orders', 'diagnostic']) {
    // eslint-disable-next-line no-await-in-loop
    const { data: entrees } = await supabase.storage.from(BUCKET).list(prefixe, { limit: 1000 });
    for (const entree of entrees || []) {
      const estFichier = entree.metadata?.size !== undefined && entree.metadata?.size !== null;
      if (estFichier) {
        orphelins.push({ chemin: `${prefixe}/${entree.name}`, taille: entree.metadata.size });
      } else {
        // eslint-disable-next-line no-await-in-loop
        const { data: sous } = await supabase.storage.from(BUCKET).list(`${prefixe}/${entree.name}`, { limit: 200 });
        (sous || []).forEach((f) => orphelins.push({
          chemin: `${prefixe}/${entree.name}/${f.name}`,
          taille: f.metadata?.size || 0
        }));
      }
    }
  }

  if (orphelins.length === 0 && gardes.length === 0) {
    console.log('Aucun fichier d impression stocke.');
    process.exit(0);
  }

  const poids = (liste) => liste.reduce((s, f) => s + f.taille, 0);

  console.log(`${gardes.length} fichier(s) rattache(s) a une commande vivante — conserve(s) (${mo(poids(gardes))} Mo)`);
  console.log(`${orphelins.length} fichier(s) orphelin(s) (${mo(poids(orphelins))} Mo)`);
  console.log('');

  if (orphelins.length === 0) {
    console.log('Rien a nettoyer.');
    process.exit(0);
  }

  orphelins.forEach((f) => console.log(`  ${mo(f.taille).padStart(7)} Mo  ${f.chemin}`));
  console.log('');

  if (!appliquer) {
    console.log('Aucune suppression effectuee. Relancez avec --appliquer pour supprimer.');
    process.exit(0);
  }

  const { error } = await supabase.storage.from(BUCKET).remove(orphelins.map((f) => f.chemin));
  if (error) { console.log('Suppression impossible :', error.message); process.exit(1); }

  console.log(`${orphelins.length} fichier(s) supprime(s), ${mo(poids(orphelins))} Mo liberes.`);
  process.exit(0);
})();
