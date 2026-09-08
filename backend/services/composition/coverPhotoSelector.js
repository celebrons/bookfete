// backend/services/composition/coverPhotoSelector.js
//
// Selection de la meilleure photo de couverture — scoring pur, jamais de
// decision de variante ici (voir coverComposer.js pour l'arbre de
// decision). Deliberement independant de layoutScoring.js : les signaux
// sont differents (qualite/format d'impression d'UNE photo isolee, pas
// sequencement d'un flux de contenu).
//
// IMPORTANT (cahier des charges) : aucune IA, aucune reconnaissance
// faciale. Le score n'utilise que les metadonnees deja capturees a l'upload
// (backend/services/storageService.js, via `image-size` : width/height/
// orientation/ratio) — jamais une analyse de pixels. Une photo sans
// metadonnee (uploadee avant cette capture) n'est jamais disqualifiee,
// juste notee de facon neutre.
//
// Fonctions pures, aucun acces reseau/disque.

// Poids relatifs, ajustables independamment. Le ratio (correspondance avec
// le format de couverture) domine : c'est le seul signal propre a CE livre
// (les autres sont des proxys generiques de qualite technique).
const SCORE_WEIGHTS = { resolution: 3, ratioFit: 4, orientation: 2 };

// Cote de saturation : au-dela de ce nombre de pixels sur le plus grand
// cote, une resolution plus haute n'ameliore plus le score (suffisant pour
// une impression nette a la taille d'une couverture).
const RESOLUTION_TARGET_PX = 2000;

// Tolerance d'ecart de ratio (photoRatio - coverRatio) au-dela de laquelle
// le score de correspondance tombe a 0.
const RATIO_TOLERANCE = 0.6;

// Score neutre attribue quand une donnee est manquante : ni penalisant ni
// avantageant, pour ne jamais disqualifier une photo faute de metadonnee.
const NEUTRAL_SCORE = 0.5;

function resolutionScoreOf(item) {
  const { width, height } = item?.metadata || {};
  if (!width || !height) return NEUTRAL_SCORE;
  const longestSide = Math.max(width, height);
  return Math.min(1, longestSide / RESOLUTION_TARGET_PX);
}

function ratioFitScoreOf(item, coverRatio) {
  const { width, height } = item?.metadata || {};
  if (!width || !height) return NEUTRAL_SCORE;
  const photoRatio = width / height;
  const distance = Math.abs(photoRatio - coverRatio);
  return Math.max(0, 1 - distance / RATIO_TOLERANCE);
}

function orientationBonusOf(item) {
  const orientation = item?.metadata?.orientation;
  if (orientation === 'portrait') return 1;
  if (orientation === 'square') return 0.5;
  if (orientation === 'landscape') return 0;
  return NEUTRAL_SCORE;
}

/**
 * @param {object} item - book_content_item (kind: 'photo')
 * @param {object} format - coverFormat.resolveCoverFormat() result ({trimWidthMm, trimHeightMm})
 * @returns {number} score dans [0, 1]
 */
function scorePhoto(item, format) {
  const coverRatio = format.trimWidthMm / format.trimHeightMm;
  const resolution = resolutionScoreOf(item);
  const ratioFit = ratioFitScoreOf(item, coverRatio);
  const orientation = orientationBonusOf(item);

  const totalWeight = SCORE_WEIGHTS.resolution + SCORE_WEIGHTS.ratioFit + SCORE_WEIGHTS.orientation;
  return (
    resolution * SCORE_WEIGHTS.resolution
    + ratioFit * SCORE_WEIGHTS.ratioFit
    + orientation * SCORE_WEIGHTS.orientation
  ) / totalWeight;
}

/**
 * @param {Array} items - book_content_items (tous kinds melanges, filtre en interne)
 * @param {object} format - coverFormat.resolveCoverFormat() result
 * @returns {Array<{item, score}>} photos triees par score decroissant ;
 *   egalites departagees par display_order croissant (deterministe, sans
 *   PRNG — ce module reste volontairement independant de layoutEngine.js)
 */
function rankPhotos(items, format) {
  const photos = (items || []).filter((item) => item.kind === 'photo');
  return photos
    .map((item) => ({ item, score: scorePhoto(item, format) }))
    .sort((a, b) => (
      b.score - a.score
      || (a.item.display_order ?? 0) - (b.item.display_order ?? 0)
      || String(a.item.id).localeCompare(String(b.item.id))
    ));
}

module.exports = {
  scorePhoto,
  rankPhotos,
  SCORE_WEIGHTS,
  RESOLUTION_TARGET_PX,
  RATIO_TOLERANCE,
  NEUTRAL_SCORE
};
