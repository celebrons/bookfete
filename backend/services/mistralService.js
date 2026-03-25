// Legacy compatibility module.
// Prompt content is now DB-driven via services/promptEngine.js.

class DeprecatedMistralService {
  async generateQuestions() {
    throw new Error(
      'mistralService est obsolete: utilisez services/aiService.js + services/promptEngine.js (templates DB).'
    );
  }
}

module.exports = new DeprecatedMistralService();
