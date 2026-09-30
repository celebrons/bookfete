// frontend/src/components/book/atelier/atelierMoods.js
//
// Metadonnees des "ambiances" de composition automatique proposees depuis
// l'atelier (bouton "Generer automatiquement", voir AtelierGenerateModal.js)
// — a garder synchronise a la main avec MOOD_LAYOUT_WEIGHTS cote backend
// (backend/services/composition/layoutScoring.js), meme convention deja
// utilisee pour ATELIER_LAYOUTS/layout_definitions.
//
// "Ambiance" et jamais "style" : le "Style" (direction artistique,
// book_templates/template_id, ex. Elegance/Editorial/Minimal) se choisit
// dans l'onglet Configuration et reste totalement independant — l'ambiance
// ne joue que sur le RYTHME de composition (densite de photos par page,
// presence de pages-titres), jamais sur les couleurs/polices.

export const ATELIER_MOODS = [
  { id: 'classique' },
  { id: 'aere' },
  { id: 'compact' },
  { id: 'chapitre' },
  { id: 'collage' }
];

export const findAtelierMood = (id) => ATELIER_MOODS.find((mood) => mood.id === id) || null;

// Meme raison qu'atelierLayouts.js: libelles calcules a l'affichage, jamais
// au chargement du module.
export const getMoodLabel = (id, t) => t(`moods.${id}.label`);
export const getMoodDescription = (id, t) => t(`moods.${id}.description`);
