require('dotenv').config();

const promptEngine = require('../services/promptEngine');

const TEMPLATE_PAYLOAD = {
  type: 'chapter_body',
  status: 'active',
  label: 'chapter_body - test QA premium',
  system_prompt: [
    'Tu es un redacteur narratif premium.',
    'Tu ecris un texte fluide, incarne, sans meta-commentaire.',
    "Tu n affiches jamais les consignes."
  ].join(' '),
  context_block: [
    'Contexte livre :',
    '- Titre : {{book_title}}',
    '- Occasion : {{book_occasion}}',
    '- Destinataire : {{recipient_name}} ({{recipient_age}} ans)',
    '- Ton : {{book_tone}}',
    '- Lieu : {{book_location}}',
    '- Annee : {{book_year}}',
    '- Chapitre {{chapter_index}}/{{chapter_total}} : {{chapter_title}}',
    '- Theme : {{chapter_theme}}',
    '- Arc narratif : {{chapter_arc}}',
    '- Emotion cible : {{chapter_emotion}}',
    '{{#if prev_chapter_title}}- Chapitre precedent : {{prev_chapter_title}}{{/if}}',
    '{{#if next_chapter_title}}- Chapitre suivant : {{next_chapter_title}}{{/if}}'
  ].join('\n'),
  data_block: [
    'Contributions ({{contributions_count}}, richesse={{contributions_richness}}) :',
    '{{#each contributions}}',
    '- {{name}} ({{role}}) : {{response_text}}',
    '{{/each}}',
    '',
    'Photos :',
    '{{#each photos}}',
    '- {{caption}} {{#if date}}({{date}}){{/if}}',
    '{{/each}}'
  ].join('\n'),
  output_format: [
    'Rends strictement ce format :',
    '',
    '[OUVERTURE]',
    '2 paragraphes narratifs.',
    '',
    '[CORPS]',
    '6 a 8 paragraphes narratifs. Pas de puces, pas de "Page X", pas de "Chapitre X", pas de markdown.',
    '',
    '[CODA]',
    '1 a 2 paragraphes de cloture.'
  ].join('\n'),
  forbidden_phrases: [
    'dans ce chapitre',
    'il est important de',
    'nous allons'
  ],
  min_words: 750,
  max_words: 1800
};

const SAMPLE_VARIABLES = {
  book_title: "Pour les 40 ans d'Omar",
  book_occasion: 'Anniversaire 40 ans',
  recipient_name: 'Omar',
  recipient_age: '40',
  book_tone: 'intime',
  book_location: 'Lyon',
  book_year: '2026',
  chapter_total: 6,
  chapter_index: 2,
  chapter_title: 'Les moments qui marquent',
  chapter_theme: 'Amitie et fidelite',
  chapter_arc: "Du souvenir drole vers l'emotion",
  chapter_emotion: 'chaleur',
  prev_chapter_title: 'Ouverture',
  next_chapter_title: 'Rires partages',
  contributions_count: 3,
  contributions_richness: 'moyenne',
  contributions: [
    {
      name: 'Nadia',
      role: 'amie',
      response_text: "Le soir de ses 30 ans, la sono est tombee en panne. Omar a sorti une petite enceinte, a relance la fete et a fait danser tout le monde sous la pluie."
    },
    {
      name: 'Karim',
      role: 'frere',
      response_text: "Quand notre pere a ete hospitalise, Omar passait tous les soirs apres le travail. Il arrivait fatigue mais restait calme, toujours avec un mot juste."
    },
    {
      name: 'Sophie',
      role: 'collegue',
      response_text: "Sur un projet difficile, il a pris les tensions sur lui pour proteger l'equipe. Le dernier jour, il a ecrit une carte personnalisee a chacun."
    }
  ],
  photos: [
    { caption: 'Soiree sur la terrasse', date: '2025-07-14' },
    { caption: 'Photo de groupe au restaurant', date: '2026-01-22' }
  ]
};

async function run() {
  const inserted = await promptEngine.createPromptTemplateVersion(
    TEMPLATE_PAYLOAD,
    'seed-chapter-body-test'
  );

  console.log('Template chapter_body active cree.');
  console.log(`id=${inserted.id}`);
  console.log(`version=${inserted.version}`);
  console.log('Variables de test a coller dans la page admin:');
  console.log(JSON.stringify(SAMPLE_VARIABLES, null, 2));
}

run()
  .then(() => {
    console.log('Seed termine.');
  })
  .catch((error) => {
    const message = String(error?.message || 'Erreur inconnue');
    if (message.toLowerCase().includes('prompt_templates')) {
      console.error('Echec seed chapter_body test: table prompt_templates introuvable.');
      console.error('Applique d abord sql/prompt_engine.sql dans Supabase, puis relance la commande.');
      return;
    }
    console.error('Echec seed chapter_body test:', message);
  });
