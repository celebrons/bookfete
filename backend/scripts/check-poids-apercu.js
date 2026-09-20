// Combien pese reellement l'affichage d'une page du livre ?
//
//   node scripts/check-poids-apercu.js
//   node scripts/check-poids-apercu.js --livre <uuid> --pages 6
//
// LECTURE SEULE. Demande au serveur le HTML d'apercu de vraies pages, releve
// les images qu'il reference, et mesure ce qu'un navigateur telechargerait.
//
// Ecrit le 2026-09-20 apres l'alerte de quota : 5,5 Go servis pour 0,52 Go
// stockes. L'atelier ecrivait l'ORIGINAL de chaque photo dans chaque page —
// 1,4 Mo pour remplir un cadre qui fait au mieux 800 px de large a l'ecran.
//
// A relancer apres toute modification de pageRenderer ou de photoSource :
// c'est le seul controle qui mesure ce qui part VRAIMENT sur le reseau,
// plutot que ce que le code a l'air de faire.

require('dotenv').config();
const supabase = require('../config/supabase');
const pageRenderer = require('../services/composition/pageRenderer');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const { resolveCoverFormat } = require('../services/composition/coverFormat');

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : defaut;
};
const PAGES_A_MESURER = Number(valeur('--pages', 6));

const mo = (o) => `${(o / 1024 / 1024).toFixed(2)} Mo`;

async function poidsDe(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return { octets: 0, statut: r.status };
    const b = Buffer.from(await r.arrayBuffer());
    return { octets: b.length, statut: r.status, cache: r.headers.get('cache-control') };
  } catch (_e) {
    return { octets: 0, statut: 0 };
  }
}

const imagesDe = (html) => [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
  .map((m) => m[1].replace(/&amp;/g, '&'))
  .filter((u) => u.startsWith('http'));

async function main() {
  let bookId = valeur('--livre', null);
  if (!bookId) {
    // Le livre le plus fourni : c'est celui dont l'affichage coute le plus.
    const { data } = await supabase.from('book_content_items').select('book_id').eq('kind', 'photo');
    const parLivre = {};
    (data || []).forEach((i) => { parLivre[i.book_id] = (parLivre[i.book_id] || 0) + 1; });
    bookId = Object.entries(parLivre).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  if (!bookId) throw new Error('Aucun livre avec des photos.');

  const { data: book } = await supabase.from('books').select('*').eq('id', bookId).single();
  const [pages, items, layouts] = await Promise.all([
    bookContentService.listPages(bookId),
    bookContentService.listContentItems(bookId),
    templateCatalog.listActiveLayouts()
  ]);
  const format = resolveCoverFormat(book.print_format);

  console.log(`\nPoids de l'apercu — « ${book.title} », ${pages.length} pages composees\n`);

  let total = 0;
  let nbImages = 0;
  const cachesVus = new Set();
  const mesurees = pages.slice(0, PAGES_A_MESURER);

  for (const page of mesurees) {
    const html = pageRenderer.renderSinglePageHtml({ book, page, items, layouts, format });
    const urls = imagesDe(html);
    let poidsPage = 0;
    for (const url of urls) {
      // eslint-disable-next-line no-await-in-loop
      const r = await poidsDe(url);
      poidsPage += r.octets;
      if (r.cache) cachesVus.add(r.cache);
    }
    nbImages += urls.length;
    total += poidsPage;
    console.log(`  page ${String(page.page_index + 1).padStart(3)} : ${String(urls.length)} image(s), ${mo(poidsPage).padStart(9)}`);
  }

  const moyenneParPage = mesurees.length ? total / mesurees.length : 0;
  console.log(`\n  ${nbImages} images sur ${mesurees.length} pages : ${mo(total)}`);
  console.log(`  moyenne par page : ${mo(moyenneParPage)}`);
  console.log(`  feuilleter les ${pages.length} pages : ${mo(moyenneParPage * pages.length)}`);
  console.log(`\n  cache-control servi : ${[...cachesVus].join(' | ') || 'inconnu'}`);
  console.log('  (max-age=3600 = une heure ; 31536000 = un an, la cible)\n');
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}\n`);
  process.exit(1);
});
