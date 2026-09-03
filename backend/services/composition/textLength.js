// backend/services/composition/textLength.js
//
// Categorisation de longueur de texte (SHORT/MEDIUM/LONG) et decoupage sur
// de tres longs textes. Fonctions pures, aucun acces reseau/disque.
//
// Ces seuils sont distincts de TEXT_CHARS_PER_SLOT (contentProfile.js), qui
// sert uniquement a l'estimation grossiere de pagination : ne pas supposer
// qu'ils doivent coincider si on les ajuste plus tard.

// Points de depart, ajustables. Un texte <= SHORT_MAX est "court" (utilisable
// dans un TWO_TESTIMONIES/THREE_TESTIMONIES), <= MEDIUM_MAX est "moyen"
// (ONE_TESTIMONY/PHOTO_TEXT confortablement), au-dela "long" (necessite un
// layout pleine page, voire un decoupage si ca depasse TEXT_HARD_SPLIT_THRESHOLD).
const TEXT_LENGTH_THRESHOLDS = {
  SHORT_MAX: 240,
  MEDIUM_MAX: 600
};

// Au-dela de ce nombre de caracteres, meme le layout texte le plus genereux
// (ONE_TESTIMONY pleine page) ne peut pas garantir un rendu sans troncature :
// le texte doit etre reparti sur plusieurs pages. A valider/ajuster contre le
// rendu A4 reel (BASE_CSS de pageRenderer.js) une fois visualise.
const TEXT_HARD_SPLIT_THRESHOLD = 2400;

function classifyTextLength(charLength) {
  const length = Number(charLength) || 0;
  if (length <= TEXT_LENGTH_THRESHOLDS.SHORT_MAX) return 'SHORT';
  if (length <= TEXT_LENGTH_THRESHOLDS.MEDIUM_MAX) return 'MEDIUM';
  return 'LONG';
}

// Regroupe une liste de fragments (deja decoupes selon une frontiere :
// paragraphe, phrase ou mot) en parts <= maxChars, sans jamais couper un
// fragment en deux. Retourne null si un seul fragment depasse deja maxChars
// a lui seul (l'appelant doit alors redecouper ce fragment a une frontiere
// plus fine).
function packFragments(fragments, maxChars) {
  const parts = [];
  let current = '';

  for (const fragment of fragments) {
    if (fragment.length > maxChars) {
      return null;
    }
    const candidate = current ? `${current}${current.endsWith('\n') || current.endsWith(' ') ? '' : ' '}${fragment}` : fragment;
    if (candidate.length > maxChars && current) {
      parts.push(current);
      current = fragment;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Decoupe un texte en parts <= maxChars, a la frontiere la plus "propre"
// possible : paragraphe d'abord, puis phrase, puis mot en dernier recours.
// Garantie absolue : jamais de coupe en plein milieu d'un mot.
function splitTextSafely(text, maxChars) {
  const safeText = String(text || '').trim();
  if (!safeText) return [];
  if (safeText.length <= maxChars) return [safeText];

  const paragraphs = safeText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let parts = packFragments(paragraphs.length > 0 ? paragraphs : [safeText], maxChars);
  if (parts) return parts;

  // Au moins un paragraphe depasse maxChars a lui seul : redecoupe par phrase
  // sur l'ensemble du texte (frontiere plus fine mais toujours propre).
  const sentences = safeText.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [safeText];
  parts = packFragments(sentences.map((s) => s.trim()).filter(Boolean), maxChars);
  if (parts) return parts;

  // Cas pathologique : meme une "phrase" depasse maxChars (pas de ponctuation
  // du tout sur un tres long passage). Dernier recours : decoupage par mot,
  // qui ne coupe jamais un mot en deux.
  const words = safeText.split(/\s+/).filter(Boolean);
  parts = packFragments(words, maxChars);
  if (parts) return parts;

  // Filet ultime, ne devrait jamais arriver avec un texte reel (un seul "mot"
  // plus long que maxChars) : on le rend tel quel plutot que de le perdre.
  return [safeText];
}

module.exports = {
  classifyTextLength,
  splitTextSafely,
  TEXT_LENGTH_THRESHOLDS,
  TEXT_HARD_SPLIT_THRESHOLD
};
