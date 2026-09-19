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

const fsp = require('fs/promises');
const { pathToFileURL } = require('url');
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

  // LE CAHIER INTERIEUR, PAGE PAR PAGE, DANS L ORDRE EXACT ATTENDU.
  //
  // Regle validee avec Gelato et jamais remise en cause : le cahier fait
  // EXACTEMENT pageCount + 2 pages, la PREMIERE et la DERNIERE blanches
  // (ce sont les gardes, collees aux plats de la couverture). Il reste donc
  // pageCount - 2 pages composables.
  //
  // Une page blanche est un objet de page sans contenu : le moteur de rendu
  // la produit vide, a la bonne taille et avec le meme fond perdu que les
  // autres. Aucune image a fabriquer ni a dupliquer.
  const pageBlanche = () => ({ page_index: 0, layout_id: null, content: {} });
  const cibleInterieur = interiorPagesForGelato(pageCount);

  const pagesInterieures = [pageBlanche(), ...realPages];
  // Autant de blanches que necessaire pour atteindre le total declare, au
  // minimum la garde de fin.
  const blanchesDeFin = Math.max(1, cibleInterieur - pagesInterieures.length);
  for (let i = 0; i < blanchesDeFin; i += 1) pagesInterieures.push(pageBlanche());

  // Le moteur trie les pages par page_index : il faut donc les renumeroter
  // APRES avoir insere les gardes, sinon les blanches (toutes a 0)
  // remonteraient en tete.
  const pagesNumerotees = pagesInterieures.map((page, index) => ({ ...page, page_index: index }));

  // La couverture composee devient la premiere page du document, a sa
  // propre taille. Elle passe par un fichier plutot que par une URL de
  // donnees : un data:URI de plusieurs Mo alourdit inutilement le HTML.
  const cheminCouverture = `${outputPath}.couverture.png`;
  await fsp.writeFile(cheminCouverture, coverBuffer);

  try {
    report('pages', 0, pagesNumerotees.length);

    // RENDU PAR IMPRESSION plutot que par 33 captures d ecran (2026-09-19).
    //
    // L ancienne methode photographiait chaque page en 2449x3243, renvoyait
    // l image en base64 sur la connexion de debogage, puis la reencodait
    // avec sharp. Trois couts, dont deux inutiles : sur une machine a deux
    // coeurs, Node passait a 59 % de processeur et le site ne repondait
    // plus pendant toute la fabrication. Et une capture trop grosse ne
    // revenait jamais — c est ce qui faisait echouer tous les envois.
    //
    // Chrome ecrit ici le PDF lui-meme, en flux, avec les photos integrees
    // une seule fois. Le format ne change pas : memes tailles de page,
    // meme fond perdu, meme nombre de pages, memes gardes.
    const produit = await pdfService.renderPdfByPrinting({
      book,
      pages: pagesNumerotees,
      items,
      layouts,
      format,
      bleedMm: GELATO_BLEED_MM,
      imageMaxWidth: LARGEUR_PHOTO_IMPRESSION,
      coverSheet: {
        url: pathToFileURL(cheminCouverture).href,
        widthMm: fullSheetSize.width,
        heightMm: fullSheetSize.height
      },
      fileBaseName: `gelato-${Date.now()}`,
      onProgress: ({ phase, done, total }) => {
        // Le rendu compte des PHOTOS chargees ; l ecran de commande, lui,
        // parle de pages. On garde son vocabulaire.
        report(phase === 'photos' ? 'pages' : phase, done, total);
      }
    });

    report('assembling', pagesNumerotees.length, pagesNumerotees.length);
    await fsp.rename(produit, outputPath).catch(async () => {
      // rename echoue entre deux volumes : on recopie.
      await fsp.copyFile(produit, outputPath);
      await fsp.unlink(produit).catch(() => {});
    });
  } finally {
    await fsp.unlink(cheminCouverture).catch(() => {});
  }

  return {
    outputPath,
    totalPages: 1 + pagesNumerotees.length,
    coverSizeMm: fullSheetSize,
    interiorSizeMm: {
      width: format.trimWidthMm + GELATO_BLEED_MM * 2,
      height: format.trimHeightMm + GELATO_BLEED_MM * 2
    },
    realInteriorPages: realPages.length,
    // Toutes les blanches du cahier : la garde de tete + celles de la fin.
    paddedInteriorPages: blanchesDeFin + 1
  };
}

module.exports = { buildGelatoPrintReadyPdf, GELATO_BLEED_MM };
