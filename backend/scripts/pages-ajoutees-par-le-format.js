// Repere les pages qu'un CHANGEMENT DE FORMAT a ajoutees a un livre compose
// a la main, et propose de les retirer.
//
// Pourquoi ce script existe : jusqu'au 2026-09-14, `composeBookForFormat`
// reprenait TOUT le contenu qui n'etait pas deja sur une page verrouillee —
// y compris les souvenirs restes dans la bibliotheque, jamais places. Choisir
// un format ajoutait donc au livre des pages que l'utilisateur n'avait pas
// demandees. Constate sur « Voyage a Montreal » : 30 pages faites a la main,
// +4 pages en Livret/Standard, +6 en Luxe.
//
// Le code ne peut plus produire ces pages ; ce script montre celles qui
// existent deja.
//
// Critere retenu, volontairement STRICT : on ne signale une page que si
//   1. le livre contient au moins une page faite a la main (page verrouillee),
//   2. la page visee n'est PAS verrouillee (donc jamais du travail manuel),
//   3. elle se situe APRES la derniere page verrouillee (donc ajoutee a la
//      fin, jamais intercalee dans le travail de l'utilisateur).
// Une page automatique posee AVANT ou ENTRE des pages manuelles n'est jamais
// touchee : impossible de savoir si elle a ete voulue.
//
// Les SOUVENIRS ne sont jamais supprimes : ils retournent simplement dans la
// bibliotheque, disponibles pour etre places a la main.
//
//   node scripts/pages-ajoutees-par-le-format.js                 -> simulation
//   node scripts/pages-ajoutees-par-le-format.js --livre "Montreal"
//   node scripts/pages-ajoutees-par-le-format.js --livre "Montreal" --apply

require('dotenv').config();
const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');

const APPLY = process.argv.includes('--apply');
const filtreIndex = process.argv.indexOf('--livre');
const FILTRE = filtreIndex !== -1 ? (process.argv[filtreIndex + 1] || '') : '';

(async () => {
  const { data: books, error } = await supabase
    .from('books')
    .select('id,title,page_count,print_format')
    .order('created_at', { ascending: false });
  if (error) throw error;

  console.log(APPLY
    ? 'MODE REEL — les pages listees vont etre retirees.\n'
    : 'SIMULATION — aucune ecriture. Ajouter --apply pour appliquer.\n');

  let totalLivres = 0;

  for (const book of books) {
    if (FILTRE && !(book.title || '').toLowerCase().includes(FILTRE.toLowerCase())) continue;

    // eslint-disable-next-line no-await-in-loop
    const pages = await bookContentService.listPages(book.id);
    const verrouillees = pages.filter((page) => page.locked);
    if (verrouillees.length === 0) continue; // livre automatique : rien a dire

    const dernierIndexManuel = verrouillees.reduce((max, page) => Math.max(max, page.page_index), -1);
    const suspectes = pages.filter((page) => !page.locked && page.page_index > dernierIndexManuel);
    if (suspectes.length === 0) continue;

    totalLivres += 1;
    const souvenirs = suspectes.flatMap((page) => (page.content?.itemIds || []).filter(Boolean));

    console.log(`« ${book.title || '(sans titre)'} » — ${book.print_format}`);
    console.log(`   ${pages.length} pages en base : ${verrouillees.length} faites a la main (jusqu'a la page ${dernierIndexManuel + 1})`);
    console.log(`   ${suspectes.length} page(s) automatique(s) APRES : ${suspectes.map((p) => p.page_index + 1).join(', ')}`);
    console.log(`   elles portent ${souvenirs.length} souvenir(s), qui retourneront dans la bibliotheque`);

    if (!APPLY) {
      console.log(`   -> le livre repasserait a ${dernierIndexManuel + 1} page(s) de contenu\n`);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const { error: deleteError } = await supabase
      .from('book_pages')
      .delete()
      .eq('book_id', book.id)
      .in('page_index', suspectes.map((page) => page.page_index));
    if (deleteError) throw deleteError;

    // Le nombre annonce doit suivre : c'est lui qui est FACTURE (voir
    // bookContentService.syncPageCount). Le plancher produit s'applique.
    // eslint-disable-next-line no-await-in-loop
    const nouveau = await bookContentService.syncPageCount(book.id, dernierIndexManuel + 1);
    console.log(`   -> retirees. Nombre de pages du livre : ${nouveau}\n`);
  }

  console.log(totalLivres === 0
    ? 'Aucun livre concerne.'
    : `${totalLivres} livre(s) ${APPLY ? 'nettoye(s)' : 'a nettoyer'}.`);
  if (!APPLY && totalLivres > 0) console.log('Relancer avec --apply pour appliquer.');
  process.exit(0);
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
