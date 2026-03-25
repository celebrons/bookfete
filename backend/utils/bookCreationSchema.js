const NARRATIVE_STYLES = ['poetique', 'factuel', 'intime', 'humoristique'];
const BOOK_FINISHES = ['livret', 'classique', 'luxe'];
const PAPER_TYPES = ['satine', 'mat', 'verge_ivoire'];
const CHAPTER_COUNTS = [4, 6, 8];

const EVENT_TYPE_ICONS = {
  anniversaire: 'cake',
  retraite: 'sunset',
  depart: 'plane',
  mariage: 'rings',
  naissance: 'baby',
  voyage: 'map',
  projet: 'flag',
  famille: 'tree',
  custom: 'sparkles'
};

const FIELD_DEFINITIONS = {
  recipient_age: {
    key: 'recipient_age',
    label: 'Age',
    type: 'number',
    min: 1,
    max: 120,
    placeholder: 'Ex: 40'
  },
  character_trait: {
    key: 'character_trait',
    label: 'Trait de caractere marquant',
    type: 'textarea',
    placeholder: 'Ex: Toujours genereux, solaire et present',
    helper: 'Oriente le ton principal du chapitre portrait.'
  },
  signature_anecdote: {
    key: 'signature_anecdote',
    label: 'Anecdote signature',
    type: 'textarea',
    placeholder: "Ex: L'histoire que tout le monde raconte en soiree",
    helper: 'Genere un axe narratif fort pour un chapitre.'
  },
  signature_phrase: {
    key: 'signature_phrase',
    label: 'Phrase signature',
    type: 'text',
    placeholder: 'Ex: On verra demain, mais bien'
  },
  signature_place: {
    key: 'signature_place',
    label: 'Lieu symbolique',
    type: 'text',
    placeholder: 'Ex: Le cafe du quartier'
  },
  future_wish: {
    key: 'future_wish',
    label: 'Souhait pour la suite',
    type: 'textarea',
    placeholder: 'Ex: Qu il continue a vivre intensement'
  },
  signature_passion: {
    key: 'signature_passion',
    label: 'Passion signature',
    type: 'text',
    placeholder: 'Ex: Cuisine, trail, photographie'
  },
  years_in_role: {
    key: 'years_in_role',
    label: 'Annees dans la fonction',
    type: 'number',
    min: 1,
    max: 80,
    placeholder: 'Ex: 22'
  },
  job_description_plain: {
    key: 'job_description_plain',
    label: 'Poste (langage naturel)',
    type: 'textarea',
    placeholder: 'Ex: Responsable de projet, lien entre client et equipe'
  },
  will_be_missed_for: {
    key: 'will_be_missed_for',
    label: 'Ce qui va manquer',
    type: 'textarea',
    placeholder: 'Ex: Sa disponibilite et son humour'
  },
  contributor_circle: {
    key: 'contributor_circle',
    label: 'Cercle des contributeurs',
    type: 'select',
    options: [
      { value: 'pro', label: 'Professionnel' },
      { value: 'family', label: 'Famille' },
      { value: 'mixed', label: 'Mixte' }
    ]
  },
  retirement_project: {
    key: 'retirement_project',
    label: 'Projet de retraite',
    type: 'textarea',
    placeholder: 'Ex: Voyager et transmettre son experience'
  },
  departure_context: {
    key: 'departure_context',
    label: 'Contexte du depart',
    type: 'select',
    options: [
      { value: 'job', label: 'Nouveau poste / entreprise' },
      { value: 'expat', label: 'Expatriation' },
      { value: 'move', label: 'Demenagement' }
    ]
  },
  time_together: {
    key: 'time_together',
    label: 'Temps passe ensemble',
    type: 'text',
    placeholder: 'Ex: 7 ans'
  },
  next_destination: {
    key: 'next_destination',
    label: 'Prochaine destination',
    type: 'text',
    placeholder: 'Ex: Montreal'
  },
  recipient_name_2: {
    key: 'recipient_name_2',
    label: 'Second prenom',
    type: 'text',
    placeholder: 'Ex: Sarah'
  },
  how_they_met: {
    key: 'how_they_met',
    label: 'Comment ils se sont rencontres',
    type: 'textarea',
    placeholder: 'Ex: Dans un train, en retard tous les deux'
  },
  complementarity: {
    key: 'complementarity',
    label: 'Ce qui les rend complementaires',
    type: 'textarea',
    placeholder: 'Ex: Elle structure, il detend'
  },
  relationship_duration: {
    key: 'relationship_duration',
    label: 'Duree avant union',
    type: 'text',
    placeholder: 'Ex: 8 ans'
  },
  wedding_anniversary_years: {
    key: 'wedding_anniversary_years',
    label: 'Combien d annees',
    type: 'text',
    placeholder: 'Ex: 25 ans'
  },
  couple_anecdote: {
    key: 'couple_anecdote',
    label: 'Anecdote du couple',
    type: 'textarea',
    placeholder: 'Ex: Leur premier week-end improvise'
  },
  parents_names: {
    key: 'parents_names',
    label: 'Prenoms des parents',
    type: 'text',
    placeholder: 'Ex: Lina et Thomas'
  },
  birth_anecdote: {
    key: 'birth_anecdote',
    label: 'Anecdote grossesse / naissance',
    type: 'textarea',
    placeholder: 'Ex: Le prenom choisi dans la salle d attente'
  },
  family_context: {
    key: 'family_context',
    label: 'Contexte familial',
    type: 'text',
    placeholder: 'Ex: Premier enfant'
  },
  destination: {
    key: 'destination',
    label: 'Destination',
    type: 'text',
    placeholder: 'Ex: Sicile'
  },
  trip_duration: {
    key: 'trip_duration',
    label: 'Duree du voyage',
    type: 'text',
    placeholder: 'Ex: 12 jours'
  },
  trip_period: {
    key: 'trip_period',
    label: 'Periode',
    type: 'text',
    placeholder: 'Ex: Aout 2024'
  },
  group_description: {
    key: 'group_description',
    label: 'Qui etait du voyage',
    type: 'textarea',
    placeholder: 'Ex: 8 amis de promo'
  },
  trip_highlight: {
    key: 'trip_highlight',
    label: 'Moment le plus fort',
    type: 'textarea',
    placeholder: 'Ex: Lever de soleil sur l Etna'
  },
  unexpected_moment: {
    key: 'unexpected_moment',
    label: 'Imprevu marquant',
    type: 'textarea',
    placeholder: 'Ex: Vol annule, nuit improvisee'
  },
  signature_moment: {
    key: 'signature_moment',
    label: 'Moment/plat/lieu incontournable',
    type: 'text',
    placeholder: 'Ex: Le marche du matin'
  },
  trip_impact: {
    key: 'trip_impact',
    label: 'Impact du voyage',
    type: 'textarea',
    placeholder: 'Ex: Renforce les liens du groupe'
  },
  project_name: {
    key: 'project_name',
    label: 'Nom du projet',
    type: 'text',
    placeholder: 'Ex: Atlas'
  },
  project_duration: {
    key: 'project_duration',
    label: 'Duree du projet',
    type: 'text',
    placeholder: 'Ex: 18 mois'
  },
  team_description: {
    key: 'team_description',
    label: 'Description de l equipe',
    type: 'textarea',
    placeholder: 'Ex: Equipe reduite, tres polyvalente'
  },
  biggest_challenge: {
    key: 'biggest_challenge',
    label: 'Plus grand defi',
    type: 'textarea',
    placeholder: 'Ex: Delai divise par deux'
  },
  team_joke: {
    key: 'team_joke',
    label: 'Running joke',
    type: 'text',
    placeholder: 'Ex: Encore un petit ajustement'
  },
  project_impact: {
    key: 'project_impact',
    label: 'Impact du projet',
    type: 'textarea',
    placeholder: 'Ex: Nouveau standard interne'
  },
  turning_point: {
    key: 'turning_point',
    label: 'Moment de bascule',
    type: 'textarea',
    placeholder: 'Ex: Prototype valide par le client'
  },
  family_name: {
    key: 'family_name',
    label: 'Nom de famille / groupe',
    type: 'text',
    placeholder: 'Ex: Famille Benali'
  },
  reunion_occasion: {
    key: 'reunion_occasion',
    label: 'Occasion de la reunion',
    type: 'text',
    placeholder: 'Ex: 30 ans sans reunion complete'
  },
  generations_count: {
    key: 'generations_count',
    label: 'Nombre de generations',
    type: 'number',
    min: 1,
    max: 8,
    placeholder: 'Ex: 4'
  },
  family_ritual: {
    key: 'family_ritual',
    label: 'Rituel familial',
    type: 'textarea',
    placeholder: 'Ex: Le grand repas du dimanche'
  },
  family_legend: {
    key: 'family_legend',
    label: 'Legende familiale',
    type: 'textarea',
    placeholder: 'Ex: Le voyage en 4L'
  },
  family_saying: {
    key: 'family_saying',
    label: 'Phrase transmise',
    type: 'text',
    placeholder: 'Ex: On avance ensemble'
  },
  transmission_wish: {
    key: 'transmission_wish',
    label: 'Ce qu on veut transmettre',
    type: 'textarea',
    placeholder: 'Ex: Solidarite et curiosite'
  },
  event_custom_description: {
    key: 'event_custom_description',
    label: 'Quel est l evenement',
    type: 'textarea',
    placeholder: 'Ex: Depart a la retraite de mon beau-pere, voyage au Japon, fin de notre association'
  }
};

