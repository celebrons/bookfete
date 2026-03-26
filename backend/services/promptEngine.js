const supabase = require('../config/supabase');

const TEMPLATE_TYPES = Object.freeze([
  'book_title',
  'chapter_titles',
  'book_introduction',
  'book_conclusion',
  'chapter_amorce',
  'contributor_questions',
  'chapter_body',
  'frame_texts'
]);

const PROMPT_SEPARATOR = '\n\n-----\n\n';
const PLACEHOLDER_TEST_PATTERN = /{{\s*[^}]+?\s*}}/;
const UNRESOLVED_PLACEHOLDER_PATTERN = /{{\s*[^}]+?\s*}}/g;
const EACH_BLOCK_PATTERN = /{{#each\s+([a-zA-Z0-9_@.]+)\s*}}([\s\S]*?){{\/each}}/g;
const IF_BLOCK_PATTERN = /{{#if\s+(.+?)\s*}}([\s\S]*?){{\/if}}/g;
const VARIABLE_PATTERN = /{{\s*(?![#/])([a-zA-Z0-9_@.]+)\s*}}/g;

const CACHE_TTL_MS = Number(process.env.PROMPT_ENGINE_CACHE_TTL_MS || 30000);
const templateCache = new Map();

class PromptEngineError extends Error {
  constructor(message, code = 'PROMPT_ENGINE_ERROR', status = 400, details = {}) {
    super(message);
    this.name = 'PromptEngineError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

function normalizePromptType(type) {
  return normalizeText(type).toLowerCase();
}

function ensurePromptType(type) {
  const normalized = normalizePromptType(type);
  if (!TEMPLATE_TYPES.includes(normalized)) {
    throw new PromptEngineError(
      `Type de prompt invalide: ${type}`,
      'PROMPT_TYPE_INVALID',
      400,
      { allowedTypes: TEMPLATE_TYPES }
    );
  }
  return normalized;
}

function parseForbiddenPhrases(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeText(item)).filter(Boolean);
      }
    } catch (_error) {
      // Ignore and fallback to one-item array.
    }
    return [raw];
  }
  return [];
}

function getCacheValue(cacheKey) {
  const cached = templateCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    templateCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCacheValue(cacheKey, value) {
  templateCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

function clearPromptEngineCache() {
  templateCache.clear();
}

function hasPromptPlaceholders(value = '') {
  return PLACEHOLDER_TEST_PATTERN.test(String(value || ''));
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

function valueToText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item === null || item === undefined) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'number' || typeof item === 'boolean') return String(item);
        if (typeof item === 'object') return JSON.stringify(item);
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return '';
}

function isTruthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function parseLiteralValue(raw = '') {
  const source = normalizeText(raw);
  if (!source) return '';
  if (
    (source.startsWith('"') && source.endsWith('"'))
    || (source.startsWith('\'') && source.endsWith('\''))
  ) {
    return source.slice(1, -1);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(source)) {
    return Number(source);
  }
  if (source === 'true') return true;
  if (source === 'false') return false;
  if (source === 'null') return null;
  return source;
}

function evaluateIfExpression(expression, context, tracker) {
  const normalized = normalizeText(expression);
  if (!normalized) return false;

  const eqMatch = normalized.match(/^\(\s*eq\s+([a-zA-Z0-9_@.]+)\s+("[^"]*"|'[^']*'|[^\s)]+)\s*\)$/);
  if (eqMatch) {
    const leftValue = resolveVariable(eqMatch[1], context, tracker);
    const rightValue = parseLiteralValue(eqMatch[2]);
    return String(valueToText(leftValue)) === String(valueToText(rightValue));
  }

  const value = resolveVariable(normalized, context, tracker);
  return isTruthy(value);
}

function resolveVariable(variablePath, context, tracker) {
  const path = normalizeText(variablePath);
  if (!path) return undefined;

  const segments = path.split('.').filter(Boolean);
  const directCandidates = [
    context?.local?.[path],
    context?.root?.[path]
  ];
  for (const candidate of directCandidates) {
    if (candidate !== undefined) {
      return candidate;
    }
  }

  const localResolved = getDeepValue(context?.local, segments);
  if (localResolved !== undefined) return localResolved;

  const rootResolved = getDeepValue(context?.root, segments);
  if (rootResolved !== undefined) return rootResolved;

  if (tracker) {
    tracker.add(path);
  }
  return undefined;
}

function renderTemplateSegment(template, context, missingVariables) {
  let rendered = String(template || '');

  // Use fresh regex instances on each render to avoid global lastIndex pollution
  // across recursive calls when templates contain nested blocks.
  const eachPattern = new RegExp(EACH_BLOCK_PATTERN.source, 'g');
  const ifPattern = new RegExp(IF_BLOCK_PATTERN.source, 'g');
  const variablePattern = new RegExp(VARIABLE_PATTERN.source, 'g');

  rendered = rendered.replace(eachPattern, (_full, arrayPath, innerBlock) => {
    const collection = resolveVariable(arrayPath, context, missingVariables);
    if (!Array.isArray(collection) || collection.length === 0) {
      return '';
    }

    return collection
      .map((entry, index) => {
        const local = {
          ...context.local,
          this: entry,
          '@index': index
        };

        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          Object.assign(local, entry);
        }

        return renderTemplateSegment(innerBlock, {
          root: context.root,
          local
        }, missingVariables);
      })
      .join('\n');
  });

  rendered = rendered.replace(ifPattern, (_full, conditionExpression, innerBlock) => {
    if (!evaluateIfExpression(conditionExpression, context, missingVariables)) return '';
    return renderTemplateSegment(innerBlock, context, missingVariables);
  });

  rendered = rendered.replace(variablePattern, (_full, variablePath) => {
    const value = resolveVariable(variablePath, context, missingVariables);
    return valueToText(value);
  });

  return rendered;
}

function extractUnresolvedPlaceholders(text = '') {
  const matches = String(text || '').match(UNRESOLVED_PLACEHOLDER_PATTERN) || [];
  return [...new Set(matches.map((item) => normalizeText(item)).filter(Boolean))];
}

function normalizeMissingVariableToken(token = '') {
  const raw = normalizeText(token);
  if (!raw) return '';
  const matched = raw.match(/^{{\s*([^}]+?)\s*}}$/);
  if (!matched?.[1]) return raw;
  return normalizeText(matched[1]);
}

function mergeMissingVariableNames(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeMissingVariableToken(value))
      .filter(Boolean)
  )];
}

function buildResolvedPromptBlocks(template, variables = {}) {
  const missingVariables = new Set();
  const context = {
    root: variables && typeof variables === 'object' ? variables : {},
    local: {}
  };

  const resolvedContextBlock = renderTemplateSegment(template.context_block || '', context, missingVariables).trim();
  const resolvedDataBlock = renderTemplateSegment(template.data_block || '', context, missingVariables).trim();

  const unresolvedPlaceholders = [
    ...extractUnresolvedPlaceholders(resolvedContextBlock),
    ...extractUnresolvedPlaceholders(resolvedDataBlock)
  ];

  return {
    resolvedContextBlock,
    resolvedDataBlock,
    missingVariables: [...missingVariables],
    unresolvedPlaceholders
  };
}

function countWords(text = '') {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function validateOutputAgainstTemplate(template, output = '') {
  const normalizedOutput = String(output || '').trim();
  const wordCount = countWords(normalizedOutput);
  const errors = [];
  const warnings = [];

  if (Number.isFinite(Number(template.min_words)) && Number(template.min_words) > 0) {
    if (wordCount < Number(template.min_words)) {
      errors.push(
        `Nombre de mots insuffisant: ${wordCount} < minimum ${Number(template.min_words)}`
      );
    }
  }

  if (Number.isFinite(Number(template.max_words)) && Number(template.max_words) > 0) {
    if (wordCount > Number(template.max_words)) {
      errors.push(
        `Nombre de mots trop eleve: ${wordCount} > maximum ${Number(template.max_words)}`
      );
    }
  }

  const outputLower = normalizedOutput.toLowerCase();
  const forbiddenHits = parseForbiddenPhrases(template.forbidden_phrases)
    .filter((phrase) => outputLower.includes(String(phrase).toLowerCase()));
  if (forbiddenHits.length > 0) {
    errors.push(
      `Phrases interdites detectees: ${forbiddenHits.join(' | ')}`
    );
  }

  if (PLACEHOLDER_TEST_PATTERN.test(normalizedOutput)) {
    errors.push('Placeholders detectes dans la sortie IA.');
  }

  if (!normalizedOutput) {
    errors.push('Sortie IA vide.');
  }

  return {
    wordCount,
    errors,
    warnings,
    forbiddenHits,
    isValid: errors.length === 0
  };
}

async function insertGenerationLog({
  templateId,
  templateVersion,
  promptType,
  attempt,
  validation
}) {
  try {
    await supabase
      .from('prompt_generation_logs')
      .insert([
        {
          template_id: templateId,
          template_version: Number(templateVersion) || 0,
          prompt_type: promptType,
          attempt: Number(attempt) || 1,
          word_count: Number(validation?.wordCount || 0),
          is_valid: Boolean(validation?.isValid),
          errors: Array.isArray(validation?.errors) ? validation.errors : [],
          warnings: Array.isArray(validation?.warnings) ? validation.warnings : []
        }
      ]);
  } catch (error) {
    // Log insertion must never break generation flow.
    console.error('Prompt log insertion failed:', error?.message || error);
  }
}

function buildRetryPrompt({
  baseUserPrompt,
  previousOutput,
  validation,
  attempt,
  template
}) {
  const errorLines = Array.isArray(validation?.errors) ? validation.errors : [];
  const minWords = Number(template.min_words) || 0;
  const maxWords = Number(template.max_words) || 0;

  return [
    baseUserPrompt,
    PROMPT_SEPARATOR,
    'CORRECTION OBLIGATOIRE',
    `Tentative precedente invalide (attempt=${attempt}).`,
    errorLines.length > 0
      ? `Regles violees: ${errorLines.join(' ; ')}`
      : 'Regles violees: validation automatique echouee.',
    minWords > 0 || maxWords > 0
      ? `Contraintes longueur: min=${minWords || 0}, max=${maxWords || 0}, resultat=${validation?.wordCount || 0}.`
      : `Resultat mots: ${validation?.wordCount || 0}.`,
    'Tu dois corriger ta reponse et respecter strictement le format attendu.',
    'Sortie invalide precedente:',
    String(previousOutput || '').trim()
  ].join('\n');
}

async function getActivePromptTemplate(promptType) {
  const normalizedType = ensurePromptType(promptType);
  const cacheKey = `active::${normalizedType}`;
  const cached = getCacheValue(cacheKey);
  if (cached) {
    return cached;
  }

  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('type', normalizedType)
    .eq('status', 'active')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new PromptEngineError(
      `Erreur chargement template actif (${normalizedType}): ${error.message}`,
      'PROMPT_TEMPLATE_LOAD_FAILED',
      500
    );
  }

  if (!data) {
    throw new PromptEngineError(
      `Aucun template actif trouve pour le type "${normalizedType}". Activez une version dans /admin/prompts.`,
      'PROMPT_TEMPLATE_NOT_FOUND',
      404,
      { promptType: normalizedType }
    );
  }

  if (hasPromptPlaceholders(data.system_prompt || '')) {
    throw new PromptEngineError(
      `Le system_prompt du template actif "${normalizedType}" contient des variables interdites.`,
      'PROMPT_SYSTEM_VARIABLES_FORBIDDEN',
      400,
      { templateId: data.id, promptType: normalizedType }
    );
  }

  const normalized = {
    ...data,
    type: normalizePromptType(data.type),
    version: Number(data.version) || 1,
    min_words: Number(data.min_words) || 0,
    max_words: Number(data.max_words) || 0,
    forbidden_phrases: parseForbiddenPhrases(data.forbidden_phrases)
  };
  setCacheValue(cacheKey, normalized);
  return normalized;
}

async function runPromptGeneration({
  promptType,
  variables = {},
  mistralClient,
  model = 'mistral-small-latest',
  temperature,
  maxTokens,
  maxRetries = 2
}) {
  if (!mistralClient || typeof mistralClient.chat?.complete !== 'function') {
    throw new PromptEngineError(
      'Client Mistral invalide.',
      'PROMPT_MODEL_CLIENT_INVALID',
      500
    );
  }

  const template = await getActivePromptTemplate(promptType);
  const {
    resolvedContextBlock,
    resolvedDataBlock,
    missingVariables,
    unresolvedPlaceholders
  } = buildResolvedPromptBlocks(template, variables);

  const missingAfterCompile = mergeMissingVariableNames([
    ...missingVariables,
    ...unresolvedPlaceholders
  ]);
  if (missingAfterCompile.length > 0) {
    throw new PromptEngineError(
      'Variables manquantes dans le prompt compile.',
      'PROMPT_VARIABLES_MISSING',
      400,
      { missingVariables: missingAfterCompile }
    );
  }

  const userPrompt = [
    resolvedContextBlock,
    resolvedDataBlock,
    normalizeText(template.output_format)
      ? `FORMAT DE SORTIE ATTENDU:\n${normalizeText(template.output_format)}`
      : ''
  ].filter(Boolean).join(PROMPT_SEPARATOR);

  const maxAttempts = Math.max(1, Number(maxRetries) + 1);
  let finalOutput = '';
  let finalValidation = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    const promptForAttempt = attempt === 1
      ? userPrompt
      : buildRetryPrompt({
        baseUserPrompt: userPrompt,
        previousOutput: finalOutput,
        validation: finalValidation,
        attempt: attempt - 1,
        template
      });

    const response = await mistralClient.chat.complete({
      model: normalizeText(model, 'mistral-small-latest'),
      messages: [
        ...(normalizeText(template.system_prompt)
          ? [{
              role: 'system',
              content: String(template.system_prompt || '')
            }]
          : []),
        {
          role: 'user',
          content: promptForAttempt
        }
      ],
      ...(Number.isFinite(Number(temperature)) ? { temperature: Number(temperature) } : {}),
      ...(Number.isFinite(Number(maxTokens)) ? { maxTokens: Number(maxTokens) } : {})
    });

    finalOutput = String(response?.choices?.[0]?.message?.content || '').trim();
    finalValidation = validateOutputAgainstTemplate(template, finalOutput);

    await insertGenerationLog({
      templateId: template.id,
      templateVersion: template.version,
      promptType: template.type,
      attempt,
      validation: finalValidation
    });

    if (finalValidation.isValid) {
      break;
    }
  }

  if (!finalValidation?.isValid) {
    throw new PromptEngineError(
      'La generation IA reste invalide apres retries.',
      'PROMPT_OUTPUT_INVALID',
      422,
      {
        promptType: template.type,
        attempts,
        outputPreview: String(finalOutput || '').slice(0, 1200),
        validation: finalValidation
      }
    );
  }

  return {
    template,
    attempts,
    output: finalOutput,
    validation: finalValidation,
    resolvedPrompt: {
      contextBlock: resolvedContextBlock,
      dataBlock: resolvedDataBlock,
      userPrompt
    }
  };
}

function parseChapterBodyBlocks(rawOutput = '') {
  const source = String(rawOutput || '').replace(/\r\n/g, '\n').trim();
  if (!source) {
    return {
      ouverture: '',
      corps: '',
      coda: ''
    };
  }

  const tagRegex = /\[(OUVERTURE|CORPS|CODA)\]/gi;
  const tags = [];
  let match = tagRegex.exec(source);
  while (match) {
    tags.push({
      label: String(match[1] || '').toUpperCase(),
      index: match.index,
      length: match[0].length
    });
    match = tagRegex.exec(source);
  }

  if (tags.length === 0) {
    return {
      ouverture: '',
      corps: source,
      coda: ''
    };
  }

  const sections = {
    OUVERTURE: '',
    CORPS: '',
    CODA: ''
  };

  tags.forEach((tag, index) => {
    const start = tag.index + tag.length;
    const end = index + 1 < tags.length ? tags[index + 1].index : source.length;
    const content = source.slice(start, end).trim();
    sections[tag.label] = content;
  });

  return {
    ouverture: sections.OUVERTURE || '',
    corps: sections.CORPS || '',
    coda: sections.CODA || ''
  };
}

function ensureTemplatePayload(raw = {}) {
  const type = ensurePromptType(raw.type);
  const systemPrompt = String(raw.system_prompt || '');
  const contextBlock = String(raw.context_block || '');
  const dataBlock = String(raw.data_block || '');
  const outputFormat = String(raw.output_format || '');
  const minWords = Number(raw.min_words || 0);
  const maxWords = Number(raw.max_words || 0);
  const forbiddenPhrases = parseForbiddenPhrases(raw.forbidden_phrases);
  const status = normalizeText(raw.status || 'draft', 'draft').toLowerCase();

  if (!['draft', 'active', 'archived'].includes(status)) {
    throw new PromptEngineError('status invalide (draft|active|archived).', 'PROMPT_STATUS_INVALID', 400);
  }
  if (!normalizeText(raw.label)) {
    throw new PromptEngineError('label requis.', 'PROMPT_LABEL_REQUIRED', 400);
  }
  if (normalizeText(systemPrompt) && hasPromptPlaceholders(systemPrompt)) {
    throw new PromptEngineError(
      'Le system_prompt ne doit jamais contenir de variables {{...}}.',
      'PROMPT_SYSTEM_VARIABLES_FORBIDDEN',
      400
    );
  }
  if (!Number.isFinite(minWords) || minWords < 0) {
    throw new PromptEngineError('min_words invalide.', 'PROMPT_MIN_WORDS_INVALID', 400);
  }
  if (!Number.isFinite(maxWords) || maxWords < 0) {
    throw new PromptEngineError('max_words invalide.', 'PROMPT_MAX_WORDS_INVALID', 400);
  }
  if (maxWords > 0 && minWords > maxWords) {
    throw new PromptEngineError(
      'min_words ne peut pas depasser max_words.',
      'PROMPT_WORD_RANGE_INVALID',
      400
    );
  }

  return {
    type,
    label: normalizeText(raw.label),
    status,
    system_prompt: systemPrompt,
    context_block: contextBlock,
    data_block: dataBlock,
    output_format: outputFormat,
    forbidden_phrases: forbiddenPhrases,
    min_words: minWords,
    max_words: maxWords
  };
}

async function listPromptTemplates({ type = '', status = '' } = {}) {
  let query = supabase
    .from('prompt_templates')
    .select('*')
    .order('type', { ascending: true })
    .order('version', { ascending: false });

  const normalizedType = normalizeText(type).toLowerCase();
  if (normalizedType) {
    query = query.eq('type', ensurePromptType(normalizedType));
  }
  const normalizedStatus = normalizeText(status).toLowerCase();
  if (normalizedStatus) {
    query = query.eq('status', normalizedStatus);
  }

  const { data, error } = await query;
  if (error) {
    throw new PromptEngineError(
      `Erreur lecture templates: ${error.message}`,
      'PROMPT_TEMPLATE_LIST_FAILED',
      500
    );
  }
  return Array.isArray(data) ? data : [];
}

async function createPromptTemplateVersion(rawPayload = {}, createdBy = '') {
  const payload = ensureTemplatePayload(rawPayload);

  const { data: lastVersionRow, error: versionError } = await supabase
    .from('prompt_templates')
    .select('version')
    .eq('type', payload.type)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) {
    throw new PromptEngineError(
      `Erreur lecture version template: ${versionError.message}`,
      'PROMPT_TEMPLATE_VERSION_READ_FAILED',
      500
    );
  }

  const nextVersion = Number(lastVersionRow?.version || 0) + 1;
  const nowIso = new Date().toISOString();

  if (payload.status === 'active') {
    const { error: disableError } = await supabase
      .from('prompt_templates')
      .update({ status: 'archived' })
      .eq('type', payload.type)
      .eq('status', 'active');
    if (disableError) {
      throw new PromptEngineError(
        `Erreur desactivation version active: ${disableError.message}`,
        'PROMPT_TEMPLATE_DISABLE_ACTIVE_FAILED',
        500
      );
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('prompt_templates')
    .insert([
      {
        ...payload,
        version: nextVersion,
        activated_at: payload.status === 'active' ? nowIso : null,
        created_by: normalizeText(createdBy) || null
      }
    ])
    .select('*')
    .single();

  if (insertError) {
    throw new PromptEngineError(
      `Erreur creation template: ${insertError.message}`,
      'PROMPT_TEMPLATE_CREATE_FAILED',
      500
    );
  }

  clearPromptEngineCache();
  return inserted;
}

async function getPromptTemplateById(templateId) {
  const id = normalizeText(templateId);
  if (!id) {
    throw new PromptEngineError('templateId requis.', 'PROMPT_TEMPLATE_ID_REQUIRED', 400);
  }

  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new PromptEngineError(
      `Erreur lecture template: ${error.message}`,
      'PROMPT_TEMPLATE_READ_FAILED',
      500
    );
  }
  if (!data) {
    throw new PromptEngineError('Template introuvable.', 'PROMPT_TEMPLATE_NOT_FOUND', 404);
  }
  return data;
}

async function activatePromptTemplate(templateId) {
  const template = await getPromptTemplateById(templateId);
  const nowIso = new Date().toISOString();

  const { error: deactivateError } = await supabase
    .from('prompt_templates')
    .update({ status: 'archived' })
    .eq('type', template.type)
    .eq('status', 'active')
    .neq('id', template.id);

  if (deactivateError) {
    throw new PromptEngineError(
      `Erreur desactivation template actif: ${deactivateError.message}`,
      'PROMPT_TEMPLATE_DEACTIVATE_FAILED',
      500
    );
  }

  const { data, error } = await supabase
    .from('prompt_templates')
    .update({
      status: 'active',
      activated_at: nowIso
    })
    .eq('id', template.id)
    .select('*')
    .single();

  if (error) {
    throw new PromptEngineError(
      `Erreur activation template: ${error.message}`,
      'PROMPT_TEMPLATE_ACTIVATE_FAILED',
      500
    );
  }

  clearPromptEngineCache();
  return data;
}

async function archivePromptTemplate(templateId) {
  const template = await getPromptTemplateById(templateId);
  const { data, error } = await supabase
    .from('prompt_templates')
    .update({
      status: 'archived'
    })
    .eq('id', template.id)
    .select('*')
    .single();

  if (error) {
    throw new PromptEngineError(
      `Erreur archivage template: ${error.message}`,
      'PROMPT_TEMPLATE_ARCHIVE_FAILED',
      500
    );
  }

  clearPromptEngineCache();
  return data;
}

async function listPromptGenerationLogs({
  templateId = '',
  promptType = '',
  limit = 100
} = {}) {
  let query = supabase
    .from('prompt_generation_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)));

  if (normalizeText(templateId)) {
    query = query.eq('template_id', normalizeText(templateId));
  }

  if (normalizeText(promptType)) {
    query = query.eq('prompt_type', ensurePromptType(promptType));
  }

  const { data, error } = await query;
  if (error) {
    throw new PromptEngineError(
      `Erreur lecture logs prompt: ${error.message}`,
      'PROMPT_LOG_LIST_FAILED',
      500
    );
  }
  return Array.isArray(data) ? data : [];
}

async function testPromptTemplate({
  template: rawTemplate,
  variables = {},
  mistralClient = null,
  runModel = false,
  model = 'mistral-small-latest',
  temperature,
  maxTokens
}) {
  const template = ensureTemplatePayload(rawTemplate);
  const resolved = buildResolvedPromptBlocks(template, variables);
  const missingAfterCompile = mergeMissingVariableNames([
    ...resolved.missingVariables,
    ...resolved.unresolvedPlaceholders
  ]);
  if (missingAfterCompile.length > 0) {
    throw new PromptEngineError(
      'Variables manquantes dans le prompt compile.',
      'PROMPT_VARIABLES_MISSING',
      400,
      { missingVariables: missingAfterCompile }
    );
  }

  const userPrompt = [
    resolved.resolvedContextBlock,
    resolved.resolvedDataBlock,
    normalizeText(template.output_format)
      ? `FORMAT DE SORTIE ATTENDU:\n${normalizeText(template.output_format)}`
      : ''
  ].filter(Boolean).join(PROMPT_SEPARATOR);

  const result = {
    compiledPrompt: [
      '[SYSTEM PROMPT]',
      template.system_prompt,
      '',
      '[USER PROMPT COMPILE]',
      userPrompt
    ].join('\n'),
    resolvedBlocks: {
      context_block: resolved.resolvedContextBlock,
      data_block: resolved.resolvedDataBlock
    },
    validation: null,
    output: ''
  };

  if (!runModel) {
    return result;
  }

  if (!mistralClient || typeof mistralClient.chat?.complete !== 'function') {
    throw new PromptEngineError(
      'Client Mistral invalide.',
      'PROMPT_MODEL_CLIENT_INVALID',
      500
    );
  }

  const response = await mistralClient.chat.complete({
    model: normalizeText(model, 'mistral-small-latest'),
    messages: [
      ...(normalizeText(template.system_prompt)
        ? [{
            role: 'system',
            content: template.system_prompt
          }]
        : []),
      {
        role: 'user',
        content: userPrompt
      }
    ],
    ...(Number.isFinite(Number(temperature)) ? { temperature: Number(temperature) } : {}),
    ...(Number.isFinite(Number(maxTokens)) ? { maxTokens: Number(maxTokens) } : {})
  });

  const output = String(response?.choices?.[0]?.message?.content || '').trim();
  const validation = validateOutputAgainstTemplate(template, output);
  return {
    ...result,
    output,
    validation
  };
}

module.exports = {
  TEMPLATE_TYPES,
  PromptEngineError,
  clearPromptEngineCache,
  ensurePromptType,
  getActivePromptTemplate,
  runPromptGeneration,
  parseChapterBodyBlocks,
  validateOutputAgainstTemplate,
  listPromptTemplates,
  createPromptTemplateVersion,
  activatePromptTemplate,
  archivePromptTemplate,
  listPromptGenerationLogs,
  getPromptTemplateById,
  testPromptTemplate
};
