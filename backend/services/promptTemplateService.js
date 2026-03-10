const supabase = require('../config/supabase');

const PROMPT_KEYS = {
  CHAPTER_GENERATION: 'chapter_generation',
  QUESTION_GENERATION: 'question_generation',
  CONTENT_GENERATION: 'content_generation'
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
  },
  [PROMPT_KEYS.CONTENT_GENERATION]: {
    systemPrompt:
      'Tu es un biographe haut de gamme. Tu rediges un texte elegant, coherent et vivant, adapte au contexte fourni.',
    userPromptTemplate: [
      'Tu dois produire le contenu "{{outputType}}" pour un livre souvenir.',
      '',
      'Contexte :',
      '- Type d evenement : {{eventType}}',
      '- Style narratif : {{style}}',
      '- Titre du livre : {{bookTitle}}',
      '- Titre du chapitre : {{chapterTitle}}',
      '- Personne celebree : {{recipientName}}',
      '- Age : {{recipientAge}} ans',
      '- Genre : {{recipientGender}}',
      '- Resume de chapitre precedent : {{chapterSummary}}',
      '- Contexte narratif additionnel : {{narrativeContext}}',
      '- Longueur cible : {{targetLength}} caracteres',
      '',
      'Regles :',
      '- Respecter le style {{style}}.',
      '- Si outputType = "introduction", preparer l entree du livre.',
      '- Si outputType = "chapter_content", produire un contenu narratif riche et concret.',
      '- Si outputType = "conclusion", cloturer avec emotion et gratitude.',
      '- Reponse en francais uniquement.',
      '',
      'Format attendu :',
      '- Retourner uniquement le texte final, sans markdown, sans JSON, sans balise HTML.'
    ].join('\n'),
    temperature: 0.75,
    maxTokens: 1400
  }
};

DEFAULT_PROMPTS[PROMPT_KEYS.QUESTION_GENERATION].userPromptTemplate = [
  'Tu dois generer 4 questions ouvertes pour un chapitre de livre souvenir.',
  '',
  'Contexte :',
  '- Titre du livre : {{bookTitle}}',
  '- Type d evenement : {{eventType}}',
  '- Titre du chapitre : {{chapterTitle}}',
  '- Style narratif : {{style}}',
  '- Personne celebree : {{recipientName}}',
  '- Age : {{recipientAge}} ans {{ageContext}}',
  '- Genre : {{recipientGender}}',
  '- Pronom cible : {{pronoun}} / {{subjectPronoun}} / {{possessive}}',
  '- Indication de style : {{styleInstruction}}',
  '',
  'Regles :',
  '1. Les questions sont adressees a l organisateur et aux contributeurs, pas a {{recipientName}}.',
  '2. Ne jamais commencer une question par "{{recipientName}},".',
  '3. Parler de {{recipientName}} a la 3e personne.',
  '4. Les questions doivent etre en lien direct avec {{chapterTitle}}.',
  '5. Ton adapte au style {{style}}.',
  '6. Questions chaleureuses, specifiques, non generiques.',
  '',
  'Reponds UNIQUEMENT avec un tableau JSON de 4 chaines de caracteres.',
  'Format exact : ["Question 1", "Question 2", "Question 3", "Question 4"]'
].join('\n');

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
  const resolveVariableValue = (variableName) => {
    const rawValue = variables[variableName];
    if (rawValue === null || rawValue === undefined) return '';
    if (Array.isArray(rawValue)) return rawValue.join(', ');
    if (typeof rawValue === 'object') return JSON.stringify(rawValue);
    return String(rawValue);
  };

  const withMustache = source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, variableName) => (
    resolveVariableValue(variableName)
  ));

  return withMustache.replace(/\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g, (fullMatch, variableName) => {
    // Keep non-variable bracketed text untouched to avoid accidental removals.
    if (!Object.prototype.hasOwnProperty.call(variables || {}, variableName)) {
      return fullMatch;
    }
    return resolveVariableValue(variableName);
  });
}

