// frontend/src/components/book/atelier/atelierLayoutGeometry.js
//
// Zones de depot approximatives (en % de la ZONE DE CONTENU de la page,
// c'est-a-dire une fois retiree la marge de la page reelle — voir
// OVERLAY_CONTENT_INSET_PCT) pour chaque mise en page de l'atelier. Sert
// uniquement a positionner l'incrustation de glisser-deposer directement sur
// la page (AtelierPageOverlay) au-dessus du vrai rendu (l'iframe) — jamais
// une deuxieme source de verite sur l'apparence : le rendu reel reste
// toujours services/composition/pageRenderer.js (BASE_CSS), cote serveur.
//
// Volontairement approximatif : le CSS reel est en partie fait de flex/grid
// dont la taille exacte depend du contenu (longueur d'un texte, etc.), donc
// un calque statique ne peut pas etre pixel-perfect. Le but est une cible de
// depot assez grande et assez bien placee pour etre intuitive, pas une
// reproduction exacte — a re-verifier a l'oeil si l'agencement CSS de
// pageRenderer.js change significativement.
//
// Marge interieure reelle de .page dans pageRenderer.js :
// `padding: calc(14mm * var(--fmt-space-scale))`. Elle depend donc du FORMAT,
// via spaceScale (formatDensity.js) ET des dimensions reelles de la page.
//
// CORRIGE 2026-09-11 : ces valeurs etaient figees sur 14mm / 210 x 297mm —
// un heritage A4 qui ne correspond a AUCUN des trois formats reels. Sur un
// livret (200x200mm, spaceScale 0.62, donc 8.68mm de marge), l'incrustation
// etait retreciee de 6.67% par cote au lieu de 4.34% : les zones de depot
// tombaient a cote, et l'echelle typographique de l'edition en ligne, qui se
// deduit de la largeur de l'incrustation, etait sous-evaluee d'environ 13%
// (texte affiche plus petit qu'a l'impression — probleme signale).
const PAGE_PADDING_MM = 14;
const SPACE_SCALE = { livret: 0.62, standard: 1, luxe: 1.55 };
export const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 },
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

export function getPageMetrics(printFormat) {
  const dims = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;
  const paddingMm = PAGE_PADDING_MM * (SPACE_SCALE[printFormat] ?? 1);
  return {
    ...dims,
    paddingMm,
    contentWidthMm: Math.max(1, dims.widthMm - 2 * paddingMm),
    contentHeightMm: Math.max(1, dims.heightMm - 2 * paddingMm)
  };
}

export function getOverlayInsetPct(printFormat) {
  const { widthMm, heightMm, paddingMm } = getPageMetrics(printFormat);
  const vertical = (paddingMm / heightMm) * 100;
  const horizontal = (paddingMm / widthMm) * 100;
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

// Conserve pour les appelants qui n'ont pas de format sous la main : valeurs
// du format de reference (standard). Ne plus l'utiliser pour un rendu a
// l'echelle — passer par getOverlayInsetPct(printFormat).
export const OVERLAY_CONTENT_INSET_PCT = getOverlayInsetPct('standard');

export const LAYOUT_GEOMETRY = {
  FULL_PHOTO: [
    { top: 0, left: 0, width: 100, height: 100 }
  ],
  TWO_PHOTOS: [
    { top: 0, left: 0, width: 48, height: 100 },
    { top: 0, left: 52, width: 48, height: 100 }
  ],
  // 2 photos en haut, 1 pleine largeur en bas (voir pageRenderer.js —
  // .photo-grid-3, corrige pour ne plus etre 3 colonnes egales).
  THREE_PHOTOS: [
    { top: 0, left: 0, width: 48, height: 48 },
    { top: 0, left: 52, width: 48, height: 48 },
    { top: 52, left: 0, width: 100, height: 48 }
  ],
  FOUR_PHOTOS: [
    { top: 0, left: 0, width: 48, height: 48 },
    { top: 0, left: 52, width: 48, height: 48 },
    { top: 52, left: 0, width: 48, height: 48 },
    { top: 52, left: 52, width: 48, height: 48 }
  ],
  PHOTO_TEXT: [
    { top: 0, left: 0, width: 100, height: 58 },
    { top: 62, left: 0, width: 100, height: 38 }
  ],
  TEXT_PHOTO: [
    { top: 0, left: 0, width: 100, height: 38 },
    { top: 42, left: 0, width: 100, height: 58 }
  ],
  PHOTO_WITH_CAPTION: [
    { top: 0, left: 0, width: 100, height: 82 },
    { top: 86, left: 0, width: 100, height: 14 }
  ],
  TWO_PHOTOS_TEXT: [
    { top: 0, left: 0, width: 47, height: 62 },
    { top: 0, left: 53, width: 47, height: 62 },
    { top: 66, left: 0, width: 100, height: 34 }
  ],
  ONE_TESTIMONY: [
    { top: 0, left: 0, width: 100, height: 100 }
  ],
  TWO_TESTIMONIES: [
    { top: 0, left: 0, width: 48, height: 100 },
    { top: 0, left: 52, width: 48, height: 100 }
  ],
  THREE_TESTIMONIES: [
    { top: 0, left: 0, width: 31, height: 100 },
    { top: 0, left: 34.5, width: 31, height: 100 },
    { top: 0, left: 69, width: 31, height: 100 }
  ],
  TITLE_TEXT: [
    { top: 0, left: 0, width: 100, height: 20 },
    { top: 24, left: 0, width: 100, height: 76 }
  ],
  TITLE_TWO_PHOTOS: [
    { top: 0, left: 0, width: 100, height: 18 },
    { top: 22, left: 0, width: 48, height: 78 },
    { top: 22, left: 52, width: 48, height: 78 }
  ],
  TITLE_FOUR_PHOTOS: [
    { top: 0, left: 0, width: 100, height: 16 },
    { top: 20, left: 0, width: 48, height: 38 },
    { top: 20, left: 52, width: 48, height: 38 },
    { top: 60, left: 0, width: 48, height: 38 },
    { top: 60, left: 52, width: 48, height: 38 }
  ]
};

export const getOverlayGeometry = (slug) => LAYOUT_GEOMETRY[slug] || null;
