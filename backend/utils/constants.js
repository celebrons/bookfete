module.exports = {
  PROJECT_TYPES: {
    pot_depart: 'Pot de départ',
    fin_projet: 'Fin de projet',
    mariage: 'Mariage',
    vacances: 'Souvenirs de vacances',
    anniversaire: 'Anniversaire',
    retraite: 'Départ en retraite',
    autre: 'Autre événement'
  },

  PROJECT_STATUS: {
    collecting: 'Collecte en cours',
    reviewing: 'En relecture',
    generating: 'Génération en cours',
    completed: 'Terminé'
  },

  ORDER_STATUS: {
    pending: 'En attente',
    paid: 'Payé',
    processing: 'En préparation',
    shipped: 'Expédié',
    delivered: 'Livré'
  },

  MAX_PHOTOS_PER_CONTRIBUTOR: 5,
  MAX_INVITES_PER_PROJECT: 100,
  MAX_MESSAGE_LENGTH: 1000,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
};