const SUBTYPE_SCHEMAS = {
  anniversary_18: {
    eventType: 'anniversaire',
    required: ['recipient_age', 'character_trait', 'signature_anecdote'],
    optional: ['signature_phrase', 'signature_place', 'future_wish', 'signature_passion']
  },
  anniversary_30: {
    eventType: 'anniversaire',
    required: ['recipient_age', 'character_trait', 'signature_anecdote'],
    optional: ['signature_phrase', 'signature_place', 'future_wish', 'signature_passion']
  },
  anniversary_40_50: {
    eventType: 'anniversaire',
    required: ['recipient_age', 'character_trait', 'signature_anecdote'],
    optional: ['signature_phrase', 'signature_place', 'future_wish', 'signature_passion']
  },
  anniversary_60_70: {
    eventType: 'anniversaire',
    required: ['recipient_age', 'character_trait', 'signature_anecdote'],
    optional: ['signature_phrase', 'signature_place', 'future_wish', 'signature_passion']
  },
  anniversary_80_plus: {
    eventType: 'anniversaire',
    required: ['recipient_age', 'character_trait', 'signature_anecdote'],
    optional: ['signature_phrase', 'signature_place', 'future_wish', 'signature_passion']
  },
  anniversary_other: {
    eventType: 'anniversaire',
    required: ['recipient_age', 'character_trait', 'signature_anecdote'],
    optional: ['signature_phrase', 'signature_place', 'future_wish', 'signature_passion']
  },
  retirement_pro: {
    eventType: 'retraite',
    required: ['years_in_role', 'job_description_plain', 'will_be_missed_for', 'contributor_circle'],
    optional: ['retirement_project', 'signature_anecdote', 'signature_phrase', 'future_wish'],
    defaults: { contributor_circle: 'pro' }
  },
  retirement_family: {
    eventType: 'retraite',
    required: ['years_in_role', 'job_description_plain', 'will_be_missed_for', 'contributor_circle'],
    optional: ['retirement_project', 'signature_anecdote', 'signature_phrase', 'future_wish'],
    defaults: { contributor_circle: 'family' }
  },
  retirement_mixed: {
    eventType: 'retraite',
    required: ['years_in_role', 'job_description_plain', 'will_be_missed_for', 'contributor_circle'],
    optional: ['retirement_project', 'signature_anecdote', 'signature_phrase', 'future_wish'],
    defaults: { contributor_circle: 'mixed' }
  },
  departure_job: {
    eventType: 'depart',
    required: ['departure_context', 'time_together', 'will_be_missed_for'],
    optional: ['next_destination', 'signature_anecdote', 'signature_phrase', 'future_wish'],
    defaults: { departure_context: 'job' }
  },
  departure_expat: {
    eventType: 'depart',
    required: ['departure_context', 'time_together', 'will_be_missed_for'],
    optional: ['next_destination', 'signature_anecdote', 'signature_phrase', 'future_wish'],
    defaults: { departure_context: 'expat' }
  },
  departure_move: {
    eventType: 'depart',
    required: ['departure_context', 'time_together', 'will_be_missed_for'],
    optional: ['next_destination', 'signature_anecdote', 'signature_phrase', 'future_wish'],
    defaults: { departure_context: 'move' }
  },
  wedding_marriage: {
    eventType: 'mariage',
    required: ['recipient_name_2', 'how_they_met', 'complementarity'],
    optional: ['relationship_duration', 'couple_anecdote', 'signature_place', 'future_wish']
  },
  wedding_pacs: {
    eventType: 'mariage',
    required: ['recipient_name_2', 'how_they_met', 'complementarity'],
    optional: ['relationship_duration', 'couple_anecdote', 'signature_place', 'future_wish']
  },
  wedding_anniversary: {
    eventType: 'mariage',
    required: ['recipient_name_2', 'how_they_met', 'complementarity'],
    optional: ['relationship_duration', 'couple_anecdote', 'signature_place', 'future_wish']
  },
  birth_after: {
    eventType: 'naissance',
    required: ['parents_names', 'future_wish'],
    optional: ['birth_anecdote', 'character_trait', 'family_context']
  },
  birth_during: {
    eventType: 'naissance',
    required: ['parents_names', 'future_wish'],
    optional: ['birth_anecdote', 'character_trait', 'family_context']
  },
  trip_friends: {
    eventType: 'voyage',
    required: ['destination', 'trip_duration', 'trip_period', 'group_description', 'trip_highlight'],
    optional: ['unexpected_moment', 'signature_moment', 'trip_impact']
  },
  trip_family: {
    eventType: 'voyage',
    required: ['destination', 'trip_duration', 'trip_period', 'group_description', 'trip_highlight'],
    optional: ['unexpected_moment', 'signature_moment', 'trip_impact']
  },
  trip_school: {
    eventType: 'voyage',
    required: ['destination', 'trip_duration', 'trip_period', 'group_description', 'trip_highlight'],
    optional: ['unexpected_moment', 'signature_moment', 'trip_impact']
  },
  project_company: {
    eventType: 'projet',
    required: ['project_name', 'project_duration', 'team_description', 'biggest_challenge'],
    optional: ['team_joke', 'project_impact', 'turning_point']
  },
  project_association: {
    eventType: 'projet',
    required: ['project_name', 'project_duration', 'team_description', 'biggest_challenge'],
    optional: ['team_joke', 'project_impact', 'turning_point']
  },
  project_school: {
    eventType: 'projet',
    required: ['project_name', 'project_duration', 'team_description', 'biggest_challenge'],
    optional: ['team_joke', 'project_impact', 'turning_point']
  },
  family_annual: {
    eventType: 'famille',
    required: ['family_name', 'reunion_occasion', 'generations_count'],
    optional: ['family_ritual', 'family_legend', 'family_saying', 'transmission_wish']
  },
  family_reunion: {
    eventType: 'famille',
    required: ['family_name', 'reunion_occasion', 'generations_count'],
    optional: ['family_ritual', 'family_legend', 'family_saying', 'transmission_wish']
  },
  family_memory: {
    eventType: 'famille',
    required: ['family_name', 'reunion_occasion', 'generations_count'],
    optional: ['family_ritual', 'family_legend', 'family_saying', 'transmission_wish']
  },
  custom: {
    eventType: 'custom',
    required: ['character_trait', 'signature_anecdote'],
    optional: ['recipient_nickname', 'signature_phrase', 'future_wish']
  }
};

