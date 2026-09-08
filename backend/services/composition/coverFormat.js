// backend/services/composition/coverFormat.js
//
// Configuration d'impression pour la 1ere/4eme de couverture : dimensions,
// marge de securite. Architecture prete a accueillir plus tard une vraie
// gestion de fond perdu (bleed) specifique a un imprimeur, sans logique
// imprimeur codee en dur pour l'instant (voir le plan "Refonte couverture").
//
// Dimensions choisies pour ressembler a de vrais formats d'impression
// (livret agrafe / album standard librairie / edition luxe grand format).
// Livret est CARRE (170x170mm) — decision explicite revenue sur un choix
// precedent "portrait pour les 3" : un carre est la difference de silhouette
// la plus immediate possible entre formats, bien plus qu'une variation de
// ratio portrait. Standard/Luxe restent portrait (deja realistes). Le ratio
// d'affichage est calcule dynamiquement partout ou il compte (atelier,
// apercu final — voir pageAspectRatio/FORMAT_DIMENSIONS_MM cote frontend),
// donc un format carre n'a rien de plus a preparer cote rendu. safeMarginMm
// s'ecarte volontairement entre formats (pas seulement les dimensions) :
// c'est ce qui rend la couverture visuellement dense (livret) ou aeree/
// luxueuse (luxe) — voir aussi coverTheme.applyFormatAccent pour l'habillage
// dore du Luxe. Ces valeurs ont ETE alignees avec l'ancien pipeline PDF
// (backend/routes/books.js, PREVIEW_FORMATS) a la creation de ce fichier,
// mais divergent volontairement depuis : PREVIEW_FORMATS sert encore de
// vraies commandes payees sur l'ancien flux (voir memoire du projet) et ne
// doit jamais etre touche/aligne sur celui-ci. pageRenderer.js
// (DEFAULT_FORMAT) reste lui aligne sur "standard" ci-dessous — a verifier
// s'il change encore.
//
// Fonctions/constantes pures, aucun acces reseau/disque.

const COVER_FORMATS = {
  livret: {
    trimWidthMm: 170,
    trimHeightMm: 170,
    bleedMm: 0,
    safeMarginMm: 8
  },
  standard: {
    trimWidthMm: 220,
    trimHeightMm: 280,
    bleedMm: 0,
    safeMarginMm: 15
  },
  luxe: {
    trimWidthMm: 240,
    trimHeightMm: 320,
    bleedMm: 0,
    safeMarginMm: 26
  }
};

const DEFAULT_COVER_FORMAT_ID = 'standard';

function resolveCoverFormat(formatId) {
  return COVER_FORMATS[formatId] || COVER_FORMATS[DEFAULT_COVER_FORMAT_ID];
}

module.exports = {
  COVER_FORMATS,
  DEFAULT_COVER_FORMAT_ID,
  resolveCoverFormat
};
