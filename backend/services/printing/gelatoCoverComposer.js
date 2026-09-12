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
//   - Tranche (spine) : couleur unie (theme.accent), SANS texte. Un vrai
//     rendu de tranche (titre en petit, vertical) est repousse a une passe
//     suivante — ne bloque pas un premier test de connectivite.
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
  const fullSheetSize = dims.wraparoundInsideSize || dims.bleedSize;
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

  const spineRect = await sharp({
    create: {
      width: mmToPx(dims.spineSize.width),
      height: mmToPx(dims.spineSize.height),
      channels: 3,
      background: theme.accent || '#8f8a7c'
    }
  }).png().toBuffer();

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
