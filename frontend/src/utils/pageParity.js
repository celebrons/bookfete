// frontend/src/utils/pageParity.js
//
// DE QUEL COTE D'UN LIVRE OUVERT SE TROUVE UNE PAGE ?
//
// Miroir exact de backend/services/composition/pageParity.js, qui porte la
// demonstration complete. Les deux doivent dire la meme chose : c'est le
// backend qui fabrique le fichier d'impression, et le frontend qui promet a
// l'utilisateur ce qu'il verra. Les desynchroniser, c'est remettre en place
// le defaut du 2026-09-25 — une double page promise a l'ecran, imprimee en
// recto-verso.
//
// LA REGLE : la page 1 est SEULE, a DROITE. Les vis-a-vis reels sont
// ensuite (2,3), (4,5), (6,7)... comme dans tous les livres relies.
//
//   index 0  -> page 1  -> DROITE, seule (face au contre-plat)
//   index 1  -> page 2  -> GAUCHE  ) un vis-a-vis
//   index 2  -> page 3  -> DROITE  )
//
// Index PAIR = page de DROITE, index IMPAIR = page de GAUCHE.

/** La page d'index `index` est-elle a GAUCHE d'un livre ouvert ? */
export const isLeftPage = (index) => Number(index) % 2 === 1;

/** ... et a droite ? La page 1 (index 0) est la seule droite sans vis-a-vis. */
export const isRightPage = (index) => Number(index) % 2 === 0;

/**
 * Index de la page qui lui fait face, ou null pour la toute premiere page :
 * elle n'a devant elle que le contre-plat de la couverture.
 */
export const facingPageIndex = (index) => {
  const num = Number(index);
  if (!Number.isInteger(num) || num < 0 || num === 0) return null;
  return isLeftPage(num) ? num + 1 : num - 1;
};

/**
 * Les deux pages du vis-a-vis numero `spread`, dans l'ordre gauche/droite.
 * Le vis-a-vis 0 est particulier : rien a gauche, la page 1 a droite.
 */
export const spreadPair = (spread) => {
  const num = Number(spread) || 0;
  if (num <= 0) return { left: null, right: 0 };
  return { left: num * 2 - 1, right: num * 2 };
};

/** Le numero de vis-a-vis qui contient la page d'index `index`. */
export const spreadOfPage = (index) => {
  const num = Number(index) || 0;
  if (num <= 0) return 0;
  return isLeftPage(num) ? (num + 1) / 2 : num / 2;
};

/** Combien de vis-a-vis pour un livre de `totalPages` pages interieures ? */
export const spreadCount = (totalPages) => {
  const total = Math.max(0, Number(totalPages) || 0);
  if (total === 0) return 0;
  // Le premier vis-a-vis ne porte qu'une page ; les suivants en portent deux.
  return 1 + Math.ceil((total - 1) / 2);
};
