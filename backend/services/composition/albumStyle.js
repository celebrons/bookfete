// backend/services/composition/albumStyle.js
//
// LE STYLE DE L'ALBUM : comment les photos se separent les unes des autres.
//
// Demande du 2026-09-25 : « des separateurs fins dores entre photos ou bien
// un encadrement des photos a choisir ».
//
// UN SEUL REGLAGE POUR TOUT LE LIVRE, jamais page par page. C'est la
// decision qui fait tenir l'idee : un album ou chaque page choisit son
// traitement n'est plus un album, c'est une collection de pages — et il
// faudrait trancher trente fois pour un seul livre. Un vrai album, lui, a
// une main. Le choix se pose donc une fois, avec la couleur de couverture,
// et s'applique partout.
//
// Trois valeurs seulement, fermees :
//
//   nu       les photos se touchent. Le comportement d'avant, et le defaut :
//            un livre existant ne doit pas changer d'aspect parce qu'un
//            reglage est apparu.
//   filet    un trait dore fin court entre les photos d'une meme page.
//   encadre  chaque photo est cernee d'un filet, sur un fond creme.
//
// Le rendu vit dans pageRenderer.js (BASE_CSS, selecteurs `.album-*`) : ici
// on ne fait que dire QUEL style, jamais a quoi il ressemble.

const ALBUM_STYLES = {
  nu: { label: 'Nu' },
  filet: { label: 'Filet' },
  encadre: { label: 'Encadre' }
};

const ALBUM_STYLE_DEFAUT = 'nu';

/**
 * Style choisi pour ce livre.
 *
 * Lu DEFENSIVEMENT dans `cover_overrides`, comme le reste des surcharges de
 * couverture : cette colonne est ecrite directement par le frontend et rien
 * ne garantit sa forme. Une valeur inconnue retombe sur le defaut plutot
 * que d'etre appliquee telle quelle — le meme principe que
 * coverTheme.applyCoverColor avec un jeton de couleur inconnu.
 *
 * @param {object} book
 * @returns {'nu'|'filet'|'encadre'}
 */
function resolveAlbumStyle(book) {
  const overrides = (book?.cover_overrides && typeof book.cover_overrides === 'object')
    ? book.cover_overrides
    : {};
  const demande = overrides.albumStyle;
  return Object.prototype.hasOwnProperty.call(ALBUM_STYLES, demande) ? demande : ALBUM_STYLE_DEFAUT;
}

/** Classe a poser sur le document pour ce livre. */
function albumStyleClass(book) {
  return `album-${resolveAlbumStyle(book)}`;
}

module.exports = { ALBUM_STYLES, ALBUM_STYLE_DEFAUT, resolveAlbumStyle, albumStyleClass };
