// REMETTRE LES DOUBLES PAGES SUR UN VRAI VIS-A-VIS.
//
//   node scripts/reparer-doubles-pages.js              (simulation, n'ecrit rien)
//   node scripts/reparer-doubles-pages.js --appliquer  (ecrit, apres sauvegarde)
//   node scripts/reparer-doubles-pages.js --livre <id> [--appliquer]
//
// POURQUOI
//
// Jusqu'au 2026-09-25, Celebrons appariait les pages (1,2), (3,4)... Un
// livre relie, lui, ouvre sur la page 1 SEULE a droite : les vis-a-vis
// reels sont (2,3), (4,5)... Confirme par le premier vrai livre imprime —
// premiere photo a droite, derniere photo a gauche.
//
// Les livres composes avant cette date portent donc deux sortes de defauts,
// que ce script repare :
//
//   1. UNE DOUBLE PAGE A CHEVAL sur deux vis-a-vis. Elle s'imprime en
//      recto-verso : il faut tourner la page pour voir la seconde moitie.
//      -> on la decale d'une page, et la page qu'elle deplace prend sa
//         place liberee. Rien n'est perdu, rien n'est duplique.
//
//   2. UNE DEMI-PHOTO ORPHELINE. La composition automatique posait une
//      "photo sur double page" sur UNE seule page : cette page n'affiche
//      que la moitie de sa photo, l'autre moitie n'existe nulle part.
//      -> on la repasse en photo pleine page, ce qu'elle aurait toujours
//         du etre.
//
// PRUDENCE : avant toute ecriture, toutes les pages touchees sont
// sauvegardees telles quelles dans tmp/sauvegarde-doubles-pages-*.json.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const { isLeftPage, facingPageIndex } = require('../services/composition/pageParity');

const APPLIQUER = process.argv.includes('--appliquer');
const LIVRE_CIBLE = (() => {
  const i = process.argv.indexOf('--livre');
  return i !== -1 ? process.argv[i + 1] : null;
})();

const SORTIE_DIR = path.join(__dirname, '..', 'tmp');

// Le contenu d'une page, reduit a ce qui se deplace avec elle.
const contenuDe = (row) => (row ? { layout_id: row.layout_id, content: row.content, locked: row.locked } : null);

// Rejouer le layout DANS le contenu : `content.blocks[].layoutId` double
// `layout_id`, et le moteur lit les deux. En changer un seul laisserait une
// page qui se contredit elle-meme.
function avecLayout(contenu, layoutId) {
  if (!contenu) return null;
  const blocks = (contenu.content?.blocks || []).map((bloc) => ({ ...bloc, layoutId }));
  return { ...contenu, layout_id: layoutId, content: { ...contenu.content, blocks } };
}

async function planifierLivre(book, slugParId, idParSlug) {
  const { data: rows } = await supabase
    .from('book_pages').select('*').eq('book_id', book.id).order('page_index');

  const parIndex = new Map((rows || []).map((row) => [row.page_index, row]));
  const etat = new Map((rows || []).map((row) => [row.page_index, contenuDe(row)]));
  const estDouble = (index) => slugParId.get(etat.get(index)?.layout_id) === 'FULL_PHOTO_SPREAD';
  const totalPages = book.page_count || 0;

  // Regrouper les pages de double page par photo : c'est la photo qui dit
  // si deux pages forment une paire ou si une page est seule.
  const groupes = new Map();
  for (const [index, contenu] of etat) {
    if (slugParId.get(contenu?.layout_id) !== 'FULL_PHOTO_SPREAD') continue;
    const photo = contenu.content?.blocks?.[0]?.itemIds?.[0] || `sans-photo-${index}`;
    if (!groupes.has(photo)) groupes.set(photo, []);
    groupes.get(photo).push(index);
  }

  const actions = [];
  const pleinePageId = idParSlug.get('FULL_PHOTO');

  for (const [photo, indexes] of groupes) {
    const tries = [...indexes].sort((a, b) => a - b);

    // ORPHELINE : une seule page, ou deux pages non contigues (la meme photo
    // posee deux fois ailleurs dans le livre, ce qui n'est pas une double page).
    if (tries.length === 1 || (tries.length === 2 && tries[1] !== tries[0] + 1)) {
      if (!pleinePageId) {
        actions.push({ type: 'impossible', raison: 'FULL_PHOTO introuvable au catalogue', pages: tries });
        continue;
      }
      for (const index of tries) {
        etat.set(index, avecLayout(etat.get(index), pleinePageId));
        actions.push({ type: 'orpheline', page: index, photo });
      }
      continue;
    }

    if (tries.length !== 2) {
      actions.push({ type: 'impossible', raison: `${tries.length} pages portent cette photo`, pages: tries });
      continue;
    }

    const [a, b] = tries;
    // Deja juste : la premiere page est a gauche et la seconde lui fait face.
    if (isLeftPage(a) && facingPageIndex(a) === b) continue;

    const contenuDouble = etat.get(a);
    // On prefere decaler vers la GAUCHE : la double page bouge moins, et la
    // page qu'elle deplace la suit immediatement.
    const gaucheOk = a - 1 >= 1 && !estDouble(a - 1);
    const droiteOk = b + 1 <= totalPages - 1 && !estDouble(b + 1);

    if (gaucheOk) {
      const deplace = etat.get(a - 1);
      etat.set(a - 1, contenuDouble);
      etat.set(b, deplace);
      actions.push({ type: 'decalage', sens: 'gauche', avant: [a, b], apres: [a - 1, a], photo });
    } else if (droiteOk) {
      const deplace = etat.get(b + 1);
      etat.set(a, deplace);
      etat.set(b + 1, contenuDouble);
      actions.push({ type: 'decalage', sens: 'droite', avant: [a, b], apres: [b, b + 1], photo });
    } else {
      actions.push({ type: 'impossible', raison: 'aucune page libre de chaque cote', pages: tries });
    }
  }

  // Ce qui a REELLEMENT change, par rapport a l'etat de depart.
  const changements = [];
  for (const [index, contenu] of etat) {
    const avant = contenuDe(parIndex.get(index));
    if (JSON.stringify(avant) !== JSON.stringify(contenu)) {
      changements.push({ index, avant, apres: contenu, row: parIndex.get(index) || null });
    }
  }

  return { actions, changements, rows: rows || [] };
}

