// backend/services/printing/gelatoPrintFile.js
//
// Assemble le VRAI fichier d'impression attendu par Gelato pour un livre a
// couverture rigide, decouvert le 2026-09-10 via leur outil officiel
// ("Telecharger le fichier d'impression" depuis la fiche produit du
// catalogue, dashboard.gelato.com/catalogue/.../product-hardcover-photo-book) :
// UN SEUL fichier PDF, PAS deux fichiers separes.
//   - Page 1 = la couverture wraparound complete (taille EXACTE renvoyee
//     par products/{uid}/cover-dimensions — voir gelatoCoverComposer.js).
//   - Pages 2..N = le contenu interieur, chacune a trim+bleed (216x286mm
//     pour du 21x28cm, soit 3mm de fond perdu par cote — confirme par un
//     vrai message de rejet Gelato : "Product requires 216x286mm, content
//     area 210x280mm").
//   - N (nombre de pages interieures) doit atteindre EXACTEMENT
//     dims.pagesCount (le meme total "+4" que cover-dimensions calcule
//     deja pour la tranche — confirme empiriquement : 28 pages reelles
//     envoyees a Gelato, ce validateur exige 32 interieures + 1 couverture
//     = 33 au total). Complete par des pages blanches en fin de document
//     UNIQUEMENT (jamais avant le contenu reel, pour ne pas decaler la
//     numerotation deja gravee dans les captures).
//
// REMPLACE l'approche precedente (2 fichiers separes, type:'default' +
// type:'cover', voir gelatoClient.js) : cette derniere etait acceptee SANS
// erreur par l'API de creation de commande (validation permissive a ce
// niveau), mais ne correspond PAS a ce que ce validateur officiel — la
// seule source vraiment autorisee sur ce que Gelato imprimera reellement —
// exige. gelatoClient.buildOrderPayload garde neanmoins interiorFileUrl/
// coverFileUrl separes pour compatibilite ; a partir de maintenant, un
// SEUL fichier combine (construit ici) doit etre passe en interiorFileUrl,
// coverFileUrl reste vide.

const fs = require('fs');
const PDFDocument = require('pdfkit');
const pdfService = require('../composition/pdfService');
const { composeGelatoWraparoundCover } = require('./gelatoCoverComposer');

const MM_TO_PT = 72 / 25.4;
// Confirme empiriquement le 2026-09-10 via un vrai rejet du validateur
// Gelato pour du 21x28cm (216x286mm attendu contre 210x280mm fourni).
const GELATO_BLEED_MM = 3;

/**
 * @param {object} input - { book, items, layouts, template, format, interiorPages, gelatoProductUid, pageCount, outputPath, scale }
 * @returns {Promise<{outputPath, totalPages, coverSizeMm, interiorSizeMm, realInteriorPages, paddedInteriorPages}>}
 */
async function buildGelatoPrintReadyPdf({
  book,
  items,
  layouts,
  template,
  format,
  interiorPages,
  gelatoProductUid,
  pageCount,
  outputPath,
  scale
}) {
  const { buffer: coverBuffer, dims } = await composeGelatoWraparoundCover({
    book, items, template, format, gelatoProductUid, pageCount
  });
  const fullSheetSize = dims.wraparoundInsideSize || dims.bleedSize;

  const realPages = interiorPages.map((page, index) => ({ ...page, page_index: index }));
  const interiorImages = await pdfService.capturePagesAsImages({
    book, pages: realPages, items, layouts, format, scale, bleedMm: GELATO_BLEED_MM
  });

  // dims.pagesCount = le VRAI total interieur exige par Gelato pour ce
  // pageCount (meme convention "+4" deja observee sur cover-dimensions,
  // desormais confirmee necessaire aussi pour le fichier lui-meme, pas
  // seulement pour le calcul de la tranche).
  const targetInteriorCount = dims.pagesCount || realPages.length;
  const missing = Math.max(0, targetInteriorCount - interiorImages.length);
  if (missing > 0) {
    const blankPage = { page_index: interiorImages.length, layout_id: null, content: {} };
    const [blankImage] = await pdfService.capturePagesAsImages({
      book, pages: [blankPage], items, layouts, format, scale, bleedMm: GELATO_BLEED_MM
    });
    for (let i = 0; i < missing; i += 1) interiorImages.push(blankImage);
  }

  const interiorWidthPt = (format.trimWidthMm + GELATO_BLEED_MM * 2) * MM_TO_PT;
  const interiorHeightPt = (format.trimHeightMm + GELATO_BLEED_MM * 2) * MM_TO_PT;
  const coverWidthPt = fullSheetSize.width * MM_TO_PT;
  const coverHeightPt = fullSheetSize.height * MM_TO_PT;

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(outputPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    doc.addPage({ size: [coverWidthPt, coverHeightPt], margin: 0 });
    doc.image(coverBuffer, 0, 0, { width: coverWidthPt, height: coverHeightPt });

    for (const image of interiorImages) {
      doc.addPage({ size: [interiorWidthPt, interiorHeightPt], margin: 0 });
      doc.image(image, 0, 0, { width: interiorWidthPt, height: interiorHeightPt });
    }

    doc.end();
  });

  return {
    outputPath,
    totalPages: 1 + interiorImages.length,
    coverSizeMm: fullSheetSize,
    interiorSizeMm: {
      width: format.trimWidthMm + GELATO_BLEED_MM * 2,
      height: format.trimHeightMm + GELATO_BLEED_MM * 2
    },
    realInteriorPages: realPages.length,
    paddedInteriorPages: missing
  };
}

module.exports = { buildGelatoPrintReadyPdf, GELATO_BLEED_MM };
