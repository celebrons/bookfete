// backend/scripts/extend-book-page-count.js
//
// Etend un livre a un nombre de pages interieures cible en AJOUTANT des
// pages vides a la fin (jamais de suppression/modification des pages
// existantes, verrouillees ou non) — utilise ici pour amener un livre de
// test au minimum imprimable Gelato (28 pages, voir memoire
// "gelato-integration-status"). Meme forme de page vide que
// formatComposer.js ({ layout_id: null, content: {} }) — meme convention
// deja etablie dans ce projet, pas une invention ad-hoc.
//
// Usage : node scripts/extend-book-page-count.js <bookId> <targetPageCount>
//
// N'utilise PAS layoutEngine.compose()/formatComposer.composeBookForFormat()
// (qui RECALCULENT une composition a partir du contenu reel) : ce script ne
// fait qu'AJOUTER des pages vides a la fin, en laissant les pages
// existantes rigoureusement intactes — plus sur pour un livre qui a deja du
// travail manuel (pages verrouillees dans l'atelier), voir le commentaire
// de bookContentService.replaceBookPages (protege deja les pages
// verrouillees, mais supprime les pages NON verrouillees absentes du
// nouveau tableau — ce script repasse donc explicitement toutes les pages
// existantes pour ne jamais en perdre).

require('dotenv').config();
const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');

async function main() {
  const bookId = process.argv[2];
  const targetPageCount = Number(process.argv[3]);

  if (!bookId || !Number.isInteger(targetPageCount) || targetPageCount <= 0) {
    console.error('Usage: node scripts/extend-book-page-count.js <bookId> <targetPageCount>');
    process.exit(1);
  }

  const { data: book, error: bookError } = await supabase.from('books').select('*').eq('id', bookId).single();
  if (bookError || !book) {
    console.error('Livre introuvable:', bookError?.message);
    process.exit(1);
  }

  const existingPages = await bookContentService.listPages(bookId);
  console.log(`Livre "${book.title}" — ${existingPages.length} page(s) existante(s) (${existingPages.filter((p) => p.locked).length} verrouillee(s)), book.page_count actuel = ${book.page_count}`);

  if (existingPages.length >= targetPageCount) {
    console.log(`Deja a ${existingPages.length} pages (>= ${targetPageCount}) — aucune page ajoutee.`);
  } else {
    const newEmptyPages = [];
    for (let index = existingPages.length; index < targetPageCount; index += 1) {
      newEmptyPages.push({ page_index: index, layout_id: null, content: {} });
    }

    // Repasse les pages existantes TELLES QUELLES (voir commentaire d'en-tete
    // : replaceBookPages supprime les pages non verrouillees absentes du
    // tableau passe — il faut donc les repasser pour ne rien perdre).
    const fullPagesList = [
      ...existingPages.map((page) => ({ page_index: page.page_index, layout_id: page.layout_id, content: page.content })),
      ...newEmptyPages
    ];

    await bookContentService.replaceBookPages(bookId, fullPagesList);
    console.log(`${newEmptyPages.length} page(s) vide(s) ajoutee(s) (page_index ${existingPages.length} a ${targetPageCount - 1}).`);
  }

  const { error: updateError } = await supabase
    .from('books')
    .update({ page_count: targetPageCount, updated_at: new Date().toISOString() })
    .eq('id', bookId);
  if (updateError) {
    console.error('Erreur mise a jour books.page_count:', updateError.message);
    process.exit(1);
  }
  console.log(`books.page_count mis a jour -> ${targetPageCount}.`);

  const finalPages = await bookContentService.listPages(bookId);
  console.log(`Verification finale : ${finalPages.length} page(s) en base pour ce livre.`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('Erreur:', error.message);
  process.exit(1);
});