function applyPromptGuardrails({ promptKey, userPrompt = '', variables = {} }) {
  const source = normalizeText(userPrompt);
  if (!source) return source;

  if (promptKey !== PROMPT_KEYS.QUESTION_GENERATION) {
    return source;
  }

  const recipientName = normalizeText(variables?.recipientName, 'la personne celebree');
  const chapterTitle = normalizeText(variables?.chapterTitle, 'le chapitre en cours');
  const recipientGender = normalizeText(variables?.recipientGender, 'non specifie').toLowerCase();
  const subjectPronoun = normalizeText(variables?.subjectPronoun, recipientGender === 'homme' ? 'il' : 'elle');
  const possessive = normalizeText(variables?.possessive, recipientGender === 'homme' ? 'son' : 'sa');
  const grammaticalGuardrail = recipientGender === 'homme'
    ? [
        '- Accord grammatical obligatoire au masculin.',
        '- Interdiction des formes feminines pour la personne celebree: "elle", "connue", "genereuse", "presente", etc.',
        '- Utilise des formulations masculines coherentes: "il", "connu", "genereux", "present".'
      ]
    : recipientGender === 'femme'
      ? [
          '- Accord grammatical obligatoire au feminin.',
          '- Interdiction des formes masculines pour la personne celebree: "il", "connu", "genereux", "present", etc.',
          '- Utilise des formulations feminines coherentes: "elle", "connue", "genereuse", "presente".'
        ]
      : [
          '- Accord grammatical coherent avec les pronoms fournis.'
        ];
  const constrainedValues = [
    ['eventType', normalizeText(variables?.eventType, 'generique')],
    ['style', normalizeText(variables?.style, 'intime')],
    ['bookTitle', normalizeText(variables?.bookTitle, 'Livre souvenir')],
    ['recipientName', recipientName],
    ['recipientAge', normalizeText(variables?.recipientAge, 'non specifie')],
    ['recipientGender', normalizeText(variables?.recipientGender, 'non specifie')],
    ['recipientNickname', normalizeText(variables?.recipientNickname, '')],
    ['recipientTrait', normalizeText(variables?.recipientTrait, '')],
    ['recipientAnecdote', normalizeText(variables?.recipientAnecdote, '')],
    ['additionalContext', normalizeText(variables?.additionalContext, '')],
    ['chapterTitle', chapterTitle],
    ['subjectPronoun', subjectPronoun],
    ['possessive', possessive]
  ];
  const valueLines = constrainedValues
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `- ${key}: "${value}"`);
  const guardrailLines = [
    '',
    'Contrainte critique de coherence:',
    `- Le prenom de la personne celebree a utiliser est uniquement "${recipientName}".`,
    '- Si un autre prenom apparait dans les instructions, ignore-le completement.',
    '- Adresse toujours les questions au contributeur (tu), jamais a la personne celebree.',
    `- Reste strictement centre sur le chapitre "${chapterTitle}".`,
    '- Interdiction absolue de sortir des placeholders: pas de [recipientName], [chapterTitle], {{...}}.',
    '- Utilise uniquement les valeurs concretes ci-dessous.',
    ...grammaticalGuardrail,
    '',
    'Valeurs concretes a utiliser:',
    ...valueLines
  ];

  return `${source}\n${guardrailLines.join('\n')}`;
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
  const compiledUserPrompt = compileTemplate(config.userPromptTemplate, variables);
  return {
    ...config,
    userPrompt: applyPromptGuardrails({
      promptKey,
      userPrompt: compiledUserPrompt,
      variables
    })
  };
}

async function getScopedTemplateRecord({
  promptKey,
  eventType = '*',
  locale = 'fr'
}) {
  const normalizedPromptKey = normalizeText(promptKey);
  const normalizedEventType = normalizeText(eventType, '*').toLowerCase();
  const normalizedLocale = normalizeText(locale, 'fr');

  const { data: template, error: templateError } = await supabase
    .from('ai_prompt_templates')
    .select('id, prompt_key, event_type, locale, active_version')
    .eq('prompt_key', normalizedPromptKey)
    .eq('event_type', normalizedEventType)
    .eq('locale', normalizedLocale)
    .maybeSingle();

  if (templateError) throw templateError;
  return {
    template,
    normalizedPromptKey,
    normalizedEventType,
    normalizedLocale
  };
}

async function listPromptVersions({ promptKey, eventType = '*', locale = 'fr' }) {
  const { template } = await getScopedTemplateRecord({
    promptKey,
    eventType,
    locale
  });
  if (!template) return null;

  const { data: versions, error: versionsError } = await supabase
    .from('ai_prompt_versions')
    .select('id, version, note, temperature, max_tokens, status, created_by, created_at')
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
  note = '',
  status = 'published',
  publish = true,
  createdBy = ''
}) {
  const normalizedPromptKey = normalizeText(promptKey);
  const normalizedEventType = normalizeText(eventType, '*').toLowerCase();
  const normalizedLocale = normalizeText(locale, 'fr');
  const normalizedSystemPrompt = normalizeText(systemPrompt);
  const normalizedUserPromptTemplate = normalizeText(userPromptTemplate);
  const normalizedNote = normalizeText(note);
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
        note: normalizedNote || null,
        status: normalizedStatus,
        created_by: normalizedCreatedBy || null
      }
    ])
    .select('id, version, note, status, temperature, max_tokens, created_at')
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

