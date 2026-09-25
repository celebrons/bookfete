// Quelles doubles pages deja composees ne tombent PAS sur un vrai vis-a-vis ?
//
//   node scripts/check-doubles-pages-existantes.js
//
// LECTURE SEULE : ce script ne modifie rien, il rapporte.
//
// La regle de parite a ete corrigee le 2026-09-25, apres le retour du
// premier vrai livre imprime (« Voyage a Montreal ») : la page 1 d'un livre
// relie est SEULE a droite, donc les vis-a-vis sont (1,2), (3,4), (5,6)...
// et non (1,2)... en partant de l'index 0. Voir
// services/composition/pageParity.js.
//
// Les livres composes AVANT cette correction peuvent donc porter une double
// page a cheval sur deux vis-a-vis : elle s'imprimerait en recto-verso. Ce
// script les liste, avec la correction a faire (decaler d'une page).

require('dotenv').config();
const supabase = require('../config/supabase');
const { isLeftPage, facingPageIndex } = require('../services/composition/pageParity');

(async () => {
  const { data: layouts, error: erreurLayouts } = await supabase
    .from('layout_definitions').select('id,slug');
  if (erreurLayouts) throw erreurLayouts;
  const slugParId = new Map(layouts.map((l) => [l.id, l.slug]));

  const { data: books, error: erreurBooks } = await supabase
    .from('books').select('id,title,page_count,status').order('created_at');
  if (erreurBooks) throw erreurBooks;

  let livresTouches = 0;
  let doublesTouchees = 0;

  for (const book of books) {
    const { data: pages } = await supabase
      .from('book_pages').select('page_index,layout_id,content')
      .eq('book_id', book.id).order('page_index');

    const doubles = (pages || []).filter((p) => slugParId.get(p.layout_id) === 'FULL_PHOTO_SPREAD');
    if (!doubles.length) continue;

    // Une double page est ecrite sur DEUX pages portant la meme photo. On
    // les regroupe par photo pour raisonner sur la paire, pas sur la page.
    const paires = new Map();
    for (const page of doubles) {
      const photo = page.content?.blocks?.[0]?.itemIds?.[0] || `sans-photo-${page.page_index}`;
      if (!paires.has(photo)) paires.set(photo, []);
      paires.get(photo).push(page.page_index);
    }

    const problemes = [];
    for (const [, indexes] of paires) {
      const tries = [...indexes].sort((a, b) => a - b);
      if (tries.length !== 2) {
        problemes.push({ indexes: tries, raison: `${tries.length} page(s) au lieu de 2` });
        continue;
      }
      const [premier, second] = tries;
      // Un vrai vis-a-vis : la premiere page est a GAUCHE, et la seconde est
      // bien celle qui lui fait face.
      const correct = isLeftPage(premier) && facingPageIndex(premier) === second;
      if (!correct) {
        problemes.push({
          indexes: tries,
          raison: `pages ${premier + 1} et ${second + 1} ne se font pas face`,
          suggestion: `deplacer vers les pages ${premier + 2} et ${second + 2}`
        });
      }
    }

    if (!problemes.length) continue;
    livresTouches += 1;
    doublesTouchees += problemes.length;
    console.log(`\n${book.title}  (${book.page_count} pages, ${book.status})`);
    console.log(`  id ${book.id}`);
    for (const probleme of problemes) {
      console.log(`  - ${probleme.raison}${probleme.suggestion ? ` -> ${probleme.suggestion}` : ''}`);
    }
  }

  console.log('');
  if (livresTouches === 0) {
    console.log('RESULTAT : aucune double page a corriger.');
  } else {
    console.log(`RESULTAT : ${doublesTouchees} double(s) page(s) a decaler, dans ${livresTouches} livre(s).`);
    console.log('Rien n a ete modifie : la correction se fait dans l atelier, page par page.');
  }
})().catch((error) => {
  console.error('ERREUR', error.message);
  process.exit(1);
});
