// Fabrique le fichier d'impression Gelato EN LOCAL, pour le verifier soi-meme.
//
//   node scripts/generer-fichier-gelato.js              -> le livre dont le titre contient "montr"
//   node scripts/generer-fichier-gelato.js "60 ans"     -> un autre livre
//   node scripts/generer-fichier-gelato.js --sortie C:/chemin/fichier.pdf
//
// C'est EXACTEMENT le fichier que recoit l'imprimeur : meme couverture
// enveloppante, meme fond perdu, meme pagination completee. Rien n'est
// envoye a Gelato, aucune commande n'est creee, aucun brouillon : ce script
// ECRIT UN FICHIER, point. Il sert a importer le PDF sur l'outil de
// verification de Gelato avant toute commande payante.
//
// Demande du 2026-09-16 : « fournis moi aussi le fichier envoye a Gelato
// pour que je le teste sur leur site ».

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const { buildGelatoPrintReadyPdf } = require('../services/printing/gelatoPrintFile');
const { resolveGelatoProduct, resolveGelatoPageCount } = require('../services/printing/gelatoCatalog');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const args = process.argv.slice(2);
const iSortie = args.indexOf('--sortie');
const sortieDemandee = iSortie > -1 ? args[iSortie + 1] : null;
const recherche = args.filter((a, i) => !a.startsWith('--') && i !== iSortie + 1)[0] || 'montr';

(async () => {
  const { data: books } = await supabase.from('books').select('*');
  const livre = (books || []).find((b) => (b.title || '').toLowerCase().includes(recherche.toLowerCase()));
  if (!livre) {
    console.log(`Aucun livre dont le titre contient « ${recherche} ».`);
    process.exit(1);
  }

  const [interiorPages, items, layouts, template] = await Promise.all([
    // listPagesForRender, pas listPages : le fichier doit contenir exactement
    // les pages FACTUREES, y compris celles laissees vierges (sans ligne en
    // base). Meme regle que l'envoi reel, sinon on verifierait autre chose
    // que ce qui part chez l'imprimeur.
    bookContentService.listPagesForRender(livre.id, livre.page_count),
    bookContentService.listContentItems(livre.id),
    templateCatalog.listActiveLayouts(),
    livre.template_id ? templateCatalog.getTemplateById(livre.template_id) : Promise.resolve(null)
  ]);

  if (interiorPages.length === 0) {
    console.log("Ce livre n'a aucune page interieure composee.");
    process.exit(1);
  }

  const formatId = livre.print_format;
  const format = { formatId, ...resolveCoverFormat(formatId), ...resolveFormatDensity(formatId) };
  const gelatoProduct = resolveGelatoProduct(formatId);
  const pageCount = resolveGelatoPageCount(interiorPages.length, formatId);

  const outputPath = sortieDemandee
    ? path.resolve(sortieDemandee)
    : path.join(process.cwd(), `gelato-${(livre.title || 'livre').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);

  console.log(`« ${livre.title} » — format ${formatId}, ${interiorPages.length} pages interieures`);
  console.log(`produit Gelato : ${gelatoProduct.productUid}`);
  console.log(`pagination retenue : ${pageCount}`);
  console.log('');

  const depart = Date.now();
  const built = await buildGelatoPrintReadyPdf({
    book: livre,
    items,
    layouts,
    template,
    format,
    interiorPages,
    gelatoProductUid: gelatoProduct.productUid,
    pageCount,
    outputPath,
    onProgress: ({ phase, done, total }) => {
      process.stdout.write(`\r   ${phase}${total ? ` ${done}/${total}` : ''}        `);
    }
  });
  console.log('\n');

  const taille = fs.statSync(built.outputPath).size;
  console.log(`  fichier            : ${built.outputPath}`);
  console.log(`  poids              : ${(taille / 1024 / 1024).toFixed(1)} Mo`);
  console.log(`  pages              : ${built.totalPages} (1 couverture enveloppante + ${built.totalPages - 1} interieures)`);
  console.log(`  pages blanches     : ${built.paddedInteriorPages} (gardes de tete et de fin)`);
  console.log(`  couverture         : ${built.coverSizeMm.width} x ${built.coverSizeMm.height} mm (fond perdu compris)`);
  console.log(`  interieur          : ${built.interiorSizeMm.width} x ${built.interiorSizeMm.height} mm (fond perdu compris)`);
  console.log('');
  console.log('  Aucune commande n a ete creee chez Gelato : ce script ecrit un fichier, rien de plus.');
  process.exit(0);
})();