async function updatePromptVersionNote({
  promptKey,
  eventType = '*',
  locale = 'fr',
  version,
  note = ''
}) {
  const normalizedVersion = Number(version);
  if (!Number.isInteger(normalizedVersion) || normalizedVersion <= 0) {
    throw new Error('Version invalide.');
  }

  const { template } = await getScopedTemplateRecord({
    promptKey,
    eventType,
    locale
  });

  if (!template) {
    throw new Error('Template introuvable pour ce scope.');
  }

  const normalizedNote = normalizeText(note);

  const { data: updatedVersion, error: updateError } = await supabase
    .from('ai_prompt_versions')
    .update({
      note: normalizedNote || null
    })
    .eq('template_id', template.id)
    .eq('version', normalizedVersion)
    .select('id, version, note, status, created_by, created_at')
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updatedVersion) {
    throw new Error(`Version ${normalizedVersion} introuvable.`);
  }

  return {
    templateId: template.id,
    activeVersion: template.active_version,
    updatedVersion
  };
}

async function activatePromptVersion({
  promptKey,
  eventType = '*',
  locale = 'fr',
  version
}) {
  const normalizedVersion = Number(version);
  if (!Number.isInteger(normalizedVersion) || normalizedVersion <= 0) {
    throw new Error('Version invalide.');
  }

  const { template } = await getScopedTemplateRecord({
    promptKey,
    eventType,
    locale
  });

  if (!template) {
    throw new Error('Template introuvable pour ce scope.');
  }

  const { data: existingVersion, error: existingVersionError } = await supabase
    .from('ai_prompt_versions')
    .select('id, version, status')
    .eq('template_id', template.id)
    .eq('version', normalizedVersion)
    .maybeSingle();

  if (existingVersionError) throw existingVersionError;
  if (!existingVersion) {
    throw new Error(`Version ${normalizedVersion} introuvable.`);
  }

  const { error: templateUpdateError } = await supabase
    .from('ai_prompt_templates')
    .update({
      active_version: normalizedVersion,
      updated_at: new Date().toISOString()
    })
    .eq('id', template.id);

  if (templateUpdateError) throw templateUpdateError;

  if (existingVersion.status !== 'published') {
    const { error: versionUpdateError } = await supabase
      .from('ai_prompt_versions')
      .update({
        status: 'published'
      })
      .eq('template_id', template.id)
      .eq('version', normalizedVersion);
    if (versionUpdateError) throw versionUpdateError;
  }

  clearPromptCache();

  return {
    templateId: template.id,
    activeVersion: normalizedVersion
  };
}

async function deletePromptVersion({
  promptKey,
  eventType = '*',
  locale = 'fr',
  version
}) {
  const normalizedVersion = Number(version);
  if (!Number.isInteger(normalizedVersion) || normalizedVersion <= 0) {
    throw new Error('Version invalide.');
  }

  const { template } = await getScopedTemplateRecord({
    promptKey,
    eventType,
    locale
  });

  if (!template) {
    throw new Error('Template introuvable pour ce scope.');
  }

  const { data: existingVersions, error: listError } = await supabase
    .from('ai_prompt_versions')
    .select('id, version')
    .eq('template_id', template.id)
    .order('version', { ascending: false });

  if (listError) throw listError;

  const versionExists = (existingVersions || []).some(
    (versionRow) => Number(versionRow.version) === normalizedVersion
  );
  if (!versionExists) {
    throw new Error(`Version ${normalizedVersion} introuvable.`);
  }

  const { error: deleteError } = await supabase
    .from('ai_prompt_versions')
    .delete()
    .eq('template_id', template.id)
    .eq('version', normalizedVersion);

  if (deleteError) throw deleteError;

  let nextActiveVersion = template.active_version;
  if (Number(template.active_version) === normalizedVersion) {
    const remainingVersions = (existingVersions || [])
      .map((versionRow) => Number(versionRow.version))
      .filter((versionNumber) => versionNumber !== normalizedVersion)
      .sort((left, right) => right - left);
    nextActiveVersion = remainingVersions[0] || 0;

    const { error: updateTemplateError } = await supabase
      .from('ai_prompt_templates')
      .update({
        active_version: nextActiveVersion,
        updated_at: new Date().toISOString()
      })
      .eq('id', template.id);

    if (updateTemplateError) throw updateTemplateError;
  }

  clearPromptCache();

  return {
    templateId: template.id,
    deletedVersion: normalizedVersion,
    activeVersion: nextActiveVersion
  };
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
