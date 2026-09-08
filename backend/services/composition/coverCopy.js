// backend/services/composition/coverCopy.js
//
// Tout le texte editorial de la couverture vit ici, isole du reste : le
// seul fichier qu'on peut modifier sans toucher a la logique de decision ou
// de rendu.
//
// pickClosingPhrase() : jamais de generation a la volee (pas d'IA) — un
// petit pool statique de phrases ecrites a la main, volontairement
// generiques pour rester appropriees a n'importe quel evenement de vie
// (anniversaire, depart, mariage, naissance...) sans jamais paraitre
// artificielles ou hors-sujet. Choix deterministe par book.id (meme livre
// -> meme phrase a chaque rendu, comme le reste du moteur). La fonction
// peut retourner null (aucune phrase ne convient) : le renderer doit alors
// omettre completement le bloc, jamais afficher une chaine vide — c'est le
// pool qui est vide ici, pas de filtre contextuel pour l'instant, mais le
// contrat "peut etre absent" est deja reel et teste.
//
// formatStatsLine() : jamais de statistique a 0 affichee (ordre fixe
// contributeurs -> souvenirs -> photos, valeurs a 0 simplement retirees).
//
// Fonctions pures, aucun acces reseau/disque.

const CLOSING_PHRASES = [
  'Des mots, des souvenirs, des moments a garder.',
  "Un livre pour ne jamais oublier.",
  'Ici vivent les instants qui comptent.',
  "Chaque page, un souvenir. Chaque souvenir, un peu d'eux.",
  'Le temps passe, ces pages restent.'
];

function hashToIndex(value, length) {
  if (length <= 0) return -1;
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

/**
 * @param {object} book - { id }
 * @returns {string|null} une phrase de cloture, ou null si aucune ne convient
 */
function pickClosingPhrase(book) {
  const index = hashToIndex(book?.id, CLOSING_PHRASES.length);
  if (index < 0) return null;
  return CLOSING_PHRASES[index];
}

/**
 * @param {object} counts - { contributeurs, souvenirs, photos }
 * @returns {string} ex. "32 contributeurs · 47 souvenirs" — jamais "· 0 photos".
 *   Chaine vide si les trois compteurs sont a 0 (a l'appelant de repartir
 *   sur une variante sans statistiques dans ce cas).
 */
function formatStatsLine({ contributeurs = 0, souvenirs = 0, photos = 0 } = {}) {
  const parts = [];
  if (contributeurs > 0) parts.push(`${contributeurs} contributeur${contributeurs > 1 ? 's' : ''}`);
  if (souvenirs > 0) parts.push(`${souvenirs} souvenir${souvenirs > 1 ? 's' : ''}`);
  if (photos > 0) parts.push(`${photos} photo${photos > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

module.exports = {
  pickClosingPhrase,
  formatStatsLine,
  CLOSING_PHRASES
};
