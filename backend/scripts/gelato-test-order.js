// backend/scripts/gelato-test-order.js
//
// Test d'integration bout-en-bout : prend un livre REEL existant en base,
// genere le VRAI fichier d'impression attendu par Gelato (UN SEUL PDF
// combine — voir gelatoPrintFile.js pour le detail exact, decouvert le
// 2026-09-10 via leur outil officiel "Telecharger le fichier d'impression"
// sur la fiche produit du catalogue), l'heberge publiquement (bucket
// print-files), et cree une commande Gelato en mode 'draft' UNIQUEMENT
// (jamais de production/facturation reelle — voir gelatoClient.js).
//
// Usage : node scripts/gelato-test-order.js <bookId> [--format=livret|standard|luxe] [--keep] [--scale=N]
//   --format : ignore book.print_format, force le format teste (le LIVRE
//     lui-meme n'est jamais modifie — utile pour comparer les 3 formats sur
//     le meme contenu sans toucher a la vraie configuration du livre).
//   --keep   : ne supprime PAS la commande brouillon a la fin (par defaut,
//     elle est supprimee automatiquement) — a utiliser pour aller la
//     consulter dans le dashboard Gelato (dashboard.gelato.com > Orders).
//   --scale  : reduction ponctuelle de resolution (voir pdfService.js) —
//     seulement si le fichier final depasse la limite 50 Mo du bucket
//     print-files malgre la compression PNG maximale deja appliquee.
//
// Necessite GELATO_API_KEY dans backend/.env. Ne modifie AUCUNE donnee du
// livre lui-meme (lecture seule cote Supabase, hormis les fichiers
// generes/uploades dans print-files).

require('dotenv').config();
const fs = require('fs');
const supabase = require('../config/supabase');
const bookContentService = require('../services/composition/bookContentService');
const templateCatalog = require('../services/composition/templateCatalog');
const { resolveCoverFormat, COVER_FORMATS, DEFAULT_COVER_FORMAT_ID } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');
const { resolveGelatoProduct, resolveGelatoPageCount } = require('../services/printing/gelatoCatalog');
const { buildGelatoPrintReadyPdf, GELATO_BLEED_MM } = require('../services/printing/gelatoPrintFile');
const { uploadPrintFile } = require('../services/printing/printFileStorage');
const gelatoClient = require('../services/printing/gelatoClient');

function resolveRenderFormat(formatId) {
  const normalized = Object.prototype.hasOwnProperty.call(COVER_FORMATS, formatId) ? formatId : DEFAULT_COVER_FORMAT_ID;
  return { formatId: normalized, ...resolveCoverFormat(formatId), ...resolveFormatDensity(formatId) };
}

