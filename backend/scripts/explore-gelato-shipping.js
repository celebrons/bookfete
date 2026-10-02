// backend/scripts/explore-gelato-shipping.js
//
// Exploration empirique des VRAIS frais de livraison Gelato par pays —
// le prix d'impression se lit via l'API catalogue (scripts/prix-gelato.js),
// mais la livraison n'apparaissait jamais dans une commande 'draft' SANS
// shipmentMethodUid explicite (son champ shipment.price restait null, meme
// pour la France). Trouvaille cle : fournir N'IMPORTE QUEL shipmentMethodUid
// (meme invalide pour ce pays/produit) suffit a faire retomber Gelato sur
// SA propre methode la moins chere reellement disponible (isCheapest:true),
// prix inclus — verifie le 2026-10-02 sur FR/CA/GB/US. Jamais de commande
// reelle : orderType reste 'draft' partout (voir gelatoClient.js), chaque
// commande de test est supprimee a la fin.
//
// Usage : node scripts/explore-gelato-shipping.js <bookId> [--format=livret|standard|luxe] [--keep]

require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

// Tous les pays deja reconnus par countryCodes.js (resolveCountryIso2) — un
// representant par devise/zone, adresse plausible pour que Gelato accepte
// l'adresse (code postal/ville reels).
const PAYS_A_TESTER = [
  { country: 'FR', city: 'Paris', postCode: '75001', currency: 'EUR' },
  { country: 'BE', city: 'Bruxelles', postCode: '1000', currency: 'EUR' },
  { country: 'CH', city: 'Geneve', postCode: '1201', currency: 'CHF' },
  { country: 'LU', city: 'Luxembourg', postCode: '1000', currency: 'EUR' },
  { country: 'CA', city: 'Montreal', postCode: 'H3B 1A1', currency: 'CAD' },
  { country: 'MC', city: 'Monaco', postCode: '98000', currency: 'EUR' },
  { country: 'DE', city: 'Berlin', postCode: '10115', currency: 'EUR' },
  { country: 'ES', city: 'Madrid', postCode: '28001', currency: 'EUR' },
  { country: 'IT', city: 'Roma', postCode: '00100', currency: 'EUR' },
  { country: 'GB', city: 'London', postCode: 'SW1A 1AA', currency: 'GBP' },
  { country: 'US', city: 'New York', postCode: '10001', currency: 'USD' },
  { country: 'NL', city: 'Amsterdam', postCode: '1011AB', currency: 'EUR' },
  { country: 'PT', city: 'Lisboa', postCode: '1100-048', currency: 'EUR' },
  { country: 'MA', city: 'Casablanca', postCode: '20000', currency: 'MAD' },
  { country: 'TN', city: 'Tunis', postCode: '1000', currency: 'TND' },
  { country: 'DZ', city: 'Alger', postCode: '16000', currency: 'DZD' }
];