async function appliquer(book, changements) {
  const nowIso = new Date().toISOString();
  for (const { index, apres, row } of changements) {
    if (!apres) {
      if (row) await supabase.from('book_pages').delete().eq('id', row.id);
      continue;
    }
    if (row) {
      const { error } = await supabase.from('book_pages').update({
        layout_id: apres.layout_id, content: apres.content, locked: apres.locked, updated_at: nowIso
      }).eq('id', row.id);
      if (error) throw new Error(`page ${index} : ${error.message}`);
    } else {
      const { error } = await supabase.from('book_pages').insert({
        book_id: book.id, page_index: index,
        layout_id: apres.layout_id, content: apres.content, locked: apres.locked
      });
      if (error) throw new Error(`page ${index} (creation) : ${error.message}`);
    }
  }
}

(async () => {
  const { data: layouts, error } = await supabase.from('layout_definitions').select('id,slug');
  if (error) throw error;
  const slugParId = new Map(layouts.map((l) => [l.id, l.slug]));
  const idParSlug = new Map(layouts.map((l) => [l.slug, l.id]));

  let requete = supabase.from('books').select('id,title,page_count,status').order('created_at');
  if (LIVRE_CIBLE) requete = requete.eq('id', LIVRE_CIBLE);
  const { data: books, error: erreurBooks } = await requete;
  if (erreurBooks) throw erreurBooks;

  console.log(APPLIQUER ? '=== APPLICATION ===' : '=== SIMULATION (rien ne sera ecrit) ===');

  const sauvegarde = [];
  let totalDecalages = 0;
  let totalOrphelines = 0;
  let totalImpossibles = 0;
  let livresTouches = 0;

  for (const book of books) {
    const { actions, changements, rows } = await planifierLivre(book, slugParId, idParSlug);
    if (!actions.length) continue;

    livresTouches += 1;
    console.log(`\n${book.title || '(sans titre)'}  — ${book.page_count} pages, ${book.status}`);
    console.log(`  ${book.id}`);
    for (const action of actions) {
      if (action.type === 'decalage') {
        totalDecalages += 1;
        console.log(`  double page  pages ${action.avant[0] + 1}-${action.avant[1] + 1}  ->  ${action.apres[0] + 1}-${action.apres[1] + 1}  (vers la ${action.sens})`);
      } else if (action.type === 'orpheline') {
        totalOrphelines += 1;
        console.log(`  demi-photo orpheline page ${action.page + 1}  ->  photo pleine page`);
      } else {
        totalImpossibles += 1;
        console.log(`  NON TRAITE  pages ${action.pages.map((p) => p + 1).join(', ')} : ${action.raison}`);
      }
    }

    if (changements.length) {
      sauvegarde.push({ bookId: book.id, titre: book.title, pages: rows.filter((r) => changements.some((c) => c.index === r.page_index)) });
      if (APPLIQUER) await appliquer(book, changements);
    }
  }

  console.log('');
  console.log(`${totalDecalages} double(s) page(s) decalee(s), ${totalOrphelines} demi-photo(s) remise(s) en pleine page, ${totalImpossibles} cas non traite(s), dans ${livresTouches} livre(s).`);

  if (APPLIQUER && sauvegarde.length) {
    fs.mkdirSync(SORTIE_DIR, { recursive: true });
    const fichier = path.join(SORTIE_DIR, `sauvegarde-doubles-pages-${Date.now()}.json`);
    fs.writeFileSync(fichier, JSON.stringify(sauvegarde, null, 1));
    console.log(`\nEtat AVANT correction sauvegarde dans :\n  ${fichier}`);
  } else if (!APPLIQUER) {
    console.log('\nRien n a ete ecrit. Relancez avec --appliquer pour corriger.');
  }
})().catch((e) => {
  console.error('ERREUR', e.message);
  process.exit(1);
});
