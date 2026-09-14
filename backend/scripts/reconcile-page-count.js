// Aligne books.page_count sur le livre REEL, pour tous les livres.
//
// Trois regles, appliquees par l'autorite unique bookContentService
// .syncPageCount : plancher produit de 30 pages, nombre PAIR (l'imprimeur
// refuse les impairs), et couverture de toute page reellement presente.
//
// Pourquoi ce script existe : jusqu'au 2026-09-14, plusieurs chemins
// d'ecriture pouvaient laisser `books.page_count` derriere la realite. Comme
// le PRIX se calcule sur page_count et le FICHIER D'IMPRESSION sur les pages
// reelles, un ecart se payait en silence (constate : 30 pages facturees, 40
// envoyees a l'imprimeur). Le code ne peut plus produire cet ecart ; ce
// script repare les livres qui l'ont deja.
//
//   node scripts/reconcile-page-count.js           -> simulation (n'ecrit rien)
//   node scripts/reconcile-page-count.js --apply   -> applique

require('dotenv').config();
const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');

const APPLY = process.argv.includes('--apply');

(async () => {
  const { data: books, error } = await supabase
    .from('books')
    .select('id,title,page_count,print_format')
    .order('created_at', { ascending: false });
  if (error) throw error;

  console.log(APPLY ? 'MODE REEL — les livres vont etre mis a jour.\n' : 'SIMULATION — aucune ecriture. Ajouter --apply pour appliquer.\n');

  let changes = 0;
  for (const book of books) {
    const pages = await bookContentService.listPages(book.id);
    const attendu = bookContentService.requiredPageCount(pages, book.page_count);
    const maxIndex = pages.reduce((m, p) => Math.max(m, p.page_index), -1);
    const avecContenu = pages.filter((p) => (p.content?.itemIds || []).filter(Boolean).length > 0).length;

    if (attendu === book.page_count) continue;
    changes += 1;

    const raison = [];
    if (maxIndex + 1 > book.page_count) raison.push(`${maxIndex + 1 - book.page_count} page(s) de contenu au-dela du compte annonce`);
    if (book.page_count < bookContentService.MIN_BOOK_PAGES) raison.push(`sous le plancher de ${bookContentService.MIN_BOOK_PAGES}`);
    if (book.page_count % 2 !== 0) raison.push('nombre impair');

    console.log(`  « ${book.title || '(sans titre)'} » — ${book.page_count} -> ${attendu} pages`);
    console.log(`      ${raison.join(' ; ') || 'normalisation'} (${avecContenu} page(s) avec contenu)`);

    if (APPLY) {
      const applique = await bookContentService.syncPageCount(book.id, book.page_count);
      console.log(`      applique : ${applique}`);
    }
  }

  console.log(`\n${changes} livre(s) ${APPLY ? 'mis a jour' : 'a corriger'}.`);
  if (!APPLY && changes > 0) console.log('Relancer avec --apply pour appliquer.');
  process.exit(0);
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
