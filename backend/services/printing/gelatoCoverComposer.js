// backend/services/printing/gelatoCoverComposer.js
//
// Compose UN fichier de couverture "wraparound" (4e de couverture + tranche
// + 1ere de couverture, cote a cote sur un seul panneau) pret pour Gelato —
// different de notre coverComposer.js existant, qui traite recto/verso
// comme deux PAGES separees (pensees pour l'apercu ecran/l'atelier, jamais
// assemblees physiquement). Necessaire car Gelato n'accepte PAS deux
// fichiers face-a-face pour une couverture : un seul fichier a la geometrie
// exacte renvoyee par products/{uid}/cover-dimensions (varie avec le nombre
// de pages, la tranche s'epaissit avec le contenu).
//
// PASSE 1 (2026-09-09, premier test d'integration) — simplifications
// assumees, a ameliorer une fois la connexion bout-en-bout validee :
//   - Tranche (spine) : REGLE le 2026-09-25 — elle porte desormais le titre
//     et l'annee (voir gelatoSpine.js). Elle est restee un aplat de couleur
//     tant qu'on ne savait pas quelle place l'imprimeur laissait vraiment ;
//     le premier livre recu a repondu.
//   - Zones de rabat/jointure (joint back/front, wraparoundEdge) : remplies
//     de la couleur de fond du theme (theme.paper), pas d'extension
//     "bleed" du contenu du recto/verso dans ces zones (un vrai fond perdu
//     demanderait de re-rendre le recto/verso plus grand que leur panneau
//     puis de rogner — pas fait ici).
//
// Reutilise le contenu (variante/photos/titre) choisi par
// coverComposer.composeFrontCover/composeBackCover — la meme decision
// editoriale que l'apercu ecran, jamais une double logique — seule la
// TAILLE du panneau de capture differe (celle du vrai panneau imprimeur,
// pas le format plein-page habituel).

const sharp = require('../../config/sharp');
const pageRenderer = require('../composition/pageRenderer');
const pdfService = require('../composition/pdfService');
const { composeFrontCover, composeBackCover } = require('../composition/coverComposer');
const { fetchCoverDimensions } = require('./gelatoProductApi');
const { construireSvgDuDos } = require('./gelatoSpine');

// Meme resolution que pdfService.js (SCREENSHOT_SCALE=3, ~288dpi) — les
// images capturees ET le canvas final doivent utiliser la MEME echelle
// px/mm, sinon les positions (contentBackSize.left, spineSize.width...)
// calculees en mm ne tombent plus au bon endroit en pixels une fois
// composites.
const PX_PER_MM = (96 / 25.4) * pdfService.SCREENSHOT_SCALE;

function mmToPx(mm) {
  return Math.round(mm * PX_PER_MM);
}

/**
 * @param {object} input - { book, items, template, format, gelatoProductUid, pageCount }
 * @returns {Promise<Buffer>} PNG du panneau de couverture complet (wraparound)
 */
