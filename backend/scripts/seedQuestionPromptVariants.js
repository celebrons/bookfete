require('dotenv').config();

const promptEngine = require('../services/promptEngine');

async function run() {
  const templates = await promptEngine.listPromptTemplates({ type: 'contributor_questions' });
  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error(
      'No contributor_questions template found. Run: npm run prompts:seed then configure prompts in admin.'
    );
  }

  console.log(
    'No hardcoded question variants are seeded anymore. Configure variants directly in the admin prompt page.'
  );
  console.log(`Templates found for contributor_questions: ${templates.length}`);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
