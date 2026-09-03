// backend/services/composition/layoutScoring.js
//
// Scoring des layouts candidats + etat de rythme/diversite et d'equilibre
// global du livre. Remplace le choix v1 ("premier candidat valide, PRNG
// pour departager les egalites") par un scoring explicite — voir
// layoutEngine.js pour la boucle qui l'utilise. Reste volontairement
// simple : quelques facteurs, des poids ajustables, pas un moteur de regles.
//
// Fonctions pures, aucun acces reseau/disque.

const { classifyTextLength } = require('./textLength');
const { consumedCount, MAX_LOOKAHEAD_UNITS } = require('./layoutCapacity');

// Points de depart, ajustables independamment les uns des autres (voir
// scoreLayoutCandidate). rhythmPenalty domine volontairement : c'est le
// levier principal contre la monotonie ("pas 10 pages identiques d'affilee").
const SCORING_WEIGHTS = {
  fit: 3,
  profile: 2,
  lengthFit: 2,
  orientation: 1,
  rhythmPenalty: 4,
  balance: 1
};

// Proportions cibles de pages par famille selon le profil detecte —
// indicatif seulement (voir scoreBalance : nudge doux, jamais une regle
// dure). 'contribution' est hors cible (ni favorise ni penalise).
const PROFILE_TARGETS = {
  PHOTO: { photo: 0.7, texte: 0.15, mixte: 0.15 },
  TEXTE: { photo: 0.15, texte: 0.7, mixte: 0.15 },
  EQUILIBRE: { photo: 0.35, texte: 0.35, mixte: 0.3 }
};

function layoutFamily(layout) {
  if (layout.kind === 'contribution') return 'contribution';
  const slots = layout.capacity?.slots;
  if (Array.isArray(slots) && slots.length > 0) {
    const hasPhoto = slots.some((slot) => slot.type === 'photo');
    const hasText = slots.some((slot) => slot.type === 'text');
    if (hasPhoto && hasText) return 'mixte';
    return hasPhoto ? 'photo' : 'texte';
  }
  return layout.kind || 'mixte';
}

// --- fit : recompense l'usage de la capacite (layouts plus grands quand le
// contenu abonde), sans jamais l'imposer (le rythme peut le contrebalancer).
function scoreFit(layout, units) {
  return consumedCount(layout, units) / MAX_LOOKAHEAD_UNITS;
}

// --- profile : affinite entre la famille du layout et le profil detecte.
function scoreProfile(layout, profile) {
  const family = layoutFamily(layout);
  if (profile === 'PHOTO') return family === 'photo' ? 1 : family === 'mixte' ? 0.5 : 0;
  if (profile === 'TEXTE') return family === 'texte' ? 1 : family === 'mixte' ? 0.5 : 0;
  // EQUILIBRE : favorise les layouts mixtes sans exclure les autres.
  return family === 'mixte' ? 1 : 0.5;
}

// --- lengthFit : recompense un layout "taille pour" la longueur du texte
// plutot qu'un layout juste large-assez (ex. un texte SHORT dans un slot
// qui n'accepte QUE du SHORT est un meilleur choix qu'un slot generaliste).
function scoreLengthFit(layout, units) {
  const slots = layout.capacity?.slots;
  if (!Array.isArray(slots) || slots.length === 0) return 0.5; // repli neutre

  let score = 0;
  let textSlots = 0;
  slots.forEach((slot, index) => {
    if (slot.type !== 'text') return;
    textSlots += 1;
    const unit = units[index];
    const cls = unit ? (unit.textLengthClass || classifyTextLength(unit.textLength || 0)) : null;
    const allowed = Array.isArray(slot.lengthClass) && slot.lengthClass.length > 0
      ? slot.lengthClass
      : ['SHORT', 'MEDIUM', 'LONG'];
    if (cls && allowed.length === 1 && allowed[0] === cls) score += 1;
    else if (cls && allowed.includes(cls)) score += 0.6;
  });

  return textSlots === 0 ? 0.5 : score / textSlots;
}

// --- orientation : bonus doux si les photos consommees partagent une
// orientation coherente pour un layout multi-photos. Jamais bloquant : une
// orientation inconnue (photo pas encore sondee) reste neutre.
function scoreOrientation(layout, units) {
  const slots = layout.capacity?.slots;
  if (!Array.isArray(slots)) return 0;

  const photoUnits = slots
    .map((slot, index) => (slot.type === 'photo' ? units[index] : null))
    .filter(Boolean);
  if (photoUnits.length < 2) return 0;

  const orientations = photoUnits.map((unit) => unit.orientation).filter(Boolean);
  if (orientations.length < photoUnits.length) return 0; // donnee manquante -> neutre

  const allSame = orientations.every((orientation) => orientation === orientations[0]);
  return allSame ? 1 : 0.3;
}

// --- balance : nudge doux vers la proportion de familles de pages attendue
// pour le profil detecte, sur l'ensemble deja compose du livre.
function scoreBalance(layout, context) {
  const family = layoutFamily(layout);
  if (family === 'contribution') return 0.5;

  const targets = PROFILE_TARGETS[context.profile] || PROFILE_TARGETS.EQUILIBRE;
  const target = targets[family] ?? 0.3;
  const counts = context.familyCounts || {};
  const totalSoFar = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (totalSoFar === 0) return 0.5;

  const current = (counts[family] || 0) / totalSoFar;
  return Math.max(0, Math.min(1, 0.5 + (target - current)));
}

// --- rythme : etat glissant des dernieres pages, penalise la monotonie
// (jamais une exclusion : le contenu peut forcer la repetition, ex. 40
// photos et rien d'autre — dans ce cas le fallback doit rester atteignable).
function createRhythmState() {
  return [];
}

function updateRhythmState(state, chosenLayout) {
  const entry = { slug: chosenLayout.slug, family: layoutFamily(chosenLayout) };
  return [entry, ...state].slice(0, 4);
}

function rhythmPenalty(layout, state) {
  if (!Array.isArray(state) || state.length === 0) return 0;

  let penalty = 0;
  if (state[0].slug === layout.slug) penalty += 1; // meme layout que la page precedente

  const family = layoutFamily(layout);
  let sameFamilyRun = 0;
  for (const entry of state) {
    if (entry.family !== family) break;
    sameFamilyRun += 1;
  }
  if (sameFamilyRun >= 2 && family !== 'mixte') {
    penalty += 0.5 * sameFamilyRun; // encourage une rupture au bout de 2-3 pages de meme famille
  }

  return penalty;
}

function createFamilyCounts() {
  return {};
}

function updateFamilyCounts(counts, chosenLayout) {
  const family = layoutFamily(chosenLayout);
  return { ...counts, [family]: (counts[family] || 0) + 1 };
}

/**
 * @param {object} layout
 * @param {Array} units - unites consommees si ce layout est choisi
 * @param {object} context - { profile, rhythmState, familyCounts }
 * @returns {number}
 */
function scoreLayoutCandidate(layout, units, context = {}) {
  const profile = context.profile || 'EQUILIBRE';
  const rhythmState = context.rhythmState || [];

  const fit = scoreFit(layout, units);
  const profileScore = scoreProfile(layout, profile);
  const lengthFit = scoreLengthFit(layout, units);
  const orientation = scoreOrientation(layout, units);
  const balance = scoreBalance(layout, context);
  const penalty = rhythmPenalty(layout, rhythmState);

  return (
    fit * SCORING_WEIGHTS.fit
    + profileScore * SCORING_WEIGHTS.profile
    + lengthFit * SCORING_WEIGHTS.lengthFit
    + orientation * SCORING_WEIGHTS.orientation
    + balance * SCORING_WEIGHTS.balance
    - penalty * SCORING_WEIGHTS.rhythmPenalty
  );
}

module.exports = {
  scoreLayoutCandidate,
  createRhythmState,
  updateRhythmState,
  createFamilyCounts,
  updateFamilyCounts,
  layoutFamily,
  SCORING_WEIGHTS,
  PROFILE_TARGETS
};
