// frontend/src/components/book/atelier/photoQuality.js
//
// Miroir LEGER de backend/services/composition/photoQualityEngine.js —
// meme convention deja etablie dans ce projet pour les petites tables de
// constantes format/geometrie (voir FORMAT_DIMENSIONS_MM, deja dupliquee a
// la main dans AtelierLayoutPanel.js/AtelierBookView.js/etc.), plutot qu'un
// module partage entre back/front. Sert au controle EN TEMPS REEL a
// l'insertion d'une photo dans un cadre (cahier des charges v2, §4.1) :
// badge d'avertissement + detection d'ecart de ratio, sans appel reseau.
// Le controle exhaustif avant commande reste GET /print-quality-check
// (backend, source de verite — voir §4.2).
//
// TOUTE modification ici doit etre repercutee a l'identique cote backend
// (et inversement) : seuils, table des ratios, geometrie des cadres.

const MM_PER_INCH = 25.4;
const PAGE_PADDING_MM = 14;
const GRID_GAP_MM = 3;
// Les mises en page mixtes utilisent un gap de 5mm (.mixte-ordered), pas le
// gap de grille photo de 3mm.
const MIXTE_GAP_MM = 5;
const MIXTE_SLUGS = new Set(['PHOTO_TEXT', 'TEXT_PHOTO', 'TWO_PHOTOS_TEXT']);

export const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 },
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

// Meme densite que backend/services/composition/formatDensity.js
// (FORMAT_DENSITY.spaceScale).
const SPACE_SCALE_BY_FORMAT = { livret: 0.62, standard: 1, luxe: 1.55 };

// Meme table que backend/services/composition/layoutScoring.js
// (PHOTO_SLOT_RATIOS) — voir ce fichier pour la derivation complete depuis
// la vraie geometrie CSS. `null` = emplacement texte (jamais evalue).
const PHOTO_SLOT_RATIOS = {
  FULL_PHOTO: ['page'],
  // 'spread' : cadre de DEUX pages de large, a fond perdu — voir le backend.
  FULL_PHOTO_SPREAD: ['spread'],
  PHOTO_WITH_CAPTION: ['page'],
  TWO_PHOTOS: [0.38, 0.38],
  TWO_PHOTOS_STACKED: [1.46, 1.46],
  THREE_PHOTOS: [0.95, 0.95, 1.9],
  FOUR_PHOTOS: [0.95, 0.95, 0.95, 0.95],
  TITLE_TWO_PHOTOS: [1.3, 1.3],
  TITLE_FOUR_PHOTOS: [1.1, 1.1, 1.1, 1.1],
  PHOTO_TEXT: [1.0, null],
  TEXT_PHOTO: [null, 1.0],
  TWO_PHOTOS_TEXT: [0.75, 0.75, null]
};

// Seuils du cahier des charges v2 : 3 statuts, pas plus.
const DPI_OK = 250;
const DPI_LIMITE = 150;
export const RATIO_GAP_THRESHOLD = 0.15;

// `ok` n'a volontairement aucun message ni badge (critere d'acceptation
// n°1 : une bonne photo ne declenche aucun avertissement visible).
export const FIT_DISPLAY = {
  ok: { severity: null, label: '' },
  limite: { severity: 'warning', label: "Cette photo risque d'apparaître légèrement floue à l'impression" },
  insuffisant: { severity: 'danger', label: "Résolution insuffisante : cette photo risque d'apparaître floue à l'impression" }
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
  // TWO_PHOTOS_STACKED : une seule colonne, deux rangees.
  if (slug === 'TWO_PHOTOS_STACKED') return 1;
  if (slug === 'PHOTO_TEXT' || slug === 'TEXT_PHOTO') return 1;
  if (slug === 'TWO_PHOTOS_TEXT') return 2;
  return null;
}

export function resolveSlotSizeMm(layoutSlug, slotIndex, printFormat) {
  const expectedRatios = PHOTO_SLOT_RATIOS[layoutSlug];
  if (!expectedRatios) return null;
  const rawRatio = expectedRatios[slotIndex];
  if (!rawRatio) return null;

  const { widthMm: usableW, heightMm: usableH, gapMm: gap } = resolveUsableAreaMm(printFormat);
  if (rawRatio === 'page') return { widthMm: usableW, heightMm: usableH };
  // Double page : on raisonne sur les dimensions de ROGNE (la photo deborde
  // volontairement les marges), moins le recouvrement imprime des deux cotes
  // du pli. Miroir de photoQualityEngine.resolveSlotSizeMm —
  // SPREAD_OVERLAP_MM y vaut 4, d'ou les 8 mm retires ici.
  if (rawRatio === 'spread') {
    const dims = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;
    return { widthMm: Math.max(1, dims.widthMm * 2 - 8), heightMm: dims.heightMm };
  }

  const columns = resolveSlotColumns(layoutSlug, slotIndex);
  if (!columns) return null;
  const effectiveGap = MIXTE_SLUGS.has(layoutSlug) ? gap * (MIXTE_GAP_MM / GRID_GAP_MM) : gap;
  const widthMm = columns === 2 ? (usableW - effectiveGap) / 2 : usableW;
  return { widthMm, heightMm: widthMm / rawRatio };
}

