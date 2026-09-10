// backend/services/composition/coverFormat.js
//
// Configuration d'impression pour la 1ere/4eme de couverture : dimensions,
// marge de securite. Architecture prete a accueillir plus tard une vraie
// gestion de fond perdu (bleed) specifique a un imprimeur, sans logique
// imprimeur codee en dur pour l'instant (voir le plan "Refonte couverture").
//
// Dimensions choisies pour ressembler a de vrais formats d'impression
// (livret agrafe / album standard librairie / edition luxe grand format).
//
// 2026-09-09 — REALIGNEES sur le catalogue reel Gelato (integration
// imprimeur en cours de test, voir backend/services/printing/gelatoCatalog.js
// et memoire "gelato-integration-status") : Gelato n'imprime QUE les tailles
// listees dans son catalogue produit, en 2 catalogues distincts (couverture
// souple / rigide) qui partagent les tailles 20x20cm et 21x28cm — nos
// anciennes valeurs (170x170 / 220x280 / 240x320mm) ne correspondaient a
// AUCUN produit reel, impossible a faire imprimer tel quel. Nouvelle
// repartition (confirmee avec l'utilisateur) :
//   - livret   : 20x20cm carre, couverture SOUPLE (Gelato soft-cover-photobooks)
//   - standard : 21x28cm portrait, couverture SOUPLE (Gelato soft-cover-photobooks)
//   - luxe     : 21x28cm portrait, couverture RIGIDE (Gelato hard-cover-photobooks)
//     — MEME gabarit que standard : la distinction Luxe se joue desormais sur
//     la matiere (rigide) + les finitions deja existantes (dorure, marges,
//     papier ivoire — voir coverTheme.applyFormatAccent), pas sur la taille.
// Le ratio d'affichage est calcule dynamiquement partout ou il compte
// (atelier, apercu final — voir pageAspectRatio/FORMAT_DIMENSIONS_MM cote
// frontend, duplique dans AtelierBookView.js/AtelierLayoutPanel.js/
// AtelierPageFilmstrip.js/BookPreviewFinalLuxe.js — les 4 a tenir synchrones
// avec ce fichier). safeMarginMm reste volontairement different entre
// formats malgre standard/luxe qui partagent maintenant le meme trim : c'est
// ce qui garde une composition plus aeree/luxueuse pour Luxe a taille egale.
// PREVIEW_FORMATS (backend/routes/books.js) reste un vestige de l'ancien
// pipeline chapitres, desormais mort (voir generateFinalBookPdfFiles) — ne
// jamais s'aligner dessus.
//
// Fonctions/constantes pures, aucun acces reseau/disque.

const COVER_FORMATS = {
  livret: {
    trimWidthMm: 200,
    trimHeightMm: 200,
    bleedMm: 0,
    safeMarginMm: 8
  },
  standard: {
    trimWidthMm: 210,
    trimHeightMm: 280,
    bleedMm: 0,
    safeMarginMm: 15
  },
  luxe: {
    trimWidthMm: 210,
    trimHeightMm: 280,
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
