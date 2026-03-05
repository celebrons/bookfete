require('dotenv').config();

const promptTemplateService = require('../services/promptTemplateService');

const QUESTION_EVENT_VARIANTS = {
  anniversaire:
    'Priorite anniversaire: insiste sur les rites de celebration, les souvenirs marquants et la projection vers les annees a venir.',
  mariage:
    'Priorite mariage: fais ressortir la dynamique du couple, les moments fondateurs et les emotions partagees avec les proches.',
  naissance:
    'Priorite naissance: privilegie un ton tendre, les premieres fois et la transmission familiale autour de l enfant.',
  depart:
    'Priorite depart: valorise les moments collectifs, les transitions et la trace laissee dans le groupe.',
  projet:
    'Priorite fin de projet: fais emerger les etapes clefs, les defis releves et l impact humain de l aventure commune.',
  retraite:
    'Priorite retraite: souligne le parcours, l heritage professionnel et les messages de reconnaissance.',
  vacances:
    'Priorite vacances: ancre les reponses dans les lieux, ambiances, details sensoriels et souvenirs de voyage.'
};

async function run() {
  const base = await promptTemplateService.getActivePromptConfig({
    promptKey: promptTemplateService.PROMPT_KEYS.QUESTION_GENERATION,
    eventType: 'generique',
    locale: 'fr'
  });

  if (!base?.systemPrompt || !base?.userPromptTemplate) {
    throw new Error('Prompt de base question_generation introuvable.');
  }

  for (const [eventType, directive] of Object.entries(QUESTION_EVENT_VARIANTS)) {
    const userPromptTemplate = [
      base.userPromptTemplate.trim(),
      '',
      'Directive evenementielle prioritaire :',
      `- ${directive}`
    ].join('\n');

    const result = await promptTemplateService.upsertPromptVersion({
      promptKey: promptTemplateService.PROMPT_KEYS.QUESTION_GENERATION,
      eventType,
      locale: 'fr',
      systemPrompt: base.systemPrompt,
      userPromptTemplate,
      temperature: base.temperature,
      maxTokens: base.maxTokens,
      status: 'published',
      publish: true,
      createdBy: 'seed-question-variants'
    });

    console.log(
      `✅ question_generation variant published event=${eventType} version=${result.insertedVersion.version}`
    );
  }
}

run()
  .then(() => {
    console.log('🎯 Question prompt variants seeded successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to seed question prompt variants:', error.message);
    process.exit(1);
  });