// `fitMode` : voir photoQualityEngine.computeEffectiveDpi cote backend —
// l'axe contraignant s'inverse entre `cover` (min) et `contain` (max).
export function computeEffectiveDpi({ imageWidthPx, imageHeightPx, frameWidthMm, frameHeightMm, zoom, fitMode }) {
  if (!imageWidthPx || !imageHeightPx || !frameWidthMm || !frameHeightMm) return null;
  const perAxis = [imageWidthPx / (frameWidthMm / MM_PER_INCH), imageHeightPx / (frameHeightMm / MM_PER_INCH)];
  const baseDpi = fitMode === 'contain' ? Math.max(...perAxis) : Math.min(...perAxis);
  return baseDpi / (zoom && zoom > 0 ? zoom : 1);
}

export function statutForDpi(dpi) {
  if (!Number.isFinite(dpi)) return null;
  if (dpi >= DPI_OK) return 'ok';
  if (dpi >= DPI_LIMITE) return 'limite';
  return 'insuffisant';
}

// Fonction canonique du cahier des charges v2 (§4) — meme signature et
// memes retours que le backend.
export function checkImageFit({ imageWidthPx, imageHeightPx, frameWidthMm, frameHeightMm, zoom, fitMode }) {
  const dpiEffectif = computeEffectiveDpi({ imageWidthPx, imageHeightPx, frameWidthMm, frameHeightMm, zoom, fitMode });
  const statut = statutForDpi(dpiEffectif);
  // Voir le backend : en mode "photo entiere" (sans re-zoom), rien n'est
  // coupe, donc `ratioGap` — qui signifie "une partie est coupee" — est faux.
  const showsWholePhoto = fitMode === 'contain' && !(zoom > 1);

  let ecartRatio = null;
  if (imageWidthPx && imageHeightPx && frameWidthMm && frameHeightMm) {
    const ratioImage = imageWidthPx / imageHeightPx;
    const ratioCadre = frameWidthMm / frameHeightMm;
    ecartRatio = Math.abs(ratioImage - ratioCadre) / ratioCadre;
  }

  return {
    ecartRatio,
    dpiEffectif: Number.isFinite(dpiEffectif) ? Math.round(dpiEffectif) : null,
    statut,
    showsWholePhoto,
    ratioGap: !showsWholePhoto && ecartRatio != null && ecartRatio > RATIO_GAP_THRESHOLD,
    ...(statut ? FIT_DISPLAY[statut] : { severity: null, label: '' })
  };
}

// Raccourci pour un item deja place dans un emplacement connu. Retourne
// null si la photo n'a pas ete sondee a l'upload ou si l'emplacement n'est
// pas evaluable : les appelants n'affichent alors aucun badge.
export function checkSlotImageFit({ item, layoutSlug, slotIndex, printFormat, zoom, fitMode }) {
  const imageWidthPx = item?.metadata?.width;
  const imageHeightPx = item?.metadata?.height;
  if (!imageWidthPx || !imageHeightPx) return null;
  const frame = resolveSlotSizeMm(layoutSlug, slotIndex, printFormat);
  if (!frame) return null;
  return checkImageFit({
    imageWidthPx,
    imageHeightPx,
    frameWidthMm: frame.widthMm,
    frameHeightMm: frame.heightMm,
    zoom,
    fitMode
  });
}

// Mises en page dont AU MOINS un emplacement photo a une forme proche de
// celle de la photo donnee (cahier des charges v2, §2 : "Voir d'autres
// mises en page adaptees"). Trie du plus proche au moins proche ; ne
// renvoie jamais une mise en page dont aucun emplacement ne convient.
// `layouts` = ATELIER_LAYOUTS (atelierLayouts.js), pour ne pas dupliquer
// ici le catalogue des mises en page.
export function suggestLayoutsForPhotoRatio({ photoRatio, layouts, printFormat, maxResults = 6 }) {
  if (!photoRatio || !Array.isArray(layouts)) return [];
  const scored = layouts
    .map((layout) => {
      const ratios = PHOTO_SLOT_RATIOS[layout.slug];
      if (!ratios) return null;
      let best = null;
      ratios.forEach((rawRatio, slotIndex) => {
        if (!rawRatio) return;
        const frame = resolveSlotSizeMm(layout.slug, slotIndex, printFormat);
        if (!frame) return;
        const slotRatio = frame.widthMm / frame.heightMm;
        const ecart = Math.abs(photoRatio - slotRatio) / slotRatio;
        if (best == null || ecart < best.ecart) best = { ecart, slotIndex };
      });
      return best ? { layout, ...best } : null;
    })
    .filter(Boolean)
    .filter((entry) => entry.ecart <= RATIO_GAP_THRESHOLD)
    .sort((a, b) => a.ecart - b.ecart);

  return scored.slice(0, maxResults);
}
