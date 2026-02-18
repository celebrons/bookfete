export const PROJECT_TYPES = [
  { value: 'pot_depart', label: 'Pot de départ', icon: '🎉' },
  { value: 'fin_projet', label: 'Fin de projet', icon: '🚀' },
  { value: 'mariage', label: 'Mariage', icon: '💍' },
  { value: 'vacances', label: 'Souvenirs de vacances', icon: '✈️' },
  { value: 'anniversaire', label: 'Anniversaire', icon: '🎂' },
  { value: 'retraite', label: 'Départ en retraite', icon: '🌅' },
  { value: 'autre', label: 'Autre événement', icon: '📌' }
];

export const PROJECT_STATUS = {
  collecting: { label: 'Collecte en cours', color: 'info' },
  reviewing: { label: 'En relecture', color: 'warning' },
  generating: { label: 'Génération en cours', color: 'info' },
  completed: { label: 'Terminé', color: 'success' }
};

export const TEMPLATES = [
  { id: 'classic', name: 'Classique', description: 'Mise en page élégante et intemporelle' },
  { id: 'modern', name: 'Moderne', description: 'Design contemporain avec touches de couleur' },
  { id: 'vintage', name: 'Vintage', description: 'Style rétro avec filtres chauds' },
  { id: 'minimalist', name: 'Minimaliste', description: 'Sobre et épuré' },
  { id: 'colorful', name: 'Coloré', description: 'Vif et dynamique' }
];

export const FORMATS = [
  { id: 'square', name: 'Carré', dimensions: '21 x 21 cm', price: 29.90 },
  { id: 'portrait', name: 'Portrait', dimensions: '21 x 27 cm', price: 34.90 },
  { id: 'landscape', name: 'Paysage', dimensions: '27 x 21 cm', price: 34.90 }
];

export const PAPER_TYPES = [
  { id: 'mat', name: 'Mat', description: 'Sans reflet, aspect naturel', price: 0 },
  { id: 'brillant', name: 'Brillant', description: 'Couleurs éclatantes', price: 4.90 },
  { id: 'photo', name: 'Photo premium', description: 'Qualité professionnelle', price: 9.90 }
];

export const BINDINGS = [
  { id: 'hardcover', name: 'Relié cartonné', description: 'Couverture rigide, durable', price: 0 },
  { id: 'softcover', name: 'Broché', description: 'Couverture souple, léger', price: -5 },
  { id: 'spiral', name: 'Spirale', description: "S'ouvre à plat", price: 2.90 }
];

export const MAX_PHOTOS_PER_CONTRIBUTOR = 5;
export const MAX_INVITES_PER_PROJECT = 100;
export const MAX_MESSAGE_LENGTH = 1000;