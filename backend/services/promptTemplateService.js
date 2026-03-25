const promptEngine = require('./promptEngine');

// Legacy compatibility layer.
// No prompt content is stored here: all templates are in DB (prompt_templates).
const PROMPT_KEYS = Object.freeze({
  CHAPTER_GENERATION: 'chapter_titles',
  QUESTION_GENERATION: 'contributor_questions',
  CONTENT_GENERATION: 'chapter_body',
  BOOK_TITLE: 'book_title',
  FRAME_TEXTS: 'frame_texts'
});

const DEFAULT_PROMPTS = Object.freeze({});

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

function compileTemplate(template, variables = {}) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_@.]+)\s*}}/g, (_full, key) => {
    const value = variables?.[key];
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

function applyPromptGuardrails({ userPrompt = '' }) {
  return normalizeText(userPrompt);
}

async function getActivePromptConfig({ promptKey }) {
  const type = normalizeText(promptKey).toLowerCase();
  const template = await promptEngine.getActivePromptTemplate(type);
  return {
    source: 'database',
    promptKey: template.type,
    version: template.version,
    templateId: template.id,
    systemPrompt: template.system_prompt,
    userPromptTemplate: [template.context_block, template.data_block, template.output_format]
      .filter(Boolean)
      .join('\n\n-----\n\n'),
    minWords: template.min_words,
    maxWords: template.max_words
  };
}

async function buildPrompt({ promptKey, variables = {} }) {
  const active = await getActivePromptConfig({ promptKey });
  const userPrompt = compileTemplate(active.userPromptTemplate, variables);
  return {
    ...active,
    userPrompt
  };
}

async function listPromptVersions() {
  return null;
}

async function upsertPromptVersion() {
  throw new Error('Deprecated: utilisez promptEngine.createPromptTemplateVersion');
}

async function updatePromptVersionNote() {
  throw new Error('Deprecated: utilisez les nouveaux endpoints prompt_templates');
}

async function activatePromptVersion() {
  throw new Error('Deprecated: utilisez promptEngine.activatePromptTemplate');
}

async function deletePromptVersion() {
  throw new Error('Deprecated: utilisez promptEngine.archivePromptTemplate');
}

function clearPromptCache() {
  promptEngine.clearPromptEngineCache();
}

module.exports = {
  PROMPT_KEYS,
  DEFAULT_PROMPTS,
  compileTemplate,
  applyPromptGuardrails,
  buildPrompt,
  getActivePromptConfig,
  listPromptVersions,
  upsertPromptVersion,
  updatePromptVersionNote,
  activatePromptVersion,
  deletePromptVersion,
  clearPromptCache
};
