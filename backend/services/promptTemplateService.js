const supabase = require('../config/supabase');

const PROMPT_KEYS = {
  CHAPTER_GENERATION: 'chapter_generation',
  QUESTION_GENERATION: 'question_generation'
};

const TEMPLATE_CACHE_TTL_MS = Number(process.env.AI_PROMPT_CACHE_TTL_MS || 30000);
const templateCache = new Map();

const DEFAULT_PROMPTS = {
  [PROMPT_KEYS.CHAPTER_GENERATION]: {
    systemPrompt:
      'Tu es un architecte de livres souvenirs de prestige. Tu produis des propositions claires, personnalisées et élégantes.',
    userPromptTemplate: [
      'Génère {{count}} titres de chapitres pour un livre souvenir personnalisé.',
      '',
      'Contexte :',
      "- Type d'événement : {{eventType}}",
      '- Style narratif : {{style}}',
      '- Titre du livre : {{bookTitle}}',
      '- Personne célébrée : {{recipientName}}',
      '- Âge : {{recipientAge}} ans',
      '- Sexe : {{recipientGender}}',
      '- Surnom : {{recipientNickname}}',
      '- Trait marquant : {{recipientTrait}}',
      '- Anecdote phare : {{recipientAnecdote}}',
      '- Infos complémentaires : {{additionalContext}}',
      '',
      'Règles :',
      '- Uniquement des titres (aucune description).',
      '- Titres courts, raffinés et intrigants.',
      '- Les titres doivent refléter les informations personnelles fournies.',
      '',
      'Réponds UNIQUEMENT avec un tableau JSON de {{count}} chaînes de caractères.',
      'Format exact : ["Titre 1", "Titre 2", "Titre 3", ...]'
    ].join('\n'),
    temperature: 0.8,
    maxTokens: 900
  },
  [PROMPT_KEYS.QUESTION_GENERATION]: {
    systemPrompt:
      'Tu es un assistant spécialisé dans la création de questions pour des livres souvenirs collaboratifs.',
    userPromptTemplate: [
      'Tu dois générer 4 questions ouvertes pour un chapitre de livre souvenir.',
      '',
      'Contexte :',
      '- Titre du livre : {{bookTitle}}',
      '- Type d événement : {{eventType}}',
      '- Titre du chapitre : {{chapterTitle}}',
      '- Style narratif : {{style}}',
      '- Personne célébrée : {{recipientName}}',
      '- Âge : {{recipientAge}} ans {{ageContext}}',
      '- Sexe : {{recipientGender}}',
      '- Pronom cible : {{pronoun}} / {{subjectPronoun}} / {{possessive}}',
      '- Indication de style : {{styleInstruction}}',
      '',
      'Règles :',
      '1. Chaque question doit mentionner {{recipientName}} ou un pronom adapté.',
      '2. Les questions doivent être en lien direct avec {{chapterTitle}}.',
      '3. Ton adapté au style {{style}}.',
      '4. Questions chaleureuses, spécifiques, non génériques.',
      '',
      'Réponds UNIQUEMENT avec un tableau JSON de 4 chaînes de caractères.',
      'Format exact : ["Question 1", "Question 2", "Question 3", "Question 4"]'
    ].join('\n'),
    temperature: 0.7,
    maxTokens: 500
  }
};

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeEventType(eventType) {
  return normalizeText(eventType, 'generique').toLowerCase();
}

function buildCacheKey({ promptKey, eventType, locale }) {
  return `${promptKey}::${normalizeEventType(eventType)}::${normalizeText(locale, 'fr')}`;
}

function getCacheValue(cacheKey) {
  const cached = templateCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    templateCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCacheValue(cacheKey, value) {
  templateCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS
  });
}

function clearPromptCache() {
  templateCache.clear();
}

function compileTemplate(template, variables = {}) {
  const source = normalizeText(template);
  return source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, variableName) => {
    const rawValue = variables[variableName];
    if (rawValue === null || rawValue === undefined) return '';
    if (Array.isArray(rawValue)) return rawValue.join(', ');
    if (typeof rawValue === 'object') return JSON.stringify(rawValue);
    return String(rawValue);
  });
}

