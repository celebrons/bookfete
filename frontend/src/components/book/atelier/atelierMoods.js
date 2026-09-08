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
  { id: 'classique', label: 'Classique', description: 'Le rythme habituel, equilibre entre photos et textes.' },
  { id: 'aere', label: 'Aere', description: 'Chaque photo respire seule — plus de pages, moins de densite.' },
  { id: 'compact', label: 'Compact', description: 'Caser un maximum de souvenirs dans le nombre de pages choisi.' },
  { id: 'chapitre', label: 'Chapitre', description: 'Des pages-titres rythment le livre, esprit magazine.' },
  { id: 'collage', label: 'Collage', description: 'Tres photo, en grilles denses, quasiment pas de texte seul.' }
];

export const findAtelierMood = (id) => ATELIER_MOODS.find((mood) => mood.id === id) || null;
