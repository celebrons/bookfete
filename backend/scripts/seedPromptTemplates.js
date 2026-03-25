require('dotenv').config();

const promptEngine = require('../services/promptEngine');

async function run() {
  for (const promptType of promptEngine.TEMPLATE_TYPES) {
    const existing = await promptEngine.listPromptTemplates({ type: promptType });
    const versions = Array.isArray(existing) ? existing : [];
    const activeVersion = versions.find((row) => String(row.status || '').toLowerCase() === 'active');

    if (versions.length === 0) {
      const inserted = await promptEngine.createPromptTemplateVersion(
        {
          type: promptType,
          status: 'active',
          label: `${promptType} - to configure`,
          system_prompt: '[TO CONFIGURE IN ADMIN]',
          context_block: '',
          data_block: '',
          output_format: '',
          forbidden_phrases: [],
          min_words: 0,
          max_words: 0
        },
        'seed-script'
      );
      console.log(`OK prompt seed active type=${promptType} version=${inserted.version}`);
      continue;
    }

    if (activeVersion) {
      console.log(`INFO prompt templates already present for type=${promptType} (${versions.length}, active=v${activeVersion.version})`);
      continue;
    }

    const latest = versions
      .slice()
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
    const activated = await promptEngine.activatePromptTemplate(latest.id);
    console.log(`OK activated existing template type=${promptType} version=${activated.version}`);
  }
}

run()
  .then(() => {
    console.log('DONE prompt templates seeded.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('FAILED to seed prompt templates:', error.message);
    console.error('Apply SQL from sql/prompt_engine.sql first.');
    process.exit(1);
  });
