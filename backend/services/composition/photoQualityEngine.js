// backend/services/composition/photoQualityEngine.js
//
// Calcule la resolution effective (DPI) d'une photo TELLE QU'ELLE SERA
// REELLEMENT IMPRIMEE dans son emplacement — c'est-a-dire sur la zone
// physique (mm) reellement couverte par l'image une fois object-fit:cover
// applique (voir pageRenderer.js), PAS sur la taille brute du fichier
// source (cahier des charges "PhotoSlot", 2026-09-10, §9/§10 : "NE PAS
// calculer le DPI uniquement a partir de la taille originale de la photo").
//
// Fonction pure, aucun acces reseau/disque — meme garantie que
// layoutScoring.js, dont ce module reutilise directement PHOTO_SLOT_RATIOS
// (la FORME reelle de chaque emplacement, deja documentee/verifiee contre
// le vrai CSS grid de pageRenderer.js) plutot que d'en re-deriver un second
// calcul independant qui pourrait diverger avec le temps.

const { PHOTO_SLOT_RATIOS } = require('./layoutScoring');
const { resolveCoverFormat } = require('./coverFormat');
const { resolveFormatDensity } = require('./formatDensity');

const MM_PER_INCH = 25.4;

// Memes constantes que BASE_CSS (pageRenderer.js) : padding de page
// (calc(14mm * scale)) et gap de grille photo (calc(3mm * scale)). Codees
// en dur ici pour la meme raison que d'autres constantes visuelles le sont
// deja ailleurs dans ce module de composition (coverTheme.js, etc.) — ce
// module reste une fonction pure, sans dependance a un parseur CSS.
const PAGE_PADDING_MM = 14;
const GRID_GAP_MM = 3;

// Surface reellement disponible pour le contenu d'une page (apres marges),
// et gap de grille effectif — les deux mis a l'echelle par spaceScale
// (formatDensity.js), exactement comme --fmt-space-scale en CSS.
function resolveUsableAreaMm(formatId) {
  const { trimWidthMm, trimHeightMm } = resolveCoverFormat(formatId);
  const { spaceScale } = resolveFormatDensity(formatId);
  const scale = spaceScale ?? 1;
  const pad = PAGE_PADDING_MM * scale;
  return {
    widthMm: Math.max(1, trimWidthMm - 2 * pad),
    heightMm: Math.max(1, trimHeightMm - 2 * pad),
    gapMm: GRID_GAP_MM * scale
  };
}

// Nombre de colonnes REELLEMENT occupees par ce slot pour ce slug — lu
// directement dans les regles grid-template-columns de BASE_CSS
// (pageRenderer.js : .photo-grid-2/.photo-grid-4/.title-photos-grid-2/-3/-4
// sont toutes a 2 colonnes ; .photo-grid-3 n'a 2 colonnes que pour ses 2
// premiers slots, le 3e prenant toute la largeur via nth-child(3)).
function resolveSlotColumns(slug, slotIndex) {
  if (slug === 'TWO_PHOTOS' || slug === 'TITLE_TWO_PHOTOS' || slug === 'FOUR_PHOTOS' || slug === 'TITLE_FOUR_PHOTOS') return 2;
  if (slug === 'THREE_PHOTOS') return slotIndex === 2 ? 1 : 2;
  return null;
}

/**
 * Taille physique (mm) reellement couverte par la photo dans ce slot, une
 * fois object-fit:cover applique — jamais la taille du fichier source.
 * Reutilise PHOTO_SLOT_RATIOS (layoutScoring.js) pour la FORME (largeur
 * connue avec certitude via le nombre de colonnes -> hauteur deduite du
 * ratio deja valide, plutot que re-derivee independamment).
 * @returns {{widthMm:number, heightMm:number}|null} null si le slug/slot
 *   n'est pas reconnu par cette table — l'appelant doit alors s'abstenir
 *   d'evaluer la qualite pour ce slot plutot que de deviner.
 */