const BOOK_CONFIG_COLUMNS = [
  'event_type',
  'event_subtype',
  'event_date',
  'event_location',
  'recipient_name',
  'recipient_nickname',
  'narrative_style',
  'recipient_age',
  'character_trait',
  'signature_anecdote',
  'signature_phrase',
  'signature_place',
  'future_wish',
  'signature_passion',
  'years_in_role',
  'job_description_plain',
  'will_be_missed_for',
  'contributor_circle',
  'retirement_project',
  'departure_context',
  'time_together',
  'next_destination',
  'recipient_name_2',
  'how_they_met',
  'complementarity',
  'relationship_duration',
  'couple_anecdote',
  'parents_names',
  'birth_anecdote',
  'family_context',
  'destination',
  'trip_duration',
  'trip_period',
  'group_description',
  'trip_highlight',
  'unexpected_moment',
  'signature_moment',
  'trip_impact',
  'project_name',
  'project_duration',
  'team_description',
  'biggest_challenge',
  'team_joke',
  'project_impact',
  'turning_point',
  'family_name',
  'reunion_occasion',
  'generations_count',
  'family_ritual',
  'family_legend',
  'family_saying',
  'transmission_wish',
  'chapter_count',
  'book_finish',
  'paper_type'
];

function getSubtypeSchema(subtypeSlug = '') {
  return SUBTYPE_SCHEMAS[subtypeSlug] || null;
}

function getSubtypeDefaults(subtypeSlug = '') {
  const schema = getSubtypeSchema(subtypeSlug);
  return schema?.defaults && typeof schema.defaults === 'object' ? schema.defaults : {};
}

function isAllowedNarrativeStyle(value = '') {
  return NARRATIVE_STYLES.includes(String(value || '').trim());
}

function isAllowedBookFinish(value = '') {
  return BOOK_FINISHES.includes(String(value || '').trim());
}

function isAllowedPaperType(value = '') {
  return PAPER_TYPES.includes(String(value || '').trim());
}

function isAllowedChapterCount(value) {
  return CHAPTER_COUNTS.includes(Number(value));
}

module.exports = {
  CHAPTER_COUNTS,
  BOOK_CONFIG_COLUMNS,
  BOOK_FINISHES,
  PAPER_TYPES,
  NARRATIVE_STYLES,
  EVENT_TYPE_ICONS,
  FIELD_DEFINITIONS,
  SUBTYPE_SCHEMAS,
  getSubtypeSchema,
  getSubtypeDefaults,
  isAllowedNarrativeStyle,
  isAllowedBookFinish,
  isAllowedPaperType,
  isAllowedChapterCount
};
