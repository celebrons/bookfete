const promptEngine = require('./promptEngine');
const aiService = require('./aiService');
const {
  buildChapterAmorceVariables,
  getChapterAmorceContext,
  parseChapterAmorceOutput,
  validateRoleScopedAmorce
} = require('./chapterAmorceService');

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function cleanText(value, maxLength = 0) {
  const normalized = normalizeText(value);
  if (!normalized || !Number.isFinite(Number(maxLength)) || Number(maxLength) <= 0) {
    return normalized;
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, Number(maxLength) - 3)).trim()}...`
    : normalized;
}

function normalizeVariableName(value = '') {
  const normalized = normalizeText(
    typeof value === 'string' ? value : value?.name
  );
  if (!normalized || normalized === '[object Object]') {
    return '';
  }
  if (!/^[a-zA-Z0-9_@.]+$/.test(normalized)) {
    return '';
  }
  return normalized;
}

function buildVariableFamilyKey(name = '') {
  return normalizeVariableName(name).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function choosePreferredVariableName(leftName = '', rightName = '') {
  const scoreName = (name) => {
    let score = 0;
    if (name.includes('_')) score += 2;
    if (name === name.toLowerCase()) score += 1;
    if (name.includes('.')) score -= 1;
    return score;
  };

  const leftScore = scoreName(leftName);
  const rightScore = scoreName(rightName);

  if (rightScore !== leftScore) {
    return rightScore > leftScore ? rightName : leftName;
  }

  return rightName.length < leftName.length ? rightName : leftName;
}

function buildCanonicalVariableLookup(variables = {}) {
  const families = new Map();

  Object.keys(variables || {}).forEach((rawName) => {
    const name = normalizeVariableName(rawName);
    if (!name) return;

    const familyKey = buildVariableFamilyKey(name);
    if (!familyKey) return;

    const existing = families.get(familyKey);
    families.set(
      familyKey,
      existing ? choosePreferredVariableName(existing, name) : name
    );
  });

  return families;
}

function resolveCanonicalVariableName(variableName = '', variables = {}) {
  const name = normalizeVariableName(variableName);
  if (!name) return '';
  const canonicalLookup = buildCanonicalVariableLookup(variables);
  return canonicalLookup.get(buildVariableFamilyKey(name)) || name;
}

function serializePreviewValue(value, depth = 0) {
  if (value === null || value === undefined) return '';
  if (depth > 2) return '';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 4)
      .map((item) => serializePreviewValue(item, depth + 1))
      .filter(Boolean)
      .join(' | ');
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .slice(0, 4)
      .map(([key, nestedValue]) => {
        const nestedPreview = serializePreviewValue(nestedValue, depth + 1);
        return nestedPreview ? `${key}: ${nestedPreview}` : '';
      })
      .filter(Boolean)
      .join(', ');
  }

  return '';
}

function getDeepValue(source, pathSegments) {
  if (!source || typeof source !== 'object') return undefined;
  let cursor = source;
  for (const segment of pathSegments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== 'object') return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function resolveVariableValue(source, variablePath = '') {
  const normalizedPath = normalizeText(variablePath);
  if (!normalizedPath) return undefined;

  if (source && typeof source === 'object' && source[normalizedPath] !== undefined) {
    return source[normalizedPath];
  }

  const segments = normalizedPath.split('.').filter(Boolean);
  return getDeepValue(source, segments);
}

function hasRenderableValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(normalizeText(value));
}

function formatVariableValuePreview(value) {
  return cleanText(serializePreviewValue(value), 320);
}

function dedupeVariableMeta(items = []) {
  const byName = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const name = normalizeVariableName(item);
    if (!name) return;

    const existing = byName.get(name);
    const next = typeof item === 'string'
      ? {
          name,
          required: false,
          hasValue: true,
          preview: ''
        }
      : {
          name,
          required: Boolean(item?.required),
          hasValue: Boolean(item?.hasValue),
          preview: normalizeText(item?.preview)
        };

    if (!existing) {
      byName.set(name, next);
      return;
    }

    byName.set(name, {
      name,
      required: Boolean(existing.required || next.required),
      hasValue: Boolean(existing.hasValue || next.hasValue),
      preview: existing.preview || next.preview || ''
    });
  });

  return [...byName.values()].sort((left, right) => (
    String(left?.name || '').localeCompare(String(right?.name || ''), 'fr')
  ));
}

function extractPromptVariableMeta(template = {}, variables = {}) {
  const source = [
    String(template?.context_block || ''),
    String(template?.data_block || ''),
    String(template?.output_format || '')
  ].join('\n');

  const directVariables = new Set();
  const loopVariables = new Set();
  const conditionalVariables = new Set();

  const directPattern = /{{\s*(?![#/])([a-zA-Z0-9_@.]+)\s*}}/g;
  const eachPattern = /{{#each\s+([a-zA-Z0-9_@.]+)\s*}}/g;
  const ifPattern = /{{#if\s+(.+?)\s*}}/g;

  let match = directPattern.exec(source);
  while (match) {
    directVariables.add(normalizeText(match[1]));
    match = directPattern.exec(source);
  }

  match = eachPattern.exec(source);
  while (match) {
    loopVariables.add(normalizeText(match[1]));
    match = eachPattern.exec(source);
  }

  match = ifPattern.exec(source);
  while (match) {
    const expression = normalizeText(match[1]);
    const eqMatch = expression.match(/^\(\s*eq\s+([a-zA-Z0-9_@.]+)\s+/);
    if (eqMatch?.[1]) {
      conditionalVariables.add(normalizeText(eqMatch[1]));
    } else if (/^[a-zA-Z0-9_@.]+$/.test(expression)) {
      conditionalVariables.add(expression);
    }
    match = ifPattern.exec(source);
  }

  const orderedNames = [
    ...directVariables,
    ...loopVariables,
    ...conditionalVariables
  ].filter((name, index, list) => name && list.indexOf(name) === index);

  return dedupeVariableMeta(orderedNames.map((name) => {
    const value = resolveVariableValue(variables, name);
    const canonicalName = resolveCanonicalVariableName(name, variables);
    return {
      name: canonicalName || name,
      required: directVariables.has(name) || loopVariables.has(name),
      hasValue: hasRenderableValue(value),
      preview: formatVariableValuePreview(value)
    };
  }));
}

function buildAvailableVariableMeta(variables = {}) {
  return dedupeVariableMeta(Object.keys(variables || {})
    .sort((left, right) => left.localeCompare(right, 'fr'))
    .map((name) => {
      const value = resolveVariableValue(variables, name);
      return {
        name: resolveCanonicalVariableName(name, variables) || name,
        required: false,
        hasValue: hasRenderableValue(value),
        preview: formatVariableValuePreview(value)
      };
    }));
}

function buildInlineTemplateLabel(label = '') {
  const baseLabel = normalizeText(label, 'Amorce du chapitre')
    .replace(/\s*-\s*inline$/i, '')
    .trim();
  return `${baseLabel} - inline`;
}

function buildVisibleDirectiveText(sections = {}) {
  const orderedSections = [
    ['OBJECTIF', sections.objective],
    ['OBLIGATOIRE', sections.required],
    ['A EXCLURE', sections.excluded],
    ['FORMAT ATTENDU', sections.output]
  ];

  return orderedSections
    .map(([label, items]) => {
      const safeItems = (Array.isArray(items) ? items : [])
        .map((item) => normalizeText(item))
        .filter(Boolean);

      if (safeItems.length === 0) {
        return '';
      }

      return [
        label,
        ...safeItems.map((item) => `- ${item}`)
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildChapterAmorceDefaultDirectives() {
  return buildVisibleDirectiveText({
    objective: [
      'Produire une amorce de chapitre elegante et 3 ou 4 mots-declencheurs directement relies au chapitre.',
      'Le resultat doit guider l ecriture du contributeur sans resumer tout le chapitre.'
    ],
    required: [
      'Utiliser uniquement les donnees reelles disponibles dans ce livre et ce chapitre.',
      'Ecrire une phrase d amorce specifique au chapitre, sans point d interrogation.',
      'Si un prenom ou surnom existe et que le registre n est pas group, l integrer naturellement.',
      'Retourner strictement un JSON avec les cles amorce et triggers.',
      'Produire 3 ou 4 triggers courts et concrets.'
    ],
    excluded: [
      'Ne pas inventer de nom, lien, lieu, anecdote ou detail absent du contexte.',
      'Ne pas ouvrir par souvenir ou memoire.',
      'Ne pas reutiliser une anecdote signature si elle ne convient pas au role du chapitre.',
      'Ne pas produire de commentaire, de markdown ou de texte hors JSON.'
    ],
    output: [
      'Objet JSON strict : {"amorce":"...","triggers":["...","...","..."]}.',
      'Aucun champ supplementaire.'
    ]
  });
}

function buildChapterAmorceInlineContextBlock(variables = {}) {
  return [
    'Contexte reel disponible :',
    `- Titre du livre : ${normalizeText(variables.book_title, 'Livre souvenir')}`,
    `- Evenement : ${normalizeText(variables.event_type, 'evenement')}`,
    normalizeText(variables.event_subtype) ? `- Sous-type : ${normalizeText(variables.event_subtype)}` : '',
    normalizeText(variables.narrative_person) ? `- Registre narratif : ${normalizeText(variables.narrative_person)}` : '',
    normalizeText(variables.recipient_name) ? `- Destinataire : ${normalizeText(variables.recipient_name)}` : '',
    normalizeText(variables.recipient_nickname) ? `- Surnom : ${normalizeText(variables.recipient_nickname)}` : '',
    normalizeText(variables.character_trait) ? `- Trait marquant : ${normalizeText(variables.character_trait)}` : '',
    normalizeText(variables.signature_anecdote) ? `- Anecdote disponible : ${normalizeText(variables.signature_anecdote)}` : '',
    normalizeText(variables.signature_phrase) ? `- Expression disponible : ${normalizeText(variables.signature_phrase)}` : '',
    normalizeText(variables.future_wish) ? `- Souhait pour la suite : ${normalizeText(variables.future_wish)}` : '',
    `- Chapitre ${Number(variables.chapter_index || 1)} sur ${Number(variables.chapter_total || 1)}`,
    `- Titre du chapitre : ${normalizeText(variables.chapter_title, 'Chapitre')}`,
    normalizeText(variables.chapter_theme) ? `- Theme : ${normalizeText(variables.chapter_theme)}` : '',
    normalizeText(variables.chapter_arc) ? `- Arc narratif : ${normalizeText(variables.chapter_arc)}` : '',
    normalizeText(variables.prev_chapter_title) ? `- Chapitre precedent : ${normalizeText(variables.prev_chapter_title)}` : '',
    normalizeText(variables.next_chapter_title) ? `- Chapitre suivant : ${normalizeText(variables.next_chapter_title)}` : '',
    normalizeText(variables.chapter_role) ? `- Role du chapitre : ${normalizeText(variables.chapter_role)}` : '',
    normalizeText(variables.chapter_focus_hint) ? `- Point d attention : ${normalizeText(variables.chapter_focus_hint)}` : '',
    normalizeText(variables.marker_policy) ? `- Politique de marqueurs : ${normalizeText(variables.marker_policy)}` : '',
    normalizeText(variables.generation_mode) ? `- Mode de generation impose : ${normalizeText(variables.generation_mode)}` : '',
    Array.isArray(variables.fallback_formulations) && variables.fallback_formulations.length > 0
      ? `- Formulations de secours : ${variables.fallback_formulations.map((item) => normalizeText(item)).filter(Boolean).join(' | ')}`
      : ''
  ].filter(Boolean).join('\n');
}

function resolveVisibleChapterAmorceDirectives(template = {}) {
  const label = normalizeText(template?.label || '').toLowerCase();
  if (label.endsWith('- inline')) {
    return normalizeText(template?.data_block || '') || buildChapterAmorceDefaultDirectives();
  }

  return buildChapterAmorceDefaultDirectives();
}

function buildChapterAmorcePromptTemplateWithDirectives(activeTemplate, directives = '', variables = {}) {
  const effectiveDirectives = normalizeText(directives) || buildChapterAmorceDefaultDirectives();

  return {
    ...activeTemplate,
    system_prompt: '',
    context_block: buildChapterAmorceInlineContextBlock(variables),
    data_block: effectiveDirectives,
    output_format: '',
    min_words: 0,
    max_words: 0
  };
}

function formatChapterAmorceResult(parsed = {}) {
  const triggers = Array.isArray(parsed?.triggers) ? parsed.triggers : [];

  return [
    'AMORCE',
    normalizeText(parsed?.amorceText || parsed?.amorce),
    '',
    'MOTS-CLES',
    ...triggers.map((item) => `- ${normalizeText(item)}`)
  ].filter(Boolean).join('\n');
}

function buildAmorceValidation(resultValidation = {}, parsed = null, parseError = null) {
  const validation = {
    wordCount: Number(resultValidation?.wordCount || 0),
    errors: Array.isArray(resultValidation?.errors) ? [...resultValidation.errors] : [],
    warnings: Array.isArray(resultValidation?.warnings) ? [...resultValidation.warnings] : [],
    forbiddenHits: Array.isArray(resultValidation?.forbiddenHits) ? resultValidation.forbiddenHits : []
  };

  if (parsed?.amorceText) {
    validation.wordCount = normalizeText(parsed.amorceText).split(/\s+/).filter(Boolean).length;
  }

  if (parseError?.message) {
    validation.errors.push(parseError.message);
  }

  validation.isValid = validation.errors.length === 0;
  return validation;
}

async function getChapterAmorcePromptAdminContext(chapterId, ownerId = '') {
  const context = await getChapterAmorceContext(chapterId, ownerId);
  const variables = buildChapterAmorceVariables(context);
  const activeTemplate = await promptEngine.getActivePromptTemplate('chapter_amorce');
  const directives = resolveVisibleChapterAmorceDirectives(activeTemplate);
  const inlinePreviewTemplate = buildChapterAmorcePromptTemplateWithDirectives(activeTemplate, directives, variables);
  const templateVariables = extractPromptVariableMeta(inlinePreviewTemplate, variables);

  return {
    ...context,
    variables,
    availableVariableMeta: buildAvailableVariableMeta(variables),
    templateVariables,
    activeTemplate,
    directives,
    contextSummary: {
      bookTitle: variables.book_title,
      chapterTitle: variables.chapter_title,
      tone: variables.generation_mode ? `Mode ${variables.generation_mode}` : '',
      eventType: variables.event_type,
      chapterIndex: variables.chapter_index,
      chapterTotal: variables.chapter_total
    }
  };
}

async function testInlineChapterAmorcePrompt({
  chapterId,
  ownerId,
  directives = '',
  model = 'mistral-small-latest'
}) {
  const context = await getChapterAmorcePromptAdminContext(chapterId, ownerId);
  const template = buildChapterAmorcePromptTemplateWithDirectives(
    context.activeTemplate,
    directives,
    context.variables
  );
  const templateVariables = extractPromptVariableMeta(template, context.variables);
  const result = await promptEngine.testPromptTemplate({
    template,
    variables: context.variables,
    mistralClient: aiService.mistral,
    runModel: true,
    model
  });

  const roleValidationContext = {
    chapterRole: context.variables.chapter_role,
    fullSignatureAnecdote: normalizeText(context.config?.signature_anecdote),
    scopedSignatureAnecdote: normalizeText(context.variables.signature_anecdote),
    fullSignaturePhrase: normalizeText(context.config?.signature_phrase),
    scopedSignaturePhrase: normalizeText(context.variables.signature_phrase)
  };

  let parsed = null;
  let parseError = null;

  try {
    parsed = parseChapterAmorceOutput(result.output);
    validateRoleScopedAmorce({
      ...parsed,
      ...roleValidationContext
    });
  } catch (error) {
    parseError = error;
  }

  return {
    ...context,
    template,
    templateVariables,
    result: {
      ...result,
      output: parsed ? formatChapterAmorceResult(parsed) : result.output,
      rawOutput: result.output,
      validation: buildAmorceValidation(result.validation, parsed, parseError)
    }
  };
}

async function publishInlineChapterAmorcePrompt({
  chapterId,
  ownerId,
  directives = '',
  createdBy = ''
}) {
  const context = await getChapterAmorcePromptAdminContext(chapterId, ownerId);
  const activeTemplate = context.activeTemplate;
  const inlineTemplate = buildChapterAmorcePromptTemplateWithDirectives(
    activeTemplate,
    directives,
    context.variables
  );
  const nextTemplatePayload = {
    type: 'chapter_amorce',
    label: buildInlineTemplateLabel(activeTemplate?.label),
    status: 'draft',
    system_prompt: inlineTemplate.system_prompt || '',
    context_block: inlineTemplate.context_block || '',
    data_block: inlineTemplate.data_block || '',
    output_format: inlineTemplate.output_format || '',
    forbidden_phrases: Array.isArray(activeTemplate?.forbidden_phrases) ? activeTemplate.forbidden_phrases : [],
    min_words: inlineTemplate.min_words,
    max_words: inlineTemplate.max_words
  };

  const createdTemplate = await promptEngine.createPromptTemplateVersion(nextTemplatePayload, createdBy);
  const activatedTemplate = await promptEngine.activatePromptTemplate(createdTemplate.id);
  const templateVariables = extractPromptVariableMeta(activatedTemplate, context.variables);

  return {
    ...context,
    template: activatedTemplate,
    templateVariables,
    directives: normalizeText(activatedTemplate?.data_block || '') || buildChapterAmorceDefaultDirectives()
  };
}

module.exports = {
  getChapterAmorcePromptAdminContext,
  testInlineChapterAmorcePrompt,
  publishInlineChapterAmorcePrompt
};