async function composeGelatoWraparoundCover({ book, items, template, format, gelatoProductUid, pageCount }) {
  const dims = await fetchCoverDimensions(gelatoProductUid, pageCount);

  // Contenu editorial (theme/variante/photos) : identique a l'apercu ecran.
  const frontPage = composeFrontCover({ book, items, template, format });
  const backPage = composeBackCover({
    book,
    items,
    template,
    format,
    frontCoverItemIds: frontPage.content.itemIds
  });
  const theme = frontPage.content.theme || {};

  // Panneau recto/verso : meme taille pour les deux chez Gelato (verifie
  // empiriquement) — un seul `format` de capture suffit pour les deux.
  const panelFormat = {
    ...format,
    trimWidthMm: dims.contentBackSize.width,
    trimHeightMm: dims.contentBackSize.height
  };

  const [backImage, frontImage] = await pdfService.capturePagesAsImages({
    book,
    pages: [
      { ...backPage, page_index: 0 },
      { ...frontPage, page_index: 1 }
    ],
    items,
    layouts: [],
    format: panelFormat
  });

  // Forme de reponse DIFFERENTE entre couverture rigide et souple (verifie
  // empiriquement le 2026-09-09 en testant les 3 formats reels) : rigide
  // renvoie `wraparoundInsideSize` (+ wraparoundEdgeSize/jointBackSize/
  // jointFrontSize, non utilises ici), souple renvoie `bleedSize` a la
  // place (memes champs width/height/left/top, juste un nom different — pas
  // de zone de jointure separee, la tranche touche directement les panneaux
  // recto/verso puisqu'il n'y a pas de carton rigide a plier autour).
  // AUCUN REPLI SILENCIEUX SUR LA TAILLE DE COUVERTURE.
  //
  // C'est Gelato qui fait foi : la taille depend du nombre de pages (epaisseur
  // du dos) et du cartonnage. La deviner reviendrait a imprimer une couverture
  // qui ne couvre pas.
  //
  // Le 2026-09-19, deux fichiers produits a deux heures d'intervalle par le
  // MEME code portaient 428,88 x 286 puis 478 x 326 mm : la reponse de l'API
  // avait manque une fois, et le code s'etait rabattu en silence. Un fichier
  // est donc parti avec une couverture trop petite sans que rien ne le
  // signale. Mieux vaut echouer et relancer.
  const fullSheetSize = dims.wraparoundInsideSize || dims.bleedSize;
  if (!fullSheetSize || !fullSheetSize.width || !fullSheetSize.height) {
    throw new Error(
      "Gelato n'a pas renvoye la taille de la couverture (ni wraparoundInsideSize "
      + 'ni bleedSize). Fabrication interrompue : une couverture a une taille '
      + 'devinee serait imprimee de travers. Relancez.'
    );
  }
  const canvasWidthPx = mmToPx(fullSheetSize.width);
  const canvasHeightPx = mmToPx(fullSheetSize.height);

  const backResizedPromise = sharp(backImage)
    .resize(mmToPx(dims.contentBackSize.width), mmToPx(dims.contentBackSize.height), { fit: 'fill' })
    .toBuffer();
  const frontResizedPromise = sharp(frontImage)
    .resize(mmToPx(dims.contentFrontSize.width), mmToPx(dims.contentFrontSize.height), { fit: 'fill' })
    .toBuffer();
  const [backResized, frontResized] = await Promise.all([backResizedPromise, frontResizedPromise]);

  // Fond de tout le panneau = couleur de fond du theme (couvre rabats/
  // jointures) ; tranche surlignee par un bloc de couleur accent par-dessus
  // (voir limitations PASSE 1 en tete de fichier).
  const canvas = sharp({
    create: {
      width: canvasWidthPx,
      height: canvasHeightPx,
      channels: 3,
      background: theme.paper || '#ffffff'
    }
  });

  // LE DOS PORTE LE TITRE ET L'ANNEE (2026-09-25).
  //
  // Il etait jusqu'ici un aplat de couleur, en attendant de savoir ce que
  // l'imprimeur rendait vraiment. Le premier livre recu a tranche : la
  // bande a assez de place, meme a 30 pages — un livre rigide a 6 mm de
  // dos des la pagination minimale.
  //
  // Ecrit a plat puis pivote d'un quart de tour : voir gelatoSpine.js, qui
  // porte aussi le seuil en dessous duquel on ne signe pas le dos.
  const svgDuDos = construireSvgDuDos({
    largeurMm: dims.spineSize.width,
    hauteurMm: dims.spineSize.height,
    pxParMm: PX_PER_MM,
    fond: theme.accent || '#8f8a7c',
    titre: frontPage.content?.title || book?.title || '',
    date: frontPage.content?.dateLabel || ''
  });
  const spineRect = await sharp(Buffer.from(svgDuDos))
    // Le quart de tour horaire met la lecture de HAUT EN BAS, livre debout.
    .rotate(90)
    .png()
    .toBuffer();

  const composited = await canvas
    .composite([
      { input: spineRect, left: mmToPx(dims.spineSize.left), top: mmToPx(dims.spineSize.top) },
      { input: backResized, left: mmToPx(dims.contentBackSize.left), top: mmToPx(dims.contentBackSize.top) },
      { input: frontResized, left: mmToPx(dims.contentFrontSize.left), top: mmToPx(dims.contentFrontSize.top) }
    ])
    .png()
    .toBuffer();

  return { buffer: composited, dims };
}

module.exports = { composeGelatoWraparoundCover, PX_PER_MM };
