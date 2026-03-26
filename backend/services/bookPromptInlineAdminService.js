const supabase = require('../config/supabase');
const promptEngine = require('./promptEngine');
const aiService = require('./aiService');

const INLINE_DIRECTIVES_START = '[DIRECTIVES_TESTEUR_INLINE]';
const INLINE_DIRECTIVES_END = '[/DIRECTIVES_TESTEUR_INLINE]';

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || fallback;
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

function cleanText(value, maxLength = 0) {
  const normalized = normalizeText(value);
  if (!normalized || !Number.isFinite(Number(maxLength)) || Number(maxLength) <= 0) {
    return normalized;
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, Number(maxLength) - 3)).trim()}...`
    : normalized;
}

function serializePreviewValue(value, depth = 0) {
  if (value === null || value === undefined) return '';
  if (depth > 2) return '';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 2)
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

function firstNonEmptyText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return '';
}

function buildAdditionalContextFromBookConfig(config = {}, book = {}) {
  return [
    firstNonEmptyText(config.signature_phrase),
    firstNonEmptyText(config.signature_place),
    firstNonEmptyText(config.future_wish),
    firstNonEmptyText(config.signature_passion),
    firstNonEmptyText(config.retirement_project),
    firstNonEmptyText(config.next_destination),
    firstNonEmptyText(config.relationship_duration),
    firstNonEmptyText(config.family_context),
    firstNonEmptyText(config.destination),
    firstNonEmptyText(config.group_description),
    firstNonEmptyText(config.team_description),
    firstNonEmptyText(config.reunion_occasion),
    firstNonEmptyText(config.transmission_wish),
    firstNonEmptyText(config.event_custom_description),
    firstNonEmptyText(book.location),
    firstNonEmptyText(book.year)
  ].filter(Boolean).join(' | ');
}

function buildInlineTemplateLabel(label = '') {
  const baseLabel = normalizeText(label, 'Prompt inline')
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

function buildChapterTitlesDefaultDirectives(variables = {}) {
  return buildVisibleDirectiveText({
    objective: [
      'Genere des titres de chapitres uniquement a partir des donnees reelles disponibles.',
      'Les titres doivent correspondre directement a l evenement et a la personne celebree quand elle est disponible.'
    ],
    required: [
      'Le nombre de titres doit etre exactement egal a {{chapter_count}}.',
      'Les titres doivent rester coherents avec {{event_type}}.',
      'Si {{recipient_name}} existe, utilise ce nom naturellement quand cela a du sens.',
      'Si {{recipient_nickname}} existe, tu peux l utiliser, mais uniquement s il vient des donnees reelles.',
      'Chaque titre doit etre distinct, lisible et assez court.'
    ],
    excluded: [
      'N invente aucun prenom, nom de famille ou personnage absent des donnees.',
      'Aucun commentaire, aucune introduction, aucune explication.',
      'Aucun titre generique qui pourrait convenir a n importe quel evenement.'
    ],
    output: [
      'Retourne uniquement {{chapter_count}} titres.',
      'Un titre par ligne, sans texte avant ni apres.'
    ]
  });
}

function buildIntroductionDefaultDirectives() {
  return buildVisibleDirectiveText({
    objective: [
      'Redige une introduction du livre a partir des donnees reelles disponibles.',
      'Installe une atmosphere et donne envie d entrer dans le livre.'
    ],
    required: [
      'Le texte doit rester coherent avec l evenement, le ton et la personne ou le groupe concernes.',
      'Utilise uniquement les informations presentes dans le contexte.',
      'Le texte doit etre fluide, naturel et accessible.'
    ],
    excluded: [
      'Ne resume pas tout le sommaire chapitre par chapitre.',
      'N invente aucun fait, lieu, nom ou anecdote.',
      'Pas de meta-commentaire sur la generation.'
    ],
    output: [
      'Retourne uniquement le texte de l introduction.',
      'Ecris en 1 a 2 paragraphes maximum, sauf si les directives indiquent autre chose.'
    ]
  });
}

function buildConclusionDefaultDirectives() {
  return buildVisibleDirectiveText({
    objective: [
      'Redige une conclusion du livre a partir des donnees reelles disponibles.',
      'Cloture le livre avec une impression juste, sensible et coherente.'
    ],
    required: [
      'Le texte doit correspondre a l evenement, au ton du livre et a la personne ou au groupe concernes.',
      'Utilise uniquement les informations presentes dans le contexte.',
      'La conclusion doit donner une sensation de fermeture ou d ouverture vers la suite.'
    ],
    excluded: [
      'N invente aucun fait, nom, relation ou projet futur absent des donnees.',
      'Aucun commentaire sur le processus de generation.',
      'Pas de repetition mecanique du titre des chapitres.'
    ],
    output: [
      'Retourne uniquement le texte de la conclusion.',
      'Ecris en 1 a 2 paragraphes maximum, sauf si les directives indiquent autre chose.'
    ]
  });
}

function buildDefaultBookPromptDirectives(promptConfig = {}, variables = {}) {
  if (promptConfig?.key === 'chapter-titles') {
    return buildChapterTitlesDefaultDirectives(variables);
  }

  if (promptConfig?.key === 'introduction') {
    return buildIntroductionDefaultDirectives();
  }

  if (promptConfig?.key === 'epilogue' || promptConfig?.key === 'conclusion') {
    return buildConclusionDefaultDirectives();
  }

  return '';
}

function buildBookInlineContextBlock(promptConfig = {}, variables = {}) {
  const baseLines = [
    'Contexte reel disponible :',
    `- Titre du livre : ${normalizeText(variables.book_title, 'Livre souvenir')}`,
    `- Evenement : ${normalizeText(variables.event_type, 'evenement')}`,
    normalizeText(variables.event_subtype) ? `- Sous-type : ${normalizeText(variables.event_subtype)}` : '',
    normalizeText(variables.narrative_style) ? `- Ton : ${normalizeText(variables.narrative_style)}` : '',
    normalizeText(variables.narrative_person) ? `- Registre narratif : ${normalizeText(variables.narrative_person)}` : '',
    normalizeText(variables.recipient_name) ? `- Destinataire : ${normalizeText(variables.recipient_name)}` : '',
    normalizeText(variables.recipient_nickname) ? `- Surnom : ${normalizeText(variables.recipient_nickname)}` : '',
    normalizeText(variables.character_trait) ? `- Trait marquant : ${normalizeText(variables.character_trait)}` : '',
    normalizeText(variables.signature_anecdote) ? `- Anecdote signature : ${normalizeText(variables.signature_anecdote)}` : '',
    normalizeText(variables.signature_phrase) ? `- Expression signature : ${normalizeText(variables.signature_phrase)}` : '',
    normalizeText(variables.event_location) ? `- Lieu : ${normalizeText(variables.event_location)}` : '',
    normalizeText(variables.event_year) ? `- Annee : ${normalizeText(variables.event_year)}` : '',
    Number(variables.chapter_count || 0) ? `- Nombre de chapitres : ${Number(variables.chapter_count || 0)}` : ''
  ];

  if (promptConfig?.key === 'introduction' || promptConfig?.key === 'epilogue' || promptConfig?.key === 'conclusion') {
    const chapterTitles = Array.isArray(variables.chapter_titles) ? variables.chapter_titles : [];
    if (chapterTitles.length > 0) {
      baseLines.push('- Titres de chapitres disponibles :');
      chapterTitles.forEach((title, index) => {
        baseLines.push(`  ${index + 1}. ${normalizeText(title)}`);
      });
    }
  }

  return baseLines.filter(Boolean).join('\n');
}

function resolveVisibleBookDirectives(template = {}, promptConfig = {}, variables = {}) {
  const existing = extractInlineDirectives(template?.data_block || '', template);
  if (existing) {
    return existing;
  }

  return buildDefaultBookPromptDirectives(promptConfig, variables);
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPromptDirectiveBlock(directives = '') {
  const normalized = normalizeText(directives);
  if (!normalized) return '';
  return [
    INLINE_DIRECTIVES_START,
    'Applique strictement ces directives supplementaires du testeur :',
    normalized,
    INLINE_DIRECTIVES_END
  ].join('\n');
}

function extractInlineDirectives(dataBlock = '', template = null) {
  const source = String(dataBlock || '');
  const startMarker = escapeRegExp(INLINE_DIRECTIVES_START);
  const endMarker = escapeRegExp(INLINE_DIRECTIVES_END);
  const match = source.match(
    new RegExp(`${startMarker}\\s*Applique strictement ces directives supplementaires du testeur :\\s*([\\s\\S]*?)\\s*${endMarker}`)
  );
  if (match?.[1]) {
    return normalizeText(match[1] || '');
  }

  const label = normalizeText(template?.label || '').toLowerCase();
  if (label.endsWith('- inline')) {
    return normalizeText(source);
  }
  return '';
}

function buildChapterTitlesInlineConstraints() {
  return [
    'Contraintes de sortie non negociables :',
    '- Le nombre de titres doit etre obligatoirement egal a {{chapter_count}}.',
    '- Les titres doivent correspondre directement a l evenement {{event_type}} et au contexte disponible.',
    '- N utilise jamais de nom fictif ni de personne absente du contexte reel.',
    '- Si un nom de personne apparait, il doit etre strictement identique au prenom ou surnom disponible dans le contexte.',
    '- Si le destinataire est disponible, fais-le apparaitre naturellement dans les titres quand cela a du sens, sans le remplacer par un autre nom.',
    '- Nom autorise si besoin : {{recipient_name}}.',
    '{{#if recipient_nickname}}- Surnom autorise si besoin : {{recipient_nickname}}.{{/if}}',
    '- Retourne uniquement des titres, sans commentaire, sans introduction, sans explication.',
    '- Chaque titre doit tenir sur une seule ligne et rester concis.'
  ].join('\n');
}

function buildChapterTitlesInlineOutputFormat() {
  return [
    'Retourne uniquement un objet JSON strict au format :',
    '{',
    '  "titles": ["Titre 1", "Titre 2"]',
    '}',
    'Contraintes :',
    '- Le tableau "titles" doit contenir exactement le nombre demande.',
    '- Aucun texte avant ou apres le JSON.'
  ].join('\n');
}

function buildChapterTitlesInlineContextBlock(variables = {}) {
  return [
    'Contexte reel du livre :',
    `- Titre du livre : ${normalizeText(variables.book_title, 'Livre souvenir')}`,
    `- Evenement : ${normalizeText(variables.event_type, 'evenement')}`,
    normalizeText(variables.event_subtype) ? `- Sous-type : ${normalizeText(variables.event_subtype)}` : '',
    `- Destinataire : ${normalizeText(variables.recipient_name, 'la personne celebree')}`,
    normalizeText(variables.recipient_nickname) ? `- Surnom : ${normalizeText(variables.recipient_nickname)}` : '',
    normalizeText(variables.character_trait) ? `- Trait marquant : ${normalizeText(variables.character_trait)}` : '',
    normalizeText(variables.signature_anecdote) ? `- Anecdote signature : ${normalizeText(variables.signature_anecdote)}` : '',
    normalizeText(variables.signature_phrase) ? `- Expression signature : ${normalizeText(variables.signature_phrase)}` : '',
    normalizeText(variables.additional_context) ? `- Contexte additionnel : ${normalizeText(variables.additional_context)}` : '',
    `- Nombre de chapitres attendu : ${Number(variables.chapter_count || 0) || 0}`
  ].filter(Boolean).join('\n');
}

function buildInlineTemplateWithDirectives(template = {}, directives = '', promptConfig = {}) {
  const effectiveDirectives = normalizeText(directives)
    || buildDefaultBookPromptDirectives(promptConfig, promptConfig.variables || {});

  return {
    ...template,
    system_prompt: '',
    context_block: buildBookInlineContextBlock(promptConfig, promptConfig.variables || {}),
    data_block: effectiveDirectives,
    output_format: '',
    min_words: 0,
    max_words: 0
  };
}

function normalizeTitlesList(rawTitles = []) {
  return (Array.isArray(rawTitles) ? rawTitles : [])
    .map((title) => cleanText(title, 120))
    .filter(Boolean);
}

function sanitizeChapterTitle(rawTitle = '') {
  const normalized = normalizeText(rawTitle)
    .replace(/^["'\-\s]+|["'\-\s]+$/g, '')
    .replace(/^(?:chapitre\s*\d+\s*[:\-]|\d+[\.\)\-:]\s*)/i, '')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= 84) return normalized;
  return `${normalized.slice(0, 81).trim()}...`;
}

function parseChapterTitlesOutput(rawOutput = '') {
  const source = String(rawOutput || '').replace(/```json|```/gi, '').trim();
  if (!source) return [];

  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return normalizeTitlesList(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      const candidates = [parsed.chapterTitles, parsed.titles, parsed.chapters, parsed.items];
      for (const candidate of candidates) {
        const titles = normalizeTitlesList(candidate);
        if (titles.length > 0) return titles;
      }
    }
  } catch (_error) {
    // Fallback below.
  }

  const lineRegex = /(?:^|\n)\s*(?:[-*•]?\s*)?(?:chapitre\s*\d+\s*[:\-]|\d+[\.\)\-])\s*(.+)/gi;
  const fromLines = [];
  let match = lineRegex.exec(source);
  while (match) {
    const title = sanitizeChapterTitle(match[1]);
    if (title) fromLines.push(title);
    match = lineRegex.exec(source);
  }
  if (fromLines.length > 0) return fromLines;

  return source
    .split('\n')
    .map((line) => sanitizeChapterTitle(line.replace(/^\s*(?:[-*•]|(?:\d+[\.\)\-:]))\s*/g, '')))
    .filter(Boolean);
}

function validateChapterTitlesResult(parsedTitles = [], expectedCount = 0) {
  const safeTitles = Array.isArray(parsedTitles)
    ? parsedTitles.map((title) => sanitizeChapterTitle(title)).filter(Boolean)
    : [];
  const safeExpectedCount = Math.max(1, Number(expectedCount) || 0);

  if (safeTitles.length !== safeExpectedCount) {
    throw new promptEngine.PromptEngineError(
      `Le modele a retourne ${safeTitles.length} titre(s) au lieu de ${safeExpectedCount}. Le test doit produire exactement ${safeExpectedCount} titres.`,
      'BOOK_PROMPT_ADMIN_TITLE_COUNT_INVALID',
      422,
      {
        parsedTitles: safeTitles,
        expectedCount: safeExpectedCount
      }
    );
  }

  const uniqueTitles = new Set(safeTitles.map((title) => normalizeText(title).toLowerCase()));
  if (uniqueTitles.size !== safeTitles.length) {
    throw new promptEngine.PromptEngineError(
      'Le modele a retourne des titres en double. Chaque titre doit etre distinct.',
      'BOOK_PROMPT_ADMIN_TITLE_DUPLICATES',
      422,
      {
        parsedTitles: safeTitles,
        expectedCount: safeExpectedCount
      }
    );
  }

  return safeTitles;
}

async function getLatestTemplateForTypes(promptTypes = []) {
  const normalizedTypes = promptTypes
    .map((promptType) => normalizeText(promptType).toLowerCase())
    .filter(Boolean);

  for (const promptType of normalizedTypes) {
    const templates = await promptEngine.listPromptTemplates({ type: promptType });
    if (templates.length > 0) {
      return templates[0];
    }
  }

  return null;
}

async function bootstrapSeparatedBookTemplate(promptType) {
  const normalizedType = normalizeText(promptType).toLowerCase();
  if (!['book_introduction', 'book_conclusion'].includes(normalizedType)) {
    return null;
  }

  const sourceTemplate = await getLatestTemplateForTypes(['frame_texts']);
  if (!sourceTemplate) {
    return null;
  }

  const label = normalizedType === 'book_introduction'
    ? 'Introduction - bootstrap'
    : 'Epilogue - bootstrap';

  try {
    return await promptEngine.createPromptTemplateVersion({
      type: normalizedType,
      label,
      status: 'active',
      system_prompt: sourceTemplate.system_prompt || '',
      context_block: sourceTemplate.context_block || '',
      data_block: sourceTemplate.data_block || '',
      output_format: sourceTemplate.output_format || '',
      forbidden_phrases: Array.isArray(sourceTemplate.forbidden_phrases)
        ? sourceTemplate.forbidden_phrases
        : [],
      min_words: Number(sourceTemplate.min_words || 0),
      max_words: Number(sourceTemplate.max_words || 0)
    }, 'book-prompt-inline-bootstrap');
  } catch (error) {
    if (String(error?.message || '').includes('prompt_templates_type_check')) {
      throw new promptEngine.PromptEngineError(
        'La base ne reconnait pas encore les types "book_introduction" / "book_conclusion". Executez backend/sql/book_frame_prompts_refactor.sql dans Supabase, puis rechargez la page.',
        'BOOK_PROMPT_ADMIN_SCHEMA_OUTDATED',
        400
      );
    }
    if (error?.code === 'PROMPT_TEMPLATE_CREATE_FAILED') {
      const createdTemplate = await getLatestTemplateForTypes([normalizedType]);
      if (createdTemplate) {
        return createdTemplate;
      }
    }
    throw error;
  }
}

async function resolveEditablePromptTemplate(promptType, fallbackTypes = []) {
  try {
    return await promptEngine.getActivePromptTemplate(promptType);
  } catch (error) {
    if (error?.code !== 'PROMPT_TEMPLATE_NOT_FOUND') {
      throw error;
    }
  }

  const bootstrappedTemplate = await bootstrapSeparatedBookTemplate(promptType);
  if (bootstrappedTemplate) {
    return bootstrappedTemplate;
  }

  const latestTemplate = await getLatestTemplateForTypes([promptType, ...fallbackTypes]);
  if (latestTemplate) {
    return latestTemplate;
  }

  throw new promptEngine.PromptEngineError(
    `Aucun template disponible pour "${promptType}".`,
    'PROMPT_TEMPLATE_NOT_FOUND',
    404,
    { promptType }
  );
}

async function loadOwnedBookPromptContext(bookId, ownerId = '') {
  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .maybeSingle();

  if (bookError) {
    throw new promptEngine.PromptEngineError(
      `Erreur lecture livre: ${bookError.message}`,
      'BOOK_PROMPT_ADMIN_BOOK_READ_FAILED',
      500
    );
  }

  if (!book?.id) {
    throw new promptEngine.PromptEngineError(
      'Livre introuvable.',
      'BOOK_PROMPT_ADMIN_NOT_FOUND',
      404
    );
  }

  if (ownerId && book.owner_id !== ownerId) {
    throw new promptEngine.PromptEngineError(
      'Acces refuse a ce livre.',
      'BOOK_PROMPT_ADMIN_FORBIDDEN',
      403
    );
  }

  const [{ data: chapters, error: chaptersError }, { data: config, error: configError }] = await Promise.all([
    supabase
      .from('chapters')
      .select('*')
      .eq('book_id', bookId)
      .order('order_index', { ascending: true }),
    supabase
      .from('book_configs')
      .select('*')
      .eq('book_id', bookId)
      .maybeSingle()
  ]);

  if (chaptersError) {
    throw new promptEngine.PromptEngineError(
      `Erreur lecture chapitres: ${chaptersError.message}`,
      'BOOK_PROMPT_ADMIN_CHAPTERS_READ_FAILED',
      500
    );
  }

  if (configError) {
    throw new promptEngine.PromptEngineError(
      `Erreur lecture configuration livre: ${configError.message}`,
      'BOOK_PROMPT_ADMIN_CONFIG_READ_FAILED',
      500
    );
  }

  return {
    book,
    config: config || {},
    chapters: Array.isArray(chapters) ? chapters : []
  };
}

function buildBookPromptCommonVariables({ book = {}, config = {}, chapters = [] }) {
  const chapterTitles = chapters
    .map((chapter, index) => cleanText(index === 0 ? 'Introduction' : chapter?.title, 160))
    .filter(Boolean);
  const chapterItems = chapterTitles.map((title, index) => ({
    title,
    index: index + 1
  }));
  const eventDate = normalizeText(config?.event_date || book?.event_date);
  const eventYear = eventDate ? String(new Date(eventDate).getFullYear()) : String(new Date().getFullYear());
  const eventType = firstNonEmptyText(config?.event_type, book?.event_type, 'evenement');
  const eventSubtype = firstNonEmptyText(config?.event_subtype);
  const narrativeStyle = firstNonEmptyText(config?.narrative_style, book?.style_narratif, 'intime');
  const narrativePerson = firstNonEmptyText(config?.narrative_person, 'third_person');
  const recipientName = firstNonEmptyText(config?.recipient_name, book?.recipient_name, 'la personne celebree');
  const recipientNickname = firstNonEmptyText(config?.recipient_nickname);
  const recipientAge = firstNonEmptyText(config?.recipient_age, book?.recipient_age);
  const recipientGender = firstNonEmptyText(config?.recipient_gender, book?.recipient_gender);
  const bookTitle = firstNonEmptyText(book?.title, 'Livre souvenir');
  const additionalContext = firstNonEmptyText(
    buildAdditionalContextFromBookConfig(config, book)
  );

  return {
    book_title: bookTitle,
    event_type: eventType,
    event_subtype: eventSubtype,
    event_date: eventDate,
    event_year: eventYear,
    event_location: firstNonEmptyText(config?.event_location, book?.location),
    narrative_style: narrativeStyle,
    narrative_person: narrativePerson,
    recipient_name: recipientName,
    recipient_nickname: recipientNickname,
    recipient_age: recipientAge,
    recipient_gender: recipientGender,
    character_trait: firstNonEmptyText(config?.character_trait),
    signature_anecdote: firstNonEmptyText(config?.signature_anecdote),
    signature_phrase: firstNonEmptyText(config?.signature_phrase),
    future_wish: firstNonEmptyText(config?.future_wish),
    chapter_count: chapterTitles.length,
    chapter_titles: chapterTitles,
    chapter_titles_text: chapterTitles.join('\n'),
    chapters: chapterItems,
    additional_context: additionalContext,

    bookTitle: bookTitle,
    eventType: eventType,
    eventSubtype: eventSubtype,
    eventDate: eventDate,
    eventYear: eventYear,
    eventLocation: firstNonEmptyText(config?.event_location, book?.location),
    narrativeStyle: narrativeStyle,
    narrativePerson: narrativePerson,
    recipientName: recipientName,
    recipientNickname: recipientNickname,
    recipientAge: recipientAge,
    recipientGender: recipientGender,
    characterTrait: firstNonEmptyText(config?.character_trait),
    signatureAnecdote: firstNonEmptyText(config?.signature_anecdote),
    signaturePhrase: firstNonEmptyText(config?.signature_phrase),
    futureWish: firstNonEmptyText(config?.future_wish),
    chapterCount: chapterTitles.length,
    chapterTitles: chapterTitles,
    chapterTitlesText: chapterTitles.join('\n'),
    additionalContext: additionalContext
  };
}

function buildChapterTitlesPromptVariables(context = {}) {
  const common = buildBookPromptCommonVariables(context);
  return {
    ...common,
    count: Number(common.chapter_count || 0) || 6
  };
}

function buildFramePromptVariables(context = {}, outputType = 'introduction') {
  const common = buildBookPromptCommonVariables(context);
  const chapterSummaries = (Array.isArray(context?.chapters) ? context.chapters : [])
    .map((chapter, index) => {
      const title = cleanText(index === 0 ? 'Introduction' : chapter?.title, 160);
      const description = cleanText(chapter?.description, 320);
      return [title, description].filter(Boolean).join(' : ');
    })
    .filter(Boolean);

  const chapterTitle = outputType === 'conclusion' ? 'Conclusion' : 'Introduction';
  const targetLength = outputType === 'conclusion' ? '120 a 180 mots' : '140 a 200 mots';

  return {
    ...common,
    output_type: outputType,
    chapter_title: chapterTitle,
    chapter_summary: chapterSummaries.join('\n'),
    narrative_context: [
      common.additional_context,
      chapterSummaries.join(' | ')
    ].filter(Boolean).join(' | '),
    target_length: targetLength,

    outputType: outputType,
    chapterTitle: chapterTitle,
    chapterSummary: chapterSummaries.join('\n'),
    narrativeContext: [
      common.additionalContext,
      chapterSummaries.join(' | ')
    ].filter(Boolean).join(' | '),
    targetLength: targetLength
  };
}

function buildPromptConfigForKey(promptKey = '') {
  const normalizedKey = normalizeText(promptKey).toLowerCase();
  if (normalizedKey === 'chapter-titles') {
    return {
      key: normalizedKey,
      promptType: 'chapter_titles',
      fallbackTypes: [],
      resultKind: 'titles'
    };
  }

  if (normalizedKey === 'introduction') {
    return {
      key: normalizedKey,
      promptType: 'book_introduction',
      fallbackTypes: [],
      resultKind: 'text',
      outputType: 'introduction'
    };
  }

  if (normalizedKey === 'epilogue' || normalizedKey === 'conclusion') {
    return {
      key: 'epilogue',
      promptType: 'book_conclusion',
      fallbackTypes: [],
      resultKind: 'text',
      outputType: 'conclusion'
    };
  }

  throw new promptEngine.PromptEngineError(
    `Cle de prompt inline inconnue: ${promptKey}`,
    'BOOK_PROMPT_ADMIN_KEY_INVALID',
    400
  );
}

function buildVariablesForPromptConfig(context = {}, promptConfig = {}) {
  if (promptConfig.key === 'chapter-titles') {
    return buildChapterTitlesPromptVariables(context);
  }

  if (promptConfig.key === 'introduction' || promptConfig.key === 'epilogue' || promptConfig.key === 'conclusion') {
    return buildFramePromptVariables(context, promptConfig.outputType);
  }

  return {};
}

function buildContextSummary(context = {}, promptConfig = {}) {
  const variables = buildVariablesForPromptConfig(context, promptConfig);
  return {
    bookTitle: variables.book_title,
    tone: variables.narrative_style || variables.book_tone,
    eventType: variables.event_type,
    promptKey: promptConfig.key,
    chapterCount: variables.chapter_count
  };
}

async function getBookPromptAdminContext({
  bookId,
  ownerId,
  promptKey
}) {
  const promptConfig = buildPromptConfigForKey(promptKey);
  const context = await loadOwnedBookPromptContext(bookId, ownerId);
  const variables = buildVariablesForPromptConfig(context, promptConfig);
  const activeTemplate = await resolveEditablePromptTemplate(
    promptConfig.promptType,
    promptConfig.fallbackTypes
  );
  const directives = resolveVisibleBookDirectives(activeTemplate, promptConfig, variables);
  const inlinePreviewTemplate = buildInlineTemplateWithDirectives(
    activeTemplate,
    directives,
    {
      ...promptConfig,
      variables
    }
  );
  const templateVariables = extractPromptVariableMeta(inlinePreviewTemplate, variables);

  return {
    ...context,
    promptConfig,
    variables,
    availableVariableMeta: buildAvailableVariableMeta(variables),
    activeTemplate,
    templateVariables,
    directives,
    contextSummary: buildContextSummary(context, promptConfig)
  };
}

async function testInlineBookPrompt({
  bookId,
  ownerId,
  promptKey,
  directives = '',
  model = 'mistral-small-latest'
}) {
  const context = await getBookPromptAdminContext({
    bookId,
    ownerId,
    promptKey
  });
  const template = buildInlineTemplateWithDirectives(
    context.activeTemplate,
    directives,
    {
      ...context.promptConfig,
      variables: context.variables
    }
  );
  const templateVariables = extractPromptVariableMeta(template, context.variables);
  const result = await promptEngine.testPromptTemplate({
    template,
    variables: context.variables,
    mistralClient: aiService.mistral,
    runModel: true,
    model
  });

  const parsedTitles = context.promptConfig.resultKind === 'titles'
    ? validateChapterTitlesResult(
        parseChapterTitlesOutput(result.output),
        context.variables.chapter_count
      )
    : [];

  return {
    ...context,
    template,
    templateVariables,
    result: {
      ...result,
      parsedTitles
    }
  };
}

async function publishInlineBookPrompt({
  bookId,
  ownerId,
  promptKey,
  directives = '',
  createdBy = ''
}) {
  const context = await getBookPromptAdminContext({
    bookId,
    ownerId,
    promptKey
  });
  const inlineTemplate = buildInlineTemplateWithDirectives(
    context.activeTemplate,
    directives,
    {
      ...context.promptConfig,
      variables: context.variables
    }
  );

  const nextTemplatePayload = {
    type: context.promptConfig.promptType,
    label: buildInlineTemplateLabel(context.activeTemplate?.label),
    status: 'draft',
    system_prompt: inlineTemplate.system_prompt || '',
    context_block: inlineTemplate.context_block || '',
    data_block: inlineTemplate.data_block,
    output_format: inlineTemplate.output_format,
    forbidden_phrases: Array.isArray(context.activeTemplate?.forbidden_phrases)
      ? context.activeTemplate.forbidden_phrases
      : [],
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
    directives: extractInlineDirectives(activatedTemplate?.data_block || '', activatedTemplate)
  };
}

module.exports = {
  buildChapterTitlesPromptVariables,
  buildFramePromptVariables,
  getBookPromptAdminContext,
  testInlineBookPrompt,
  publishInlineBookPrompt
};
