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
// OVERLAY_CONTENT_INSET_PCT reprend le padding reel de .page dans
// pageRenderer.js (14mm sur une page 210x297mm) converti en % de chaque axe.

export const OVERLAY_CONTENT_INSET_PCT = {
  top: (14 / 297) * 100,
  bottom: (14 / 297) * 100,
  left: (14 / 210) * 100,
  right: (14 / 210) * 100
};

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
