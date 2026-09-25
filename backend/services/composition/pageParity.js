// backend/services/composition/pageParity.js
//
// DE QUEL COTE D'UN LIVRE OUVERT SE TROUVE UNE PAGE ?
//
// Une seule reponse, un seul endroit. Avant le 2026-09-25, cette regle etait
// reecrite a quatre endroits (moteur de rendu, harmonisation des doubles
// pages, atelier, apercu) et elle y etait FAUSSE de la meme facon partout :
// on supposait que les pages 1 et 2 se faisaient face.
//
// LA REGLE : la page 1 est SEULE, a DROITE. Les vis-a-vis reels sont
// ensuite (2,3), (4,5), (6,7)... C'est la regle de tous les livres relies,
// sans exception.
//
//   index 0  -> page 1  -> DROITE, seule (face au contre-plat)
//   index 1  -> page 2  -> GAUCHE  ) un vis-a-vis
//   index 2  -> page 3  -> DROITE  )
//   index 3  -> page 4  -> GAUCHE  ) le suivant
//   index 4  -> page 5  -> DROITE  )
//
// Autrement dit : index PAIR = page de DROITE, index IMPAIR = page de
// GAUCHE.
//
// COMMENT ON LE SAIT. Un vrai livre imprime est revenu de chez Gelato le
// 2026-09-25 (« Voyage a Montreal »), et trois faits independants
// concordent :
//
//   1. Le livre lui-meme. Une photo posee sur une double page (nos index 4
//      et 5) s'est imprimee en RECTO-VERSO : « les deux photos censees
//      tomber sur une double page sont tombees sur une page recto verso ».
//      Avec l'ancienne regle, 4 et 5 etaient censees se faire face.
//   2. Les deux gardes blanches du cahier sont les deux CONTRE-PLATS,
//      colles aux plats de la couverture. Celle de tete est donc une page
//      de gauche, celle de queue une page de droite. Le cahier commence a
//      gauche : la premiere page du livre tombe forcement a droite. La
//      symetrie ne ferme que comme ca.
//   3. Le livre imprime deja ses numeros de page (index + 1), et il portait
//      « 3 » sur notre index 2. Dans tout livre, un numero IMPAIR est a
//      droite. Donc index 2 = droite.
//
// Ce module ne connait que des index de pages INTERIEURES (0 = premiere
// page composee). Les pages de couverture et les gardes blanches n'y
// entrent jamais : elles ne portent pas de contenu compose.

/** La page d'index `index` est-elle a GAUCHE d'un livre ouvert ? */
function isLeftPage(index) {
  return Number(index) % 2 === 1;
}

/** ... et a droite ? La page 1 (index 0) est la seule droite sans vis-a-vis. */
function isRightPage(index) {
  return Number(index) % 2 === 0;
}

/**
 * Index de la page qui lui fait face sur le livre ouvert.
 * @returns {number|null} null pour la toute premiere page, qui n'a en face
 *   d'elle que le contre-plat de la couverture.
 */
function facingPageIndex(index) {
  const num = Number(index);
  if (!Number.isInteger(num) || num < 0) return null;
  if (num === 0) return null;
  return isLeftPage(num) ? num + 1 : num - 1;
}

/**
 * Les deux pages du vis-a-vis numero `spread`, dans l'ordre gauche/droite.
 * Le vis-a-vis 0 est particulier : rien a gauche, la page 1 a droite.
 * @returns {{left: number|null, right: number}}
 */
function spreadPair(spread) {
  const num = Number(spread) || 0;
  if (num <= 0) return { left: null, right: 0 };
  return { left: num * 2 - 1, right: num * 2 };
}

/** Combien de vis-a-vis pour un livre de `totalPages` pages interieures ? */
function spreadCount(totalPages) {
  const total = Math.max(0, Number(totalPages) || 0);
  if (total === 0) return 0;
  // Le premier vis-a-vis ne porte qu'une page ; les suivants en portent deux.
  return 1 + Math.ceil((total - 1) / 2);
}

module.exports = { isLeftPage, isRightPage, facingPageIndex, spreadPair, spreadCount };