async function main() {
  const args = process.argv.slice(2);
  const bookId = args.find((arg) => !arg.startsWith('--'));
  const keep = args.includes('--keep');
  const formatFlag = args.find((arg) => arg.startsWith('--format='));
  const formatOverride = formatFlag ? formatFlag.split('=')[1] : null;
  if (!bookId) {
    console.error('Usage: node scripts/explore-gelato-shipping.js <bookId> [--format=livret|standard|luxe] [--keep]');
    process.exit(1);
  }

  const { data: book, error: bookError } = await supabase.from('books').select('*').eq('id', bookId).single();
  if (bookError || !book) {
    console.error('Livre introuvable:', bookError?.message);
    process.exit(1);
  }
  const effectiveFormatId = formatOverride || book.print_format;
  console.log(`Livre: "${book.title}" — format teste=${effectiveFormatId} — page_count=${book.page_count}\n`);

  const [interiorPages, items, layouts, template] = await Promise.all([
    bookContentService.listPages(bookId),
    bookContentService.listContentItems(bookId),
    templateCatalog.listActiveLayouts(),
    book.template_id ? templateCatalog.getTemplateById(book.template_id) : Promise.resolve(null)
  ]);
  if (interiorPages.length === 0) {
    console.error("Ce livre n'a aucune page interieure composee. Abandon.");
    process.exit(1);
  }

  const format = resolveRenderFormat(effectiveFormatId);
  const gelatoProduct = resolveGelatoProduct(effectiveFormatId);
  const pageCount = resolveGelatoPageCount(interiorPages.length, effectiveFormatId);

  console.log('=== Generation du fichier d\'impression (une seule fois, reutilise pour tous les pays) ===\n');
  const outputPath = path.join(
    require('../services/composition/pdfService').PDF_PREVIEW_DIR,
    `explore-shipping-${effectiveFormatId}-${bookId}-${Date.now()}.pdf`
  );
  const result = await buildGelatoPrintReadyPdf({
    book, items, layouts, template, format, interiorPages,
    gelatoProductUid: gelatoProduct.productUid, pageCount, outputPath
  });
  console.log(`Fichier: ${result.outputPath} (${(fs.statSync(result.outputPath).size / 1024 / 1024).toFixed(1)} Mo)\n`);

  const stamp = Date.now();
  const fileUrl = await uploadPrintFile(result.outputPath, `test-orders/${bookId}/${stamp}-${effectiveFormatId}-shipping-explore.pdf`);
  console.log('Fichier heberge:', fileUrl, '\n');

  const resultats = [];
  for (const cible of PAYS_A_TESTER) {
    const payload = gelatoClient.buildOrderPayload({
      orderReferenceId: `SHIP-${effectiveFormatId}-${cible.country}-${stamp}`,
      orderType: 'draft',
      currency: cible.currency,
      shippingAddress: {
        firstName: 'Test', lastName: 'Celebrons',
        addressLine1: '1 Test Street', city: cible.city, postCode: cible.postCode, country: cible.country,
        email: 'test@example.com'
      },
      productUid: gelatoProduct.productUid,
      pageCount,
      interiorFileUrl: fileUrl
    });
    // Valeur volontairement "fausse" : voir le commentaire d'en-tete, ce
    // qui compte est de fournir N'IMPORTE QUEL UID pour declencher le vrai
    // calcul (Gelato retombe sur sa methode la moins chere disponible).
    payload.shipmentMethodUid = 'dhl_global_mail';

    try {
      // eslint-disable-next-line no-await-in-loop
      const order = await gelatoClient.createOrder(payload);
      const recu = order.receipts?.[0]?.items?.find((i) => i.type === 'shipment');
      const ligne = {
        country: cible.country, currency: cible.currency,
        itemPrice: order.items?.[0]?.price,
        shipmentMethodName: order.shipment?.shipmentMethodName,
        shipmentMethodUid: order.shipment?.shipmentMethodUid,
        shippingPriceBase: order.shipment?.price,
        shippingPriceInclVat: recu?.priceInclVat,
        minDeliveryDays: order.shipment?.minDeliveryDays,
        maxDeliveryDays: order.shipment?.maxDeliveryDays,
        orderId: order.id
      };
      resultats.push(ligne);
      console.log(`${cible.country} ${cible.currency} | impression ${ligne.itemPrice} | livraison "${ligne.shipmentMethodName}" ${ligne.shippingPriceBase} HT / ${ligne.shippingPriceInclVat} TTC | ${ligne.minDeliveryDays}-${ligne.maxDeliveryDays}j`);
    } catch (error) {
      console.log(`${cible.country}: ECHEC — ${error.message}`);
      resultats.push({ country: cible.country, currency: cible.currency, error: error.message, body: error.body });
    }
  }

  if (!keep) {
    for (const r of resultats) {
      if (r.orderId) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await gelatoClient.deleteOrder(r.orderId);
        } catch (_e) { /* non bloquant */ }
      }
    }
    console.log('\nCommandes de test supprimees.');
  }

  const outFile = path.join(__dirname, `../tmp/shipping-${effectiveFormatId}-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(resultats, null, 2));
  console.log(`\nResultats ecrits dans ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nErreur:', error.message);
    if (error.body) console.error(JSON.stringify(error.body, null, 2));
    process.exit(1);
  });