async function main() {
  const args = process.argv.slice(2);
  const bookId = args.find((arg) => !arg.startsWith('--'));
  const formatFlag = args.find((arg) => arg.startsWith('--format='));
  const formatOverride = formatFlag ? formatFlag.split('=')[1] : null;
  const keep = args.includes('--keep');
  const scaleFlag = args.find((arg) => arg.startsWith('--scale='));
  const scaleOverride = scaleFlag ? Number(scaleFlag.split('=')[1]) : undefined;

  if (!bookId) {
    console.error('Usage: node scripts/gelato-test-order.js <bookId> [--format=livret|standard|luxe] [--keep] [--scale=N]');
    process.exit(1);
  }

  console.log(`\n=== 1. Chargement du livre ${bookId} ===\n`);
  const { data: book, error: bookError } = await supabase.from('books').select('*').eq('id', bookId).single();
  if (bookError || !book) {
    console.error('Livre introuvable:', bookError?.message);
    process.exit(1);
  }
  console.log(`Livre: "${book.title}" — print_format=${book.print_format || '(defaut)'} — page_count=${book.page_count}`);

  const [interiorPages, items, layouts, template] = await Promise.all([
    bookContentService.listPages(bookId),
    bookContentService.listContentItems(bookId),
    templateCatalog.listActiveLayouts(),
    book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null)
  ]);
  console.log(`Contenu: ${items.length} item(s), ${interiorPages.length} page(s) interieure(s) composee(s)`);

  if (interiorPages.length === 0) {
    console.error("Ce livre n'a aucune page interieure composee (recomposez-le dans l'atelier d'abord). Abandon.");
    process.exit(1);
  }

  const effectiveFormatId = formatOverride || book.print_format;
  if (formatOverride) {
    console.log(`Format force par --format : ${formatOverride} (book.print_format reste "${book.print_format}", livre non modifie)`);
  }
  const format = resolveRenderFormat(effectiveFormatId);
  const gelatoProduct = resolveGelatoProduct(effectiveFormatId);
  const pageCount = resolveGelatoPageCount(interiorPages.length, effectiveFormatId);
  console.log(`Format: ${format.formatId} -> Gelato productUid=${gelatoProduct.productUid}`);
  console.log(`Pages reelles: ${interiorPages.length} (declarees a l'ordre: ${pageCount})`);

  console.log(`\n=== 2. Fichier d'impression combine (couverture page 1 + interieur, fond perdu ${GELATO_BLEED_MM}mm) ===\n`);
  const outputPath = require('path').join(
    require('../services/composition/pdfService').PDF_PREVIEW_DIR,
    `gelato-print-ready-${bookId}-${Date.now()}.pdf`
  );
  const result = await buildGelatoPrintReadyPdf({
    book,
    items,
    layouts,
    template,
    format,
    interiorPages,
    gelatoProductUid: gelatoProduct.productUid,
    pageCount,
    outputPath,
    scale: scaleOverride
  });
  console.log(`Fichier genere: ${result.outputPath} (${(fs.statSync(result.outputPath).size / 1024 / 1024).toFixed(1)} Mo)`);
  console.log(`Total pages: ${result.totalPages} (1 couverture ${result.coverSizeMm.width}x${result.coverSizeMm.height}mm + ${result.realInteriorPages} reelles + ${result.paddedInteriorPages} blanches a ${result.interiorSizeMm.width}x${result.interiorSizeMm.height}mm)`);

  console.log(`\n=== 3. Upload public (bucket print-files) ===\n`);
  const stamp = Date.now();
  const fileUrl = await uploadPrintFile(result.outputPath, `test-orders/${bookId}/${stamp}-print-ready.pdf`);
  console.log('Fichier:', fileUrl);

  console.log(`\n=== 4. Creation de la commande Gelato (orderType: draft — jamais de production reelle) ===\n`);
  const payload = gelatoClient.buildOrderPayload({
    orderReferenceId: `TEST-${bookId}-${stamp}`,
    orderType: 'draft',
    shippingAddress: {
      firstName: 'Test',
      lastName: 'Celebrons',
      addressLine1: '1 rue de Test',
      city: 'Paris',
      postCode: '75001',
      country: 'FR',
      email: 'test@example.com'
    },
    productUid: gelatoProduct.productUid,
    pageCount,
    interiorFileUrl: fileUrl
    // coverFileUrl volontairement omis : la couverture fait deja partie du
    // fichier combine (page 1) — voir gelatoPrintFile.js.
  });

  const order = await gelatoClient.createOrder(payload);
  console.log('Commande creee (brouillon, NON soumise a production) — id:', order.id);
  console.log('Item:', JSON.stringify({
    productName: order.items?.[0]?.productName,
    pageCount: order.items?.[0]?.pageCount,
    attributes: order.items?.[0]?.attributes,
    price: order.items?.[0]?.price,
    files: order.items?.[0]?.files?.map((f) => ({ type: f.type, url: f.url }))
  }, null, 2));

  if (keep) {
    console.log(`\nCommande LAISSEE EN PLACE (--keep) — visible dans dashboard.gelato.com > Orders (brouillon, id ${order.id}).\n`);
  } else {
    console.log(`\n=== 5. Nettoyage (suppression de la commande de test) ===\n`);
    await gelatoClient.deleteOrder(order.id);
    console.log('Commande de test supprimee cote Gelato.');
  }
  console.log(`\nFichier reste en ligne (pour inspection/test via "Telecharger le fichier d'impression") :\n  ${fileUrl}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nErreur:', error.message);
    if (error.body) console.error(JSON.stringify(error.body, null, 2));
    process.exit(1);
  });
