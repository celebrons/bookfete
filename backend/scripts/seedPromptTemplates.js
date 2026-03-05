require('dotenv').config();

const promptTemplateService = require('../services/promptTemplateService');

async function run() {
  const keys = Object.keys(promptTemplateService.DEFAULT_PROMPTS);

  for (const promptKey of keys) {
    const defaults = promptTemplateService.DEFAULT_PROMPTS[promptKey];

    const result = await promptTemplateService.upsertPromptVersion({
      promptKey,
      eventType: '*',
      locale: 'fr',
      systemPrompt: defaults.systemPrompt,
      userPromptTemplate: defaults.userPromptTemplate,
      temperature: defaults.temperature,
      maxTokens: defaults.maxTokens,
      status: 'published',
      publish: true,
      createdBy: 'seed-script'
    });

    console.log(
      `✅ Prompt seed: ${promptKey} event=* locale=fr version=${result.insertedVersion.version}`
    );
  }
}

run()
  .then(() => {
    console.log('🎯 Prompt templates seeded successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to seed prompt templates:', error.message);
    console.error('ℹ️ Ensure SQL from sql/ai_prompt_templates.sql is applied first.');
    process.exit(1);
  });
