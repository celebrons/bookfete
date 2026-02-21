// C:\Users\USER\bookfete\frontend\src\utils/chapterSuggestions.js

// Suggestions de chapitres et questions par type d'événement
export const chapterSuggestions = {
  // Par défaut (si aucun type spécifique)
  default: {
    chapters: [
      { title: 'Introduction', description: 'Présentation et premiers souvenirs' },
      { title: 'Souvenirs marquants', description: 'Les moments inoubliables' },
      { title: 'Anecdotes', description: 'Les petites histoires qui font sourire' },
      { title: 'Photos', description: 'Les images qui parlent' },
      { title: 'Messages', description: 'Les mots du cœur' },
      { title: 'Conclusion', description: 'Pour finir en beauté' }
    ],
    questions: [
      "Quel est votre plus beau souvenir avec la personne ?",
      "Si vous deviez la décrire en trois mots, lesquels choisiriez-vous ?",
      "Racontez une anecdote qui vous a marqué.",
      "Qu'est-ce que vous souhaitez lui souhaiter pour l'avenir ?"
    ]
  },

  // Pot de départ
  'pot-depart': {
    chapters: [
      { title: 'Nos débuts ensemble', description: 'Comment nous nous sommes rencontrés' },
      { title: 'Moments mémorables', description: 'Les meilleurs souvenirs au travail' },
      { title: 'Projets marquants', description: 'Les réussites dont on est fiers' },
      { title: 'Anecdotes de bureau', description: 'Les fous rires et situations insolites' },
      { title: 'Messages de l\'équipe', description: 'Ce qu\'on veut te dire' },
      { title: 'Pour la suite', description: 'Nos vœux pour le futur' }
    ],
    questions: [
      "Quel est votre meilleur souvenir avec ce collègue ?",
      "Quelle qualité professionnelle admirez-vous le plus chez lui/elle ?",
      "Racontez une anecdote drôle qui vous est arrivée ensemble.",
      "Que souhaitez-vous pour la suite de sa carrière ?"
    ]
  },

  // Mariage
  'mariage': {
    chapters: [
      { title: 'Leur rencontre', description: 'Comment ils se sont connus' },
      { title: 'La demande', description: 'Le moment magique' },
      { title: 'Préparatifs', description: 'Les coulisses du mariage' },
      { title: 'La cérémonie', description: 'Le grand jour' },
      { title: 'La fête', description: 'Les moments de joie' },
      { title: 'Messages pour les mariés', description: 'Vos vœux et conseils' }
    ],
    questions: [
      "Comment avez-vous rencontré les mariés ?",
      "Quel est votre meilleur souvenir avec eux ?",
      "Un conseil pour leur vie à deux ?",
      "Que leur souhaitez-vous pour l'avenir ?"
    ]
  },

  // Anniversaire
  'anniversaire': {
    chapters: [
      { title: 'Souvenirs d\'enfance', description: 'Les premières années' },
      { title: 'Jeunesse', description: 'Les années folles' },
      { title: 'Vie d\'adulte', description: 'Les grandes étapes' },
      { title: 'Qualités', description: 'Ce qu\'on aime chez toi' },
      { title: 'Anecdotes', description: 'Les histoires qui nous lient' },
      { title: 'Messages d\'anniversaire', description: 'Vos vœux' }
    ],
    questions: [
      "Quel est votre plus vieux souvenir avec la personne ?",
      "Quelle qualité appréciez-vous le plus chez elle ?",
      "Racontez une anecdote qui vous a marqué.",
      "Que lui souhaitez-vous pour cette nouvelle année ?"
    ]
  },

  // Vacances
  'vacances': {
    chapters: [
      { title: 'Le départ', description: 'Les préparatifs et l\'excitation' },
      { title: 'Les paysages', description: 'Les plus beaux endroits' },
      { title: 'Rencontres', description: 'Les personnes croisées' },
      { title: 'Aventures', description: 'Les moments forts' },
      { title: 'Fous rires', description: 'Les situations drôles' },
      { title: 'Bilan du voyage', description: 'Ce qu\'on retient' }
    ],
    questions: [
      "Quel a été votre moment préféré du voyage ?",
      "La plus belle photo que vous ayez prise ?",
      "Une anecdote de voyage inoubliable ?",
      "Ce que ce voyage vous a apporté ?"
    ]
  },

  // Retraite
  'retraite': {
    chapters: [
      { title: 'Les débuts', description: 'Les premiers pas dans la vie pro' },
      { title: 'Carrière', description: 'Les étapes importantes' },
      { title: 'Projets marquants', description: 'Les réalisations dont on est fier' },
      { title: 'Collègues et amis', description: 'Les relations tissées' },
      { title: 'Anecdotes', description: 'Les histoires à raconter' },
      { title: 'Messages pour la retraite', description: 'Vœux pour la nouvelle vie' }
    ],
    questions: [
      "Quel est votre meilleur souvenir professionnel avec cette personne ?",
      "Quelle qualité professionnelle retenez-vous ?",
      "Une anecdote qui vous a marqué ?",
      "Que lui souhaitez-vous pour cette nouvelle vie ?"
    ]
  },

  // Fin de projet
  'fin-projet': {
    chapters: [
      { title: 'Le lancement', description: 'Les débuts du projet' },
      { title: 'Les défis', description: 'Les obstacles surmontés' },
      { title: 'Les réussites', description: 'Ce dont on est fiers' },
      { title: 'L\'équipe', description: 'Les personnes clés' },
      { title: 'Moments de cohésion', description: 'Les bons moments ensemble' },
      { title: 'Bilan et perspectives', description: 'Ce qu\'on retient' }
    ],
    questions: [
      "Quel a été le moment le plus marquant du projet ?",
      "Le plus grand défi relevé ?",
      "Un souvenir sympa avec l'équipe ?",
      "Que retenez-vous de cette aventure ?"
    ]
  }
};

// Fonction pour obtenir les suggestions en fonction du type
export const getSuggestionsForBook = (bookType) => {
  return chapterSuggestions[bookType] || chapterSuggestions.default;
};