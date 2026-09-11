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
  // 2026-09-10 : 1 -> 2.5 en meme temps que scoreOrientation devient une
  // vraie mesure d'adequation ratio photo<->emplacement (voir plus bas) —
  // au poids 1 d'origine (simple coherence grossiere d'orientation entre
  // photos), le signal etait trop faible pour peser face a rhythmPenalty
  // (poids 4) des qu'une rupture de rythme etait aussi en jeu. Reste
  // volontairement sous rhythmPenalty : une photo mal calee ne doit jamais
  // forcer 5 pages identiques d'affilee.
  orientation: 2.5,
  rhythmPenalty: 4,
  balance: 1,
  mood: 2
};

// Ponderation par "ambiance" (context.mood, optionnel — voir scoreMood) :
// un axe totalement independant du "style" (book_templates/template_id,
// l'identite graphique choisie en Configuration) — l'ambiance ne joue que
// sur le RYTHME de composition (densite de photos par page, presence de
// pages-titres), jamais sur les couleurs/polices. 'classique' == aucune
// entree == 0 partout : non-regression garantie pour tout appelant qui ne
// passe pas de mood (meme principe que cover_overrides.frontVariant =
// 'AUTO'). Tout slug absent d'une ambiance donnee reste neutre (0) — les
// layouts hors atelier (ex. contribution) ne sont donc jamais affectes.
const MOOD_LAYOUT_WEIGHTS = {
  classique: {},
  aere: {
    FULL_PHOTO: 1,
    PHOTO_WITH_CAPTION: 0.8,
    TWO_PHOTOS: 0.3,
    TITLE_TEXT: 0.4,
    THREE_PHOTOS: -0.6,
    FOUR_PHOTOS: -1,
    TWO_PHOTOS_TEXT: -0.5,
    TITLE_FOUR_PHOTOS: -0.6
  },
  compact: {
    FOUR_PHOTOS: 1,
    THREE_PHOTOS: 0.8,
    TWO_PHOTOS_TEXT: 0.8,
    TITLE_FOUR_PHOTOS: 0.6,
    TWO_PHOTOS: 0.3,
    FULL_PHOTO: -1,
    PHOTO_WITH_CAPTION: -0.5
  },
  chapitre: {
    TITLE_TEXT: 1,
    TITLE_TWO_PHOTOS: 1,
    TITLE_FOUR_PHOTOS: 0.8,
    PHOTO_WITH_CAPTION: 0.6,
    ONE_TESTIMONY: 0.4,
    TWO_TESTIMONIES: 0.4,
    THREE_TESTIMONIES: 0.4
  },
  collage: {
    THREE_PHOTOS: 1,
    FOUR_PHOTOS: 1,
    TWO_PHOTOS: 0.5,
    ONE_TESTIMONY: -0.6,
    TWO_TESTIMONIES: -0.4,
    THREE_TESTIMONIES: -0.4,
    TITLE_TEXT: -0.5
  },
  // Entrees dediees au format d'impression (voir formatDensity.js), volontairement
  // SEPAREES de 'compact'/'aere' ci-dessus (reservees au bouton "essayer une autre
  // ambiance", une nuance cosmetique ponctuelle) et amplifiees (~2.2x) : le cahier
  // des charges de l'apercu multi-format exige un changement de mise en page
  // "IMPORTANT", pas juste perceptible — a ce poids (SCORING_WEIGHTS.mood = 2), une
  // entree ~2.2-2.4 pese jusqu'a environ +/-5 dans le score total, du meme ordre que
  // rhythmPenalty (poids 4) plutot que sous son ombre — de quoi renverser fiablement
  // le choix de layout entre Livret/Luxe sans jamais l'imposer dans l'absolu (le
  // rythme reprend la main si un format s'entete trop longtemps sur la meme famille).
  // 'standard' n'a pas d'entree ici : formatDensity.js lui laisse mood=undefined,
  // c'est-a-dire le comportement neutre/equilibre deja par defaut (scoreMood -> 0).
  'format-livret': {
    FOUR_PHOTOS: 2.2,
    THREE_PHOTOS: 2,
    TWO_PHOTOS_TEXT: 1.8,
    TITLE_FOUR_PHOTOS: 1.4,
    TWO_PHOTOS: 1,
    TWO_TESTIMONIES: 0.8,
    THREE_TESTIMONIES: 0.8,
    FULL_PHOTO: -2.2,
    PHOTO_WITH_CAPTION: -1.2,
    TITLE_TEXT: -0.6
  },
  'format-luxe': {
    FULL_PHOTO: 2.4,
    PHOTO_WITH_CAPTION: 1.8,
    TITLE_TEXT: 1.2,
    TWO_PHOTOS: 0.6,
    ONE_TESTIMONY: 0.6,
    THREE_PHOTOS: -1.6,
    FOUR_PHOTOS: -2.2,
    TWO_PHOTOS_TEXT: -1.2,
    TITLE_FOUR_PHOTOS: -1.4,
    TWO_TESTIMONIES: -0.6,
    THREE_TESTIMONIES: -0.6
  }
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

// --- orientation/adequation photo<->emplacement --------------------------
// 2026-09-10 : retour utilisateur — certaines photos laissent des marges
// vides dans leur emplacement (object-fit:contain, jamais de recadrage/
// deformation, voir pageRenderer.js — comportement delibere, "la photo
// prime sur la grille"). Un remplissage total sans jamais rogner n'est
// possible que si la forme de l'emplacement correspond deja a celle de la
// photo — donc le seul levier reel est d'ameliorer le CHOIX de mise en page
// et l'ordre d'attribution pour que chaque photo tombe plus souvent dans un
// emplacement de forme proche de la sienne. Avant cette passe, ce facteur
// ne comparait QUE la coherence d'orientation ENTRE plusieurs photos d'un
// meme layout (jamais rien pour un layout a une seule photo, comme
// FULL_PHOTO/PHOTO_WITH_CAPTION — pourtant les plus frequents et les plus
// visibles en cas d'ecart) ; il compare desormais le ratio REEL de chaque
// photo (metadata.ratio, deja sonde a l'upload, voir storageService.js) au
// ratio ATTENDU de son emplacement precis.

// Ratio largeur/hauteur approximatif de chaque emplacement photo, par slug
// de layout et position de slot dans capacity.slots — derive de la vraie
// geometrie CSS (pageRenderer.js: .photo-grid-N/.title-photos-grid-N),
// jamais une mesure au pixel pres (les marges/le titre font varier la
// hauteur reelle disponible) : un nudge de scoring, pas une contrainte
// dure — voir slotRatioScore, jamais 0 brutal, une penalite progressive.
// 'page' est resolu dynamiquement via PAGE_RATIO_BY_FORMAT (le format
// choisi) plutot qu'une valeur fixe, pour FULL_PHOTO/PHOTO_WITH_CAPTION qui
// occupent (quasi) toute la page.
const PHOTO_SLOT_RATIOS = {
  FULL_PHOTO: ['page'],
  PHOTO_WITH_CAPTION: ['page'],
  TWO_PHOTOS: [0.38, 0.38], // moitie largeur, pleine hauteur -> tres vertical
  THREE_PHOTOS: [0.95, 0.95, 1.9], // 2 cases quasi carrees + 1 case large en bas (grid-column:1/-1)
  FOUR_PHOTOS: [0.95, 0.95, 0.95, 0.95], // grille 2x2, cases quasi carrees
  TITLE_TWO_PHOTOS: [1.3, 1.3], // meme grille que TWO_PHOTOS mais hauteur reduite par le titre au dessus -> plus large que haut
  TITLE_FOUR_PHOTOS: [1.1, 1.1, 1.1, 1.1],
  // Mises en page mixtes (photo + texte). `null` = cet emplacement n'est PAS
  // une photo (slot texte) : jamais evalue, ni pour le scoring ni pour le
  // controle qualite. Ajoutees le 2026-09-11 (cahier des charges v2) : elles
  // manquaient a cette table, donc TOUTE photo placee dans une de ces mises
  // en page echappait au controle de resolution avant commande (verifie en
  // base sur un livre reel : pages 6/9/18/24/28 "PAS EVALUE").
  // Derive du CSS reel (pageRenderer.js) : .mixte-ordered est une colonne
  // flex (gap 5mm) ou .mixte-photo{flex:1.4} et .mixte-texte{flex:1} ->
  // la photo prend 1.4/2.4 ~ 58% de la hauteur utile, sur toute la largeur.
  PHOTO_TEXT: [1.26, null],
  TEXT_PHOTO: [null, 1.26],
  // .mixte-multi-photo passe la meme colonne en ligne avec retour
  // (.mixte-photo{flex:1 1 45%}) : 2 photos cote a cote (demi-largeur) au
  // dessus d'un texte pleine largeur -> nettement plus haut que large.
  TWO_PHOTOS_TEXT: [0.62, 0.62, null]
};

// Ratio de la page elle-meme par format (voir coverFormat.js — dupliquee
// ici plutot qu'importee : meme convention deja etablie dans ce projet pour
// une petite table de constantes qui ne doit jamais creer de dependance
// circulaire entre modules "moteur pur"). standard/luxe partagent deja le
// meme trim (210x280mm) depuis l'alignement Gelato du 2026-09-09.
const PAGE_RATIO_BY_FORMAT = {
  livret: 1, // 200x200mm, carre
  standard: 210 / 280,
  luxe: 210 / 280
};
const DEFAULT_PAGE_RATIO = PAGE_RATIO_BY_FORMAT.standard; // repli non-regressif si formatId absent (ex. appelant qui ne le passe pas encore)

function resolvePageRatio(formatId) {
  return PAGE_RATIO_BY_FORMAT[formatId] ?? DEFAULT_PAGE_RATIO;
}

// Score de proximite entre le ratio reel d'une photo et le ratio attendu de
// son emplacement — 1 = ratio identique, decroit progressivement (jamais de
// chute brutale a 0 pour un petit ecart). log() rend l'ecart symetrique :
// une photo 2x trop large et une photo 2x trop etroite pour son emplacement
// sont penalisees pareil, pas juste "plus large que prevu" traite differemment
// de "plus etroit que prevu".
function slotRatioScore(photoRatio, slotRatio) {
  if (!photoRatio || !slotRatio) return null; // donnee manquante -> ignore ce slot (neutre), jamais bloquant
  const diff = Math.abs(Math.log(photoRatio / slotRatio));
  return Math.max(0, 1 - diff);
}

function scoreOrientation(layout, units, context = {}) {
  const slots = layout.capacity?.slots;
  if (!Array.isArray(slots)) return 0;

  const expectedRatios = PHOTO_SLOT_RATIOS[layout.slug];
  if (expectedRatios) {
    const pageRatio = resolvePageRatio(context.formatId);
    let total = 0;
    let count = 0;
    slots.forEach((slot, index) => {
      if (slot.type !== 'photo') return;
      const unit = units[index];
      const expected = expectedRatios[index];
      if (!unit?.ratio || expected == null) return; // photo pas encore sondee, ou layout hors table pour cette position -> neutre
      const slotRatio = expected === 'page' ? pageRatio : expected;
      const slotScore = slotRatioScore(unit.ratio, slotRatio);
      if (slotScore == null) return;
      total += slotScore;
      count += 1;
    });
    if (count > 0) return total / count;
    // Aucune donnee exploitable (aucune photo encore sondee) : repli
    // ci-dessous, meme comportement qu'avant cette passe.
  }

  // Repli — layout hors table (ex. contribution/manuel) ou aucun ratio
  // numerique disponible : comportement d'origine, coherence grossiere
  // d'orientation (paysage/portrait/carre) entre les photos d'un meme
  // layout multi-photos.
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

// --- ambiance : affinite entre ce layout et l'ambiance choisie (voir
// MOOD_LAYOUT_WEIGHTS ci-dessus). context.mood absent/inconnu -> 0 partout,
// donc jamais bloquant et toujours non-regressif par defaut.
function scoreMood(layout, mood) {
  if (!mood) return 0;
  return MOOD_LAYOUT_WEIGHTS[mood]?.[layout.slug] ?? 0;
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
 * @param {object} context - { profile, rhythmState, familyCounts, formatId }
 * @returns {number}
 */
function scoreLayoutCandidate(layout, units, context = {}) {
  const profile = context.profile || 'EQUILIBRE';
  const rhythmState = context.rhythmState || [];

  const fit = scoreFit(layout, units);
  const profileScore = scoreProfile(layout, profile);
  const lengthFit = scoreLengthFit(layout, units);
  const orientation = scoreOrientation(layout, units, context);
  const balance = scoreBalance(layout, context);
  const penalty = rhythmPenalty(layout, rhythmState);
  const mood = scoreMood(layout, context.mood);

  return (
    fit * SCORING_WEIGHTS.fit
    + profileScore * SCORING_WEIGHTS.profile
    + lengthFit * SCORING_WEIGHTS.lengthFit
    + orientation * SCORING_WEIGHTS.orientation
    + balance * SCORING_WEIGHTS.balance
    + mood * SCORING_WEIGHTS.mood
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
  PROFILE_TARGETS,
  MOOD_LAYOUT_WEIGHTS,
  PHOTO_SLOT_RATIOS,
  PAGE_RATIO_BY_FORMAT,
  slotRatioScore
};
