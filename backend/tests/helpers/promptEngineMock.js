// Mock de promptEngine.runPromptGeneration avec journal d'appels persistant.
//
// Le journal vit dans ce module (et non dans un jest.fn) pour survivre a
// clearMocks entre les tests : on peut donc inspecter dans un `it` un appel
// declenche dans un `beforeAll`.

const { AI_CHAPTER_BODY_OUTPUT, PROMPT_TEMPLATE_STUB } = require('../fixtures/aiChapterOutput');

const state = {
  calls: [],
  nextError: null,
  output: AI_CHAPTER_BODY_OUTPUT
};

async function runPromptGeneration(options) {
  state.calls.push(options);

  if (state.nextError) {
    const error = state.nextError;
    state.nextError = null;
    throw error;
  }

  return {
    output: state.output,
    template: PROMPT_TEMPLATE_STUB,
    validation: { ok: true, warnings: [] }
  };
}

module.exports = {
  runPromptGeneration,
  __state: state,
  __calls: () => state.calls,
  __reset: () => {
    state.calls = [];
    state.nextError = null;
    state.output = AI_CHAPTER_BODY_OUTPUT;
  },
  __failNext: (error) => {
    state.nextError = error;
  }
};
