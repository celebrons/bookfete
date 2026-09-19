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
//   - Le cahier interieur compte EXACTEMENT `pageCount` + 2 pages, dont la
//     PREMIERE et la DERNIERE sont blanches : ce sont les gardes, collees
//     aux plats de la couverture. Il reste donc `pageCount - 2` pages
//     composables.
//
//     Corrige le 2026-09-16 sur le gabarit officiel telecharge par le
//     client (declare a 32 pages : 33 pages en tout = 1 couverture + 32
//     interieures, dont 30 composables). On visait auparavant
//     dims.pagesCount, soit declare + 4, en ajoutant les blanches a la fin
//     seulement : le fichier portait 4 pages de trop et aucune garde en
//     tete. dims.pagesCount ne compte pas les pages interieures — il ajoute
//     les 4 pages de la couverture (verifie sur les 3 formats : la reponse
//     vaut toujours exactement entree + 4, ce qui exclut un arrondi a un
//     palier imprimable).
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
const { GELATO_ENDPAPER_PAGES, interiorPagesForGelato } = require('./gelatoCatalog');

const MM_TO_PT = 72 / 25.4;
// Confirme empiriquement le 2026-09-10 via un vrai rejet du validateur
// Gelato pour du 21x28cm (216x286mm attendu contre 210x280mm fourni).
// Largeur maximale des photos embarquees dans le fichier d impression.
//
// Une page de 216 mm (fond perdu compris) capturee a 288 dpi tient dans
// 2449 pixels. Au-dela, les pixels ne sont jamais imprimes : ils ne font
// qu'alourdir le fichier. Mesure du 2026-09-19 : les photos du livre en
// portaient 4284, et le fichier atteignait 50,4 Mo pour un bucket qui en
// accepte 50.
//
// 2600 laisse une marge confortable au-dessus des 2449 utiles.
const LARGEUR_PHOTO_IMPRESSION = 2600;

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
  scale,
  // Progression REELLE (2026-09-11) : la generation dure plusieurs minutes
  // (~15 s par page), l'appelant doit pouvoir l'afficher. Optionnel : sans
  // callback, comportement strictement inchange.
  onProgress
}) {
  const report = (phase, done = 0, total = 0) => {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress({ phase, done, total });
    } catch (_error) {
      // Jamais bloquant : un rapport de progression ne doit pas casser un rendu.
    }
  };

  report('cover');
  const { buffer: coverBuffer, dims } = await composeGelatoWraparoundCover({
    book, items, template, format, gelatoProductUid, pageCount
  });
  const fullSheetSize = dims.wraparoundInsideSize || dims.bleedSize;

  const realPages = interiorPages.map((page, index) => ({ ...page, page_index: index }));
  report('pages', 0, realPages.length);
  const interiorImages = await pdfService.capturePagesAsImages({
    book,
    pages: realPages,
    items,
    layouts,
    format,
    scale,
    bleedMm: GELATO_BLEED_MM,
    // La resolution reellement imprimable, pas celle du telephone qui a
    // pris la photo. Voir capturePagesAsImages : 2449 px suffisent pour
    // une page de 216 mm a 288 dpi, on garde une marge.
    imageMaxWidth: LARGEUR_PHOTO_IMPRESSION,
    onProgress: ({ done, total }) => report('pages', done, total)
  });

  // Le cahier interieur fait EXACTEMENT `pageCount` pages, garde blanche en
  // tete et garde blanche en fin (voir l'en-tete de ce fichier). Une seule
  // page blanche est rendue puis reutilisee : elles sont identiques.
  const targetInteriorCount = interiorPagesForGelato(pageCount);
  const [blankImage] = await pdfService.capturePagesAsImages({
    book,
    pages: [{ page_index: 0, layout_id: null, content: {} }],
    items,
    layouts,
    format,
    scale,
    bleedMm: GELATO_BLEED_MM
  });

  // Garde de tete, puis le contenu, puis autant de blanches que necessaire
  // pour atteindre le total declare (au minimum la garde de fin).
  interiorImages.unshift(blankImage);
  const missing = Math.max(1, targetInteriorCount - interiorImages.length);
  for (let i = 0; i < missing; i += 1) interiorImages.push(blankImage);

  const interiorWidthPt = (format.trimWidthMm + GELATO_BLEED_MM * 2) * MM_TO_PT;
  const interiorHeightPt = (format.trimHeightMm + GELATO_BLEED_MM * 2) * MM_TO_PT;
  const coverWidthPt = fullSheetSize.width * MM_TO_PT;
  const coverHeightPt = fullSheetSize.height * MM_TO_PT;

  report('assembling', interiorImages.length, interiorImages.length);
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
    // Toutes les blanches du cahier : la garde de tete + celles de la fin.
    paddedInteriorPages: missing + 1
  };
}

module.exports = { buildGelatoPrintReadyPdf, GELATO_BLEED_MM };