function resolveSlotSizeMm(layoutSlug, slotIndex, formatId) {
  const expectedRatios = PHOTO_SLOT_RATIOS[layoutSlug];
  if (!expectedRatios) return null;
  const rawRatio = expectedRatios[slotIndex];
  if (!rawRatio) return null;

  const { widthMm: usableW, heightMm: usableH, gapMm: gap } = resolveUsableAreaMm(formatId);

  // FULL_PHOTO/PHOTO_WITH_CAPTION : la photo occupe (quasi) toute la page —
  // meme repli "page entiere" que PAGE_RATIO_BY_FORMAT dans layoutScoring.js.
  if (rawRatio === 'page') {
    return { widthMm: usableW, heightMm: usableH };
  }

  const columns = resolveSlotColumns(layoutSlug, slotIndex);
  if (!columns) return null;
  const widthMm = columns === 2 ? (usableW - gap) / 2 : usableW;
  const heightMm = widthMm / rawRatio;
  return { widthMm, heightMm };
}

/**
 * DPI effectif = densite de pixels source sur la zone mm REELLEMENT
 * couverte (jamais la photo entiere) apres cover-fit, divisee par le zoom
 * manuel eventuel (zoomer = etaler moins de pixels sources sur la meme
 * zone physique = DPI plus bas). Formule verifiee a la main contre
 * l'exemple du cahier des charges (§9) : 4000x3000px, cadre 20x20cm ->
 * 3000x3000px reellement utilises -> ~381 DPI.
 * @returns {number|null} null si des donnees essentielles manquent
 *   (jamais bloquant pour l'appelant — voir qualityLevelForDpi/describeQuality).
 */
function computeEffectiveDpi({ imageWidthPx, imageHeightPx, frameWidthMm, frameHeightMm, zoom }) {
  if (!imageWidthPx || !imageHeightPx || !frameWidthMm || !frameHeightMm) return null;
  const frameWidthIn = frameWidthMm / MM_PER_INCH;
  const frameHeightIn = frameHeightMm / MM_PER_INCH;
  const baseDpi = Math.min(imageWidthPx / frameWidthIn, imageHeightPx / frameHeightIn);
  const effectiveZoom = zoom && zoom > 0 ? zoom : 1;
  return baseDpi / effectiveZoom;
}

// 5 paliers internes (§10 du cahier des charges) — utilises pour les tests
// et le tri/statistiques ; jamais affiches tels quels a l'utilisateur (voir
// QUALITY_DISPLAY ci-dessous, qui en regroupe 2 sous un seul message).
const QUALITY_TIERS = [
  { level: 'excellent', minDpi: 300 },
  { level: 'tres-bon', minDpi: 250 },
  { level: 'bon', minDpi: 200 },
  { level: 'attention', minDpi: 150 },
  { level: 'faible', minDpi: 0 }
];

// Messages utilisateur (§10/§19) : jamais le mot "DPI". 'tres-bon' et 'bon'
// partagent volontairement le meme message/emoji — la distinction fine des
// 5 paliers internes n'a pas besoin d'etre visible, seule la decision
// "j'affiche un avertissement ou pas" compte pour l'utilisateur.
const QUALITY_DISPLAY = {
  excellent: { emoji: '🟢', label: 'Excellente qualité d\'impression' },
  'tres-bon': { emoji: '🟡', label: 'Bonne qualité d\'impression' },
  bon: { emoji: '🟡', label: 'Bonne qualité d\'impression' },
  attention: { emoji: '🟠', label: 'Cette photo pourrait être légèrement moins nette' },
  faible: { emoji: '🔴', label: 'Résolution insuffisante pour cette taille' }
};

function qualityLevelForDpi(dpi) {
  const safeDpi = Number.isFinite(dpi) ? dpi : 0;
  return QUALITY_TIERS.find((tier) => safeDpi >= tier.minDpi)?.level || 'faible';
}

// Sortie prete a l'emploi pour une UI (badge + tooltip) : jamais de DPI cru.
function describeQuality(dpi) {
  const level = qualityLevelForDpi(dpi);
  return { level, dpi: Number.isFinite(dpi) ? Math.round(dpi) : null, ...QUALITY_DISPLAY[level] };
}

module.exports = {
  resolveUsableAreaMm,
  resolveSlotSizeMm,
  computeEffectiveDpi,
  qualityLevelForDpi,
  describeQuality,
  QUALITY_TIERS,
  QUALITY_DISPLAY,
  PAGE_PADDING_MM,
  GRID_GAP_MM
};
