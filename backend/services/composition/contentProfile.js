// backend/services/composition/contentProfile.js
//
// Profil de contenu d'un livre (PHOTO / TEXTE / EQUILIBRE) — sert uniquement
// a orienter le scoring des layouts (voir layoutScoring.js), jamais a
// bloquer un contenu. Heberge aussi weightOfItem() : source unique de poids
// "equivalent-slots" reutilisee par layoutEngine.js, layoutScoring.js et
// l'estimation de pages (recommendPageCount).
//
// Fonction pure, aucun acces reseau/disque.

// Meme constante que l'ancienne heuristique de pagination (§ artefact "Celebrons
// sans IA") : une approximation grossiere du nombre de "slots" qu'un texte
// occupe, pas une mesure d'affichage precise (voir textLength.js pour les
// categories de longueur utilisees par le scoring/rendu).
const TEXT_CHARS_PER_SLOT = 400;

// Points de depart, ajustables sans toucher au reste du moteur : au-dela de
// photoHeavy, le livre est considere a dominante PHOTO ; en-deca de
// textHeavy, a dominante TEXTE ; entre les deux, EQUILIBRE.
const PROFILE_THRESHOLDS = {
  photoHeavy: 0.65,
  textHeavy: 0.35
};

function weightOfItem(item) {
  if (item.kind === 'photo') return 1;
  const length = String(item.text || '').length;
  return Math.max(1, Math.ceil(length / TEXT_CHARS_PER_SLOT));
}

/**
 * @param {Array} items - book_content_items (kind: 'photo'|'texte', text?)
 * @returns {{ profile: 'PHOTO'|'TEXTE'|'EQUILIBRE', photoWeight: number, textWeight: number, ratio: number }}
 */
function detectContentProfile(items = []) {
  let photoWeight = 0;
  let textWeight = 0;

  for (const item of items) {
    const weight = weightOfItem(item);
    if (item.kind === 'photo') {
      photoWeight += weight;
    } else {
      textWeight += weight;
    }
  }

  const total = photoWeight + textWeight;
  const ratio = total === 0 ? 0.5 : photoWeight / total;

  let profile = 'EQUILIBRE';
  if (ratio >= PROFILE_THRESHOLDS.photoHeavy) profile = 'PHOTO';
  else if (ratio <= PROFILE_THRESHOLDS.textHeavy) profile = 'TEXTE';

  return { profile, photoWeight, textWeight, ratio };
}

module.exports = {
  detectContentProfile,
  weightOfItem,
  PROFILE_THRESHOLDS,
  TEXT_CHARS_PER_SLOT
};