async function getTemplateRecord({ promptKey, eventType, locale }) {
  const normalizedEventType = normalizeEventType(eventType);
  const normalizedLocale = normalizeText(locale, 'fr');

  const { data: templates, error } = await supabase
    .from('ai_prompt_templates')
    .select('id, prompt_key, event_type, locale, active_version')
    .eq('prompt_key', promptKey)
    .eq('locale', normalizedLocale)
    .in('event_type', [normalizedEventType, '*']);

  if (error) {
    throw error;
  }

  if (!Array.isArray(templates) || templates.length === 0) {
    return null;
  }

  const exact = templates.find((row) => row.event_type === normalizedEventType);
  return exact || templates.find((row) => row.event_type === '*') || null;
}

async function getActivePromptConfig({ promptKey, eventType = 'generique', locale = 'fr' }) {
  const cacheKey = buildCacheKey({ promptKey, eventType, locale });
  const cached = getCacheValue(cacheKey);
  if (cached) {
    return cached;
  }

  const defaultPrompt = DEFAULT_PROMPTS[promptKey];
  if (!defaultPrompt) {
    throw new Error(`promptKey inconnu: ${promptKey}`);
  }

  try {
    const templateRecord = await getTemplateRecord({ promptKey, eventType, locale });
    if (!templateRecord) {
      const fallback = {
        source: 'default',
        promptKey,
        eventType: normalizeEventType(eventType),
        locale: normalizeText(locale, 'fr'),
        version: null,
        ...defaultPrompt
      };
      setCacheValue(cacheKey, fallback);
      return fallback;
    }

    const { data: versionRecord, error } = await supabase
      .from('ai_prompt_versions')
      .select('id, version, system_prompt, user_prompt_template, temperature, max_tokens')
      .eq('template_id', templateRecord.id)
      .eq('version', templateRecord.active_version)
      .single();

    if (error || !versionRecord) {
      const fallback = {
        source: 'default',
        promptKey,
        eventType: normalizeEventType(eventType),
        locale: normalizeText(locale, 'fr'),
        version: null,
        ...defaultPrompt
      };
      setCacheValue(cacheKey, fallback);
      return fallback;
    }

    const promptConfig = {
      source: 'database',
      promptKey,
      eventType: templateRecord.event_type,
      locale: templateRecord.locale,
      version: versionRecord.version,
      templateId: templateRecord.id,
      versionId: versionRecord.id,
      systemPrompt: normalizeText(versionRecord.system_prompt, defaultPrompt.systemPrompt),
      userPromptTemplate: normalizeText(versionRecord.user_prompt_template, defaultPrompt.userPromptTemplate),
      temperature: Number.isFinite(Number(versionRecord.temperature))
        ? Number(versionRecord.temperature)
        : defaultPrompt.temperature,
      maxTokens: Number.isFinite(Number(versionRecord.max_tokens))
        ? Number(versionRecord.max_tokens)
        : defaultPrompt.maxTokens
    };

    setCacheValue(cacheKey, promptConfig);
    return promptConfig;
  } catch (error) {
    console.error('Erreur chargement prompt template:', error.message);
    const fallback = {
      source: 'default',
      promptKey,
      eventType: normalizeEventType(eventType),
      locale: normalizeText(locale, 'fr'),
      version: null,
      ...defaultPrompt
    };
    setCacheValue(cacheKey, fallback);
    return fallback;
  }
}

async function buildPrompt({ promptKey, eventType = 'generique', locale = 'fr', variables = {} }) {
  const config = await getActivePromptConfig({ promptKey, eventType, locale });
  return {
    ...config,
    userPrompt: compileTemplate(config.userPromptTemplate, variables)
  };
}

