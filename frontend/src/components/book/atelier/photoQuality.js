// frontend/src/components/book/atelier/photoQuality.js
//
// Miroir LEGER de backend/services/composition/photoQualityEngine.js —
// meme convention deja etablie dans ce projet pour les petites tables de
// constantes format/geometrie (voir FORMAT_DIMENSIONS_MM, deja dupliquee a
// la main dans AtelierLayoutPanel.js/AtelierBookView.js/etc.), plutot qu'un
// module partage entre back/front. Sert a afficher un badge de qualite
// IMMEDIAT sur l'emplacement rempli (AtelierPageOverlay) sans appel reseau
// — le controle exhaustif reste GET /print-quality-check (backend, source
// de verite), utilise par AtelierFinishModal avant de terminer le livre.
//
// Cahier des charges "PhotoSlot" (2026-09-10), §9/§10.

const MM_PER_INCH = 25.4;
const PAGE_PADDING_MM = 14;
const GRID_GAP_MM = 3;

const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 },
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

// Meme densite que backend/services/composition/formatDensity.js
// (FORMAT_DENSITY.spaceScale) — dupliquee ici pour la meme raison.
const SPACE_SCALE_BY_FORMAT = { livret: 0.62, standard: 1, luxe: 1.55 };

// Meme table que backend/services/composition/layoutScoring.js
// (PHOTO_SLOT_RATIOS) — voir ce fichier pour la derivation complete depuis
// la vraie geometrie CSS.
const PHOTO_SLOT_RATIOS = {
  FULL_PHOTO: ['page'],
  PHOTO_WITH_CAPTION: ['page'],
  TWO_PHOTOS: [0.38, 0.38],
  THREE_PHOTOS: [0.95, 0.95, 1.9],
  FOUR_PHOTOS: [0.95, 0.95, 0.95, 0.95],
  TITLE_TWO_PHOTOS: [1.3, 1.3],
  TITLE_FOUR_PHOTOS: [1.1, 1.1, 1.1, 1.1]
};

function resolveUsableAreaMm(printFormat) {
  const dims = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;
  const scale = SPACE_SCALE_BY_FORMAT[printFormat] ?? 1;
  const pad = PAGE_PADDING_MM * scale;
  return {
    widthMm: Math.max(1, dims.widthMm - 2 * pad),
    heightMm: Math.max(1, dims.heightMm - 2 * pad),
    gapMm: GRID_GAP_MM * scale
  };
}

function resolveSlotColumns(slug, slotIndex) {
  if (slug === 'TWO_PHOTOS' || slug === 'TITLE_TWO_PHOTOS' || slug === 'FOUR_PHOTOS' || slug === 'TITLE_FOUR_PHOTOS') return 2;
  if (slug === 'THREE_PHOTOS') return slotIndex === 2 ? 1 : 2;
  return null;
}

// Voir backend/services/composition/photoQualityEngine.js:resolveSlotSizeMm
// pour le detail du raisonnement (largeur connue via le nombre de colonnes
// -> hauteur deduite du ratio deja valide).
export function resolveSlotSizeMm(layoutSlug, slotIndex, printFormat) {
  const expectedRatios = PHOTO_SLOT_RATIOS[layoutSlug];
  if (!expectedRatios) return null;
  const rawRatio = expectedRatios[slotIndex];
  if (!rawRatio) return null;

  const { widthMm: usableW, heightMm: usableH, gapMm: gap } = resolveUsableAreaMm(printFormat);
  if (rawRatio === 'page') return { widthMm: usableW, heightMm: usableH };

  const columns = resolveSlotColumns(layoutSlug, slotIndex);
  if (!columns) return null;
  const widthMm = columns === 2 ? (usableW - gap) / 2 : usableW;
  return { widthMm, heightMm: widthMm / rawRatio };
}

export function computeEffectiveDpi({ imageWidthPx, imageHeightPx, frameWidthMm, frameHeightMm, zoom }) {
  if (!imageWidthPx || !imageHeightPx || !frameWidthMm || !frameHeightMm) return null;
  const baseDpi = Math.min(imageWidthPx / (frameWidthMm / MM_PER_INCH), imageHeightPx / (frameHeightMm / MM_PER_INCH));
  return baseDpi / (zoom && zoom > 0 ? zoom : 1);
}

const QUALITY_TIERS = [
  { level: 'excellent', minDpi: 300 },
  { level: 'tres-bon', minDpi: 250 },
  { level: 'bon', minDpi: 200 },
  { level: 'attention', minDpi: 150 },
  { level: 'faible', minDpi: 0 }
];

// Memes 4 messages affiches que le backend (jamais le mot "DPI", §10).
const QUALITY_DISPLAY = {
  excellent: { emoji: '🟢', label: "Excellente qualité d'impression" },
  'tres-bon': { emoji: '🟡', label: "Bonne qualité d'impression" },
  bon: { emoji: '🟡', label: "Bonne qualité d'impression" },
  attention: { emoji: '🟠', label: 'Cette photo pourrait être légèrement moins nette' },
  faible: { emoji: '🔴', label: 'Résolution insuffisante pour cette taille' }
};

export function describeQuality(dpi) {
  const safeDpi = Number.isFinite(dpi) ? dpi : 0;
  const level = QUALITY_TIERS.find((tier) => safeDpi >= tier.minDpi)?.level || 'faible';
  return { level, dpi: Number.isFinite(dpi) ? Math.round(dpi) : null, ...QUALITY_DISPLAY[level] };
}

// Raccourci utilise par AtelierPageOverlay.js : qualite d'un item
// reellement place, a partir de ses seules donnees deja en memoire
// (metadata.width/height + l'ajustement eventuellement enregistre) — jamais
// d'appel reseau. Retourne null si des donnees essentielles manquent
// (slug non reconnu par PHOTO_SLOT_RATIOS, item sans metadata...) : les
// appelants n'affichent alors simplement aucun badge, jamais une erreur.
export function describeSlotPhotoQuality({ item, layoutSlug, slotIndex, printFormat, zoom }) {
  const width = item?.metadata?.width;
  const height = item?.metadata?.height;
  if (!width || !height) return null;
  const frame = resolveSlotSizeMm(layoutSlug, slotIndex, printFormat);
  if (!frame) return null;
  const dpi = computeEffectiveDpi({ imageWidthPx: width, imageHeightPx: height, frameWidthMm: frame.widthMm, frameHeightMm: frame.heightMm, zoom });
  if (dpi == null) return null;
  return describeQuality(dpi);
}