async function listPromptVersions({ promptKey, eventType = '*', locale = 'fr' }) {
  const normalizedEventType = normalizeText(eventType, '*').toLowerCase();
  const normalizedLocale = normalizeText(locale, 'fr');

  const { data: template, error: templateError } = await supabase
    .from('ai_prompt_templates')
    .select('id, prompt_key, event_type, locale, active_version')
    .eq('prompt_key', promptKey)
    .eq('event_type', normalizedEventType)
    .eq('locale', normalizedLocale)
    .maybeSingle();

  if (templateError) throw templateError;
  if (!template) return null;

  const { data: versions, error: versionsError } = await supabase
    .from('ai_prompt_versions')
    .select('id, version, temperature, max_tokens, status, created_by, created_at')
    .eq('template_id', template.id)
    .order('version', { ascending: false });

  if (versionsError) throw versionsError;

  return {
    ...template,
    versions: versions || []
  };
}

async function upsertPromptVersion({
  promptKey,
  eventType = '*',
  locale = 'fr',
  systemPrompt,
  userPromptTemplate,
  temperature,
  maxTokens,
  status = 'published',
  publish = true,
  createdBy = ''
}) {
  const normalizedPromptKey = normalizeText(promptKey);
  const normalizedEventType = normalizeText(eventType, '*').toLowerCase();
  const normalizedLocale = normalizeText(locale, 'fr');
  const normalizedSystemPrompt = normalizeText(systemPrompt);
  const normalizedUserPromptTemplate = normalizeText(userPromptTemplate);
  const normalizedStatus = normalizeText(status, 'published');
  const normalizedCreatedBy = normalizeText(createdBy);

  if (!DEFAULT_PROMPTS[normalizedPromptKey]) {
    throw new Error(`promptKey inconnu: ${normalizedPromptKey}`);
  }
  if (!normalizedSystemPrompt || !normalizedUserPromptTemplate) {
    throw new Error('systemPrompt et userPromptTemplate sont requis');
  }

  const { data: existingTemplate, error: existingTemplateError } = await supabase
    .from('ai_prompt_templates')
    .select('id, active_version')
    .eq('prompt_key', normalizedPromptKey)
    .eq('event_type', normalizedEventType)
    .eq('locale', normalizedLocale)
    .maybeSingle();

  if (existingTemplateError) throw existingTemplateError;

  let templateId = existingTemplate?.id || null;
  if (!templateId) {
    const { data: insertedTemplate, error: insertTemplateError } = await supabase
      .from('ai_prompt_templates')
      .insert([
        {
          prompt_key: normalizedPromptKey,
          event_type: normalizedEventType,
          locale: normalizedLocale,
          active_version: 0
        }
      ])
      .select('id, active_version')
      .single();

    if (insertTemplateError) throw insertTemplateError;
    templateId = insertedTemplate.id;
  }

  const { data: lastVersionRow, error: lastVersionError } = await supabase
    .from('ai_prompt_versions')
    .select('version')
    .eq('template_id', templateId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastVersionError) throw lastVersionError;

  const nextVersion = Number(lastVersionRow?.version || 0) + 1;

  const { data: insertedVersion, error: insertVersionError } = await supabase
    .from('ai_prompt_versions')
    .insert([
      {
        template_id: templateId,
        version: nextVersion,
        system_prompt: normalizedSystemPrompt,
        user_prompt_template: normalizedUserPromptTemplate,
        temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : null,
        max_tokens: Number.isFinite(Number(maxTokens)) ? Number(maxTokens) : null,
        status: normalizedStatus,
        created_by: normalizedCreatedBy || null
      }
    ])
    .select('id, version, status, temperature, max_tokens, created_at')
    .single();

  if (insertVersionError) throw insertVersionError;

  if (publish) {
    const { error: publishError } = await supabase
      .from('ai_prompt_templates')
      .update({
        active_version: nextVersion,
        updated_at: new Date().toISOString()
      })
      .eq('id', templateId);

    if (publishError) throw publishError;
  }

  clearPromptCache();

  return {
    templateId,
    promptKey: normalizedPromptKey,
    eventType: normalizedEventType,
    locale: normalizedLocale,
    activeVersion: publish ? nextVersion : existingTemplate?.active_version || 0,
    insertedVersion
  };
}

module.exports = {
  PROMPT_KEYS,
  DEFAULT_PROMPTS,
  compileTemplate,
  buildPrompt,
  getActivePromptConfig,
  listPromptVersions,
  upsertPromptVersion,
  clearPromptCache
};
