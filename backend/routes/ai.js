// C:\Users\USER\bookfete\backend\routes\ai.js
const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const promptTemplateService = require('../services/promptTemplateService');
const authenticate = require('../middleware/auth');

const PROMPT_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.DEBUG_PROMPT_TRACE || '').trim().toLowerCase()
);

function logPromptDebug(tag, payload) {
  if (!PROMPT_DEBUG_ENABLED) return;
  try {
    console.log(`[PROMPT_TRACE][${tag}] ${JSON.stringify(payload, null, 2)}`);
  } catch (_error) {
    console.log(`[PROMPT_TRACE][${tag}]`, payload);
  }
}

function ensurePromptAdmin(req, res, next) {
  const allowListRaw = process.env.AI_PROMPT_ADMIN_EMAILS || '';
  const allowList = allowListRaw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (allowList.length === 0) {
    return next();
  }

  const userEmail = (req.user?.email || '').trim().toLowerCase();
  if (!userEmail || !allowList.includes(userEmail)) {
    return res.status(403).json({
      error: 'Accès refusé. Utilisateur non autorisé à gérer les prompts.'
    });
  }

  return next();
}

function normalizeTitle(value) {
  if (value === null || value === undefined) return '';
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized;
}

function normalizeTitles(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return normalizeTitle(item);
        if (item && typeof item === 'object') {
          return normalizeTitle(item.title || item.name || item.chapterTitle || item.label);
        }
        return '';
      })
      .filter(Boolean);
  }

  if (raw && typeof raw === 'object') {
    const arrayCandidates = [
      raw.chapters,
      raw.chapterTitles,
      raw.titles,
      raw.sommaire,
      raw['Sommaire des souvenirs'],
      raw.Sommaire
    ];

    for (const candidate of arrayCandidates) {
      const normalized = normalizeTitles(candidate);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return [];
}

function parseChapterTitles(content) {
  if (!content) return [];

  const cleanContent = String(content).replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleanContent);
    const normalized = normalizeTitles(parsed);
    if (normalized.length > 0) {
      return normalized;
    }
  } catch (error) {
    // no-op
  }

  const arrayMatch = cleanContent.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsedArray = JSON.parse(arrayMatch[0]);
      const normalized = normalizeTitles(parsedArray);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch (error) {
      // no-op
    }
  }

  const lineMatches = [];
  const chapterRegex = /(?:^|\n)\s*(?:[-*•○]?\s*)?chapitre\s*\d+\s*[:\-]\s*(.+)/gi;
  let match = chapterRegex.exec(cleanContent);
  while (match) {
    const title = normalizeTitle(match[1]);
    if (title) {
      lineMatches.push(title);
    }
    match = chapterRegex.exec(cleanContent);
  }

  return lineMatches;
}

function parseSuggestedBookTitle(content) {
  if (!content) return '';

  const cleanContent = String(content).replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleanContent);
    if (parsed && typeof parsed === 'object') {
      const titleCandidates = [
        parsed.bookTitle,
        parsed.title,
        parsed.book_title,
        parsed['Titre de l Ouvrage'],
        parsed["Titre de l'Ouvrage"],
        parsed['Titre du livre'],
        parsed['Titre du Livre']
      ];

      for (const candidate of titleCandidates) {
        const normalizedCandidate = normalizeTitle(candidate);
        if (normalizedCandidate) {
          return normalizedCandidate;
        }
      }
    }
  } catch (_error) {
    // no-op
  }

  const titleLineRegex = /(?:^|\n)\s*(?:[-*•◦]?\s*)?(?:titre(?:\s+de\s+l['’]ouvrage|\s+du\s+livre)?|book\s*title)\s*[:\-]\s*(.+)/i;
  const titleMatch = cleanContent.match(titleLineRegex);
  if (titleMatch?.[1]) {
    return normalizeTitle(titleMatch[1]);
  }

  return '';
}

function extractTemplateVariables(templateText = '') {
  const variableNames = new Set();
  const variablePattern = /{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;
  let match = variablePattern.exec(String(templateText || ''));
  while (match) {
    variableNames.add(match[1]);
    match = variablePattern.exec(String(templateText || ''));
  }
  return [...variableNames];
}

function normalizeQuestionText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeQuestionList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return normalizeQuestionText(item);
      if (item && typeof item === 'object') {
        return normalizeQuestionText(item.question || item.title || item.label);
      }
      return '';
    })
    .filter(Boolean);
}

function parseQuestionsForAdmin(content) {
  if (!content) return [];

  const cleanContent = String(content).replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleanContent);
    if (Array.isArray(parsed)) {
      return normalizeQuestionList(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.questions)) {
        return normalizeQuestionList(parsed.questions);
      }
      if (Array.isArray(parsed.items)) {
        return normalizeQuestionList(parsed.items);
      }
    }
  } catch (_error) {
    // no-op
  }

  const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsedArray = JSON.parse(jsonMatch[0]);
      return normalizeQuestionList(parsedArray);
    } catch (_error) {
      // no-op
    }
  }

  const fromLines = [];
  const numberedLineRegex = /(?:^|\n)\s*(?:[-*•]?\s*)?(?:\d+[\)\.\-]|Question\s*\d+\s*[:\-])\s*(.+)/gi;
  let match = numberedLineRegex.exec(cleanContent);
  while (match) {
    const text = normalizeQuestionText(match[1]);
    if (text) {
      fromLines.push(text);
    }
    match = numberedLineRegex.exec(cleanContent);
  }

  return fromLines;
}

function parsePromptTestModelOutput(promptKey, modelOutput = '') {
  const raw = String(modelOutput || '').trim();
  if (!raw) {
    return null;
  }

  if (promptKey === promptTemplateService.PROMPT_KEYS.CHAPTER_GENERATION) {
    const chapterTitles = parseChapterTitles(raw);
    const suggestedBookTitle = parseSuggestedBookTitle(raw);
    return {
      kind: 'chapter_generation',
      suggestedBookTitle,
      chapterTitles,
      chapterCount: chapterTitles.length
    };
  }

  if (promptKey === promptTemplateService.PROMPT_KEYS.QUESTION_GENERATION) {
    const questions = parseQuestionsForAdmin(raw);
    return {
      kind: 'question_generation',
      questions,
      questionCount: questions.length
    };
  }

  if (promptKey === promptTemplateService.PROMPT_KEYS.CONTENT_GENERATION) {
    return {
      kind: 'content_generation',
      characterCount: raw.length,
      preview: raw.slice(0, 320)
    };
  }

  return {
    kind: 'unknown',
    preview: raw.slice(0, 320)
  };
}

function analyzePromptTest({
  promptKey,
  systemPrompt,
  userPromptTemplate,
  userPrompt,
  variables = {},
  modelOutput = ''
}) {
  const expectedVariables = Array.from(new Set([
    ...extractTemplateVariables(systemPrompt),
    ...extractTemplateVariables(userPromptTemplate)
  ]));
  const missingVariables = expectedVariables.filter((name) => {
    const value = variables?.[name];
    return value === null || value === undefined || String(value).trim() === '';
  });
  const unresolvedPlaceholders = extractTemplateVariables(userPrompt);

  const warnings = [];
  if (missingVariables.length > 0) {
    warnings.push(`Variables manquantes: ${missingVariables.join(', ')}`);
  }
  if (unresolvedPlaceholders.length > 0) {
    warnings.push(`Placeholders non resolus: ${unresolvedPlaceholders.join(', ')}`);
  }

  const parsedOutput = parsePromptTestModelOutput(promptKey, modelOutput);
  if (modelOutput && parsedOutput) {
    if (
      promptKey === promptTemplateService.PROMPT_KEYS.QUESTION_GENERATION
      && parsedOutput.questionCount < 3
    ) {
      warnings.push('Le modele n a pas retourne assez de questions exploitables.');
    }
    if (
      promptKey === promptTemplateService.PROMPT_KEYS.CHAPTER_GENERATION
      && parsedOutput.chapterCount === 0
    ) {
      warnings.push('Aucun titre de chapitre interpretable dans la sortie modele.');
    }
  }

  return {
    expectedVariables,
    missingVariables,
    unresolvedPlaceholders,
    parsedOutput,
    warnings
  };
}

function shapeChaptersFromTitles(titles, count) {
  const safeTitles = Array.isArray(titles) ? [...titles] : [];

  while (safeTitles.length < count) {
    safeTitles.push(`Chapitre ${safeTitles.length + 1}`);
  }

  return safeTitles.slice(0, count).map((title, index) => ({
    title,
    description: `Chapitre ${index + 1} - Partagez vos souvenirs`,
    order_index: index
  }));
}

function buildDefaultPromptTestVariables({
  promptKey,
  eventType = 'generique'
}) {
  const base = {
    count: 8,
    eventType: eventType || 'generique',
    style: 'intime',
    bookTitle: 'Livre souvenir',
    chapterTitle: 'Nos plus beaux moments',
    recipientName: 'Julie',
    recipientAge: '40',
    recipientGender: 'femme',
    recipientNickname: 'Ju',
    recipientTrait: 'Genereuse et pleine d energie',
    recipientAnecdote: 'Son rire communicatif dans toutes les fetes',
    additionalContext: 'Ton elegant, chaleureux et complice',
    pronoun: 'cette femme',
    subjectPronoun: 'elle',
    possessive: 'sa',
    ageContext: '(cette femme est une adulte de 40 ans)',
    styleInstruction: 'Adopte un ton chaleureux, personnel et confidentiel.'
  };

  if (promptKey === promptTemplateService.PROMPT_KEYS.CHAPTER_GENERATION) {
    return {
      ...base,
      count: 8,
      chapterTitle: undefined
    };
  }

  if (promptKey === promptTemplateService.PROMPT_KEYS.QUESTION_GENERATION) {
    return {
      ...base,
      count: undefined
    };
  }

  if (promptKey === promptTemplateService.PROMPT_KEYS.CONTENT_GENERATION) {
    return {
      ...base,
      count: undefined,
      outputType: 'chapter_content',
      chapterSummary: 'Synthese des contributions precedentes',
      narrativeContext: 'Insister sur les details concrets et les emotions authentiques',
      targetLength: 3200
    };
  }

  return base;
}

// ============================================
// ROUTES PUBLIQUES (SANS AUTHENTIFICATION)
// ============================================

// Route PUBLIQUE pour générer des chapitres (sans authentification)
router.post('/generate-chapters-public', async (req, res) => {
  try {
    const { 
      eventType, 
      style, 
      count, 
      bookTitle, 
      recipientName, 
      recipientAge, 
      recipientGender,
      recipientNickname,
      recipientTrait,
      recipientAnecdote,
      additionalContext,
      projectBrief,
      prompt,
      usePromptOverride
    } = req.body;

    const resolvedAdditionalContext = additionalContext || projectBrief || '';
    
    console.log('='.repeat(60));
    console.log('📝 [PUBLIC] GÉNÉRATION DE CHAPITRES');
    console.log('='.repeat(60));
    console.log('📊 Contexte reçu:', {
      eventType, 
      style, 
      count, 
      bookTitle, 
      recipientName, 
      recipientAge, 
      recipientGender,
      recipientNickname,
      recipientTrait,
      recipientAnecdote,
      additionalContext: resolvedAdditionalContext
    });

    if (!count || count < 1) {
      return res.status(400).json({ error: 'Le nombre de chapitres doit être supérieur à 0' });
    }

    const promptConfig = await promptTemplateService.buildPrompt({
      promptKey: promptTemplateService.PROMPT_KEYS.CHAPTER_GENERATION,
      eventType: eventType || 'generique',
      variables: {
        count,
        eventType: eventType || 'générique',
        style: style || 'intime',
        bookTitle: bookTitle || 'Livre souvenir',
        recipientName: recipientName || 'la personne',
        recipientAge: recipientAge || 'non spécifié',
        recipientGender: recipientGender || 'non spécifié',
        recipientNickname: recipientNickname || '',
        recipientTrait: recipientTrait || '',
        recipientAnecdote: recipientAnecdote || '',
        additionalContext: resolvedAdditionalContext || ''
      }
    });

    const finalPrompt = usePromptOverride && prompt ? prompt : promptConfig.userPrompt;

    console.log('📤 Appel à Mistral...');

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: promptConfig.systemPrompt
        },
        { 
          role: 'user', 
          content: finalPrompt 
        }
      ],
      temperature: promptConfig.temperature,
      maxTokens: promptConfig.maxTokens
    });

    const content = response.choices[0].message.content;
    console.log('📦 Réponse Mistral reçue');
    
    const suggestedBookTitle = parseSuggestedBookTitle(content);
    let titles = parseChapterTitles(content);
    if (!Array.isArray(titles) || titles.length === 0) {
      console.log('⚠️ Pas de titres valides, utilisation du fallback');
      titles = generateFallbackTitles(eventType, count, recipientName, recipientAge, recipientGender);
    }

    const chapters = shapeChaptersFromTitles(titles, count);

    console.log(`✅ ${chapters.length} chapitres générés avec succès (public)`);
    res.json({
      chapters,
      suggestedBookTitle,
      promptSource: promptConfig.source,
      promptVersion: promptConfig.version
    });
    
  } catch (error) {
    console.error('❌ Erreur génération chapitres (public):', error);
    
    // Fallback en cas d'erreur
    const fallbackChapters = generateFallbackTitles(
      req.body.eventType, 
      req.body.count || 8,
      req.body.recipientName,
      req.body.recipientAge,
      req.body.recipientGender
    ).map((title, index) => ({
      title: title,
      description: `Chapitre ${index + 1}`,
      order_index: index
    }));
    
    res.json({ 
      chapters: fallbackChapters,
      suggestedBookTitle: '',
      fallback: true,
      error: error.message 
    });
  }
});

// ============================================
// ROUTES PROTÉGÉES (AVEC AUTHENTIFICATION)
// ============================================

router.get('/prompt-templates/:promptKey', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const { promptKey } = req.params;
    const eventType = (req.query.eventType || '*').toString();
    const locale = (req.query.locale || 'fr').toString();

    const activePrompt = await promptTemplateService.getActivePromptConfig({
      promptKey,
      eventType: eventType === '*' ? 'generique' : eventType,
      locale
    });

    const templateVersions = await promptTemplateService.listPromptVersions({
      promptKey,
      eventType,
      locale
    });

    res.json({
      promptKey,
      eventType,
      locale,
      activePrompt,
      templateVersions
    });
  } catch (error) {
    console.error('❌ Erreur lecture prompt templates:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/prompt-templates/:promptKey/test', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const { promptKey } = req.params;
    const {
      eventType = '*',
      locale = 'fr',
      variables = {},
      useDefaultVariables = true,
      runModel = false,
      model = 'mistral-small-latest',
      systemPrompt,
      userPromptTemplate,
      temperature,
      maxTokens
    } = req.body || {};

    const normalizedEventType = eventType === '*' ? 'generique' : eventType;
    const defaultVariables = buildDefaultPromptTestVariables({
      promptKey,
      eventType: normalizedEventType
    });
    const useFallbackDefaults = useDefaultVariables !== false;
    const mergedVariables = useFallbackDefaults
      ? {
          ...defaultVariables,
          ...(variables || {})
        }
      : { ...(variables || {}) };

    const promptConfig = await promptTemplateService.getActivePromptConfig({
      promptKey,
      eventType: normalizedEventType,
      locale
    });

    const hasSystemPromptOverride = typeof systemPrompt === 'string' && systemPrompt.trim().length > 0;
    const hasUserTemplateOverride = typeof userPromptTemplate === 'string' && userPromptTemplate.trim().length > 0;
    const hasOverride = hasSystemPromptOverride || hasUserTemplateOverride;

    const resolvedSystemPrompt = hasSystemPromptOverride
      ? systemPrompt.trim()
      : promptConfig.systemPrompt;
    const resolvedUserPromptTemplate = hasUserTemplateOverride
      ? userPromptTemplate.trim()
      : promptConfig.userPromptTemplate;
    const compiledUserPrompt = promptTemplateService.compileTemplate(
      resolvedUserPromptTemplate,
      mergedVariables
    );
    const resolvedUserPrompt = promptTemplateService.applyPromptGuardrails({
      promptKey,
      userPrompt: compiledUserPrompt,
      variables: mergedVariables
    });

    const payload = {
      promptKey,
      eventType: normalizedEventType,
      locale,
      source: hasOverride ? 'override' : promptConfig.source,
      version: promptConfig.version,
      systemPrompt: resolvedSystemPrompt,
      userPromptTemplate: resolvedUserPromptTemplate,
      userPrompt: resolvedUserPrompt,
      variables: mergedVariables,
      useDefaultVariables: useFallbackDefaults,
      compiledPrompt: [
        '[SYSTEM PROMPT]',
        resolvedSystemPrompt || '',
        '',
        '[USER TEMPLATE COMPILE]',
        resolvedUserPrompt || ''
      ].join('\n'),
      modelCall: null,
      analysis: analyzePromptTest({
        promptKey,
        systemPrompt: resolvedSystemPrompt,
        userPromptTemplate: resolvedUserPromptTemplate,
        userPrompt: resolvedUserPrompt,
        variables: mergedVariables,
        modelOutput: ''
      })
    };

    logPromptDebug('admin_prompt_test_request', {
      promptKey,
      eventType: normalizedEventType,
      locale,
      runModel: Boolean(runModel),
      model,
      source: payload.source,
      version: payload.version,
      useDefaultVariables: useFallbackDefaults,
      variables: mergedVariables,
      systemPrompt: resolvedSystemPrompt,
      userPromptTemplate: resolvedUserPromptTemplate,
      userPromptCompiled: resolvedUserPrompt
    });

    if (runModel) {
      const response = await aiService.mistral.chat.complete({
        model,
        messages: [
          { role: 'system', content: resolvedSystemPrompt },
          { role: 'user', content: resolvedUserPrompt }
        ],
        temperature: Number.isFinite(Number(temperature))
          ? Number(temperature)
          : promptConfig.temperature,
        maxTokens: Number.isFinite(Number(maxTokens))
          ? Number(maxTokens)
          : promptConfig.maxTokens
      });

      const modelOutput = response?.choices?.[0]?.message?.content || '';
      payload.modelCall = {
        model,
        output: modelOutput
      };
      payload.analysis = analyzePromptTest({
        promptKey,
        systemPrompt: resolvedSystemPrompt,
        userPromptTemplate: resolvedUserPromptTemplate,
        userPrompt: resolvedUserPrompt,
        variables: mergedVariables,
        modelOutput
      });

      logPromptDebug('admin_prompt_test_model_output', {
        promptKey,
        model,
        output: modelOutput
      });
    }

    res.json(payload);
  } catch (error) {
    console.error('❌ Erreur test prompt template:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/prompt-templates/:promptKey/versions', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const { promptKey } = req.params;
    const {
      eventType = '*',
      locale = 'fr',
      systemPrompt,
      userPromptTemplate,
      temperature,
      maxTokens,
      note = '',
      status = 'published',
      publish = true
    } = req.body || {};

    const result = await promptTemplateService.upsertPromptVersion({
      promptKey,
      eventType,
      locale,
      systemPrompt,
      userPromptTemplate,
      temperature,
      maxTokens,
      note,
      status,
      publish: publish !== false,
      createdBy: req.user?.email || ''
    });

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('❌ Erreur publication prompt:', error);
    res.status(400).json({ error: error.message });
  }
});

router.patch('/prompt-templates/:promptKey/versions/:version', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const { promptKey, version } = req.params;
    const {
      eventType = '*',
      locale = 'fr',
      note = ''
    } = req.body || {};

    const result = await promptTemplateService.updatePromptVersionNote({
      promptKey,
      eventType,
      locale,
      version,
      note
    });

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour note version prompt:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/prompt-templates/:promptKey/activate', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const { promptKey } = req.params;
    const {
      eventType = '*',
      locale = 'fr',
      version
    } = req.body || {};

    const result = await promptTemplateService.activatePromptVersion({
      promptKey,
      eventType,
      locale,
      version
    });

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('❌ Erreur activation version prompt:', error);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/prompt-templates/:promptKey/versions/:version', authenticate, ensurePromptAdmin, async (req, res) => {
  try {
    const { promptKey, version } = req.params;
    const eventType = (req.query.eventType || req.body?.eventType || '*').toString();
    const locale = (req.query.locale || req.body?.locale || 'fr').toString();

    const result = await promptTemplateService.deletePromptVersion({
      promptKey,
      eventType,
      locale,
      version
    });

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('❌ Erreur suppression version prompt:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/prompt-templates/cache/clear', authenticate, ensurePromptAdmin, async (req, res) => {
  promptTemplateService.clearPromptCache();
  res.json({ ok: true });
});

// Route pour générer des questions
// backend/routes/ai.js - Route /generate-questions
router.post('/generate-questions', authenticate, async (req, res) => {
  try {
    const { 
      chapterTitle, 
      bookTitle, 
      eventType, 
      style,
      recipientName,
      recipientAge,
      recipientGender 
    } = req.body;
    
    console.log('='.repeat(60));
    console.log('📦 ROUTE AI - DONNÉES REÇUES DU FRONTEND');
    console.log('='.repeat(60));
    console.log('📚 bookTitle:', bookTitle);
    console.log('📖 chapterTitle:', chapterTitle);
    console.log('🎉 eventType:', eventType);
    console.log('✍️ style:', style);
    console.log('👤 recipientName:', recipientName);
    console.log('📅 recipientAge:', recipientAge, 'type:', typeof recipientAge);
    console.log('⚥ recipientGender:', recipientGender);
    console.log('='.repeat(60));

    if (!chapterTitle) {
      return res.status(400).json({ error: 'chapterTitle est requis' });
    }

    const questions = await aiService.generateQuestions({
      chapterTitle,
      bookTitle: bookTitle || 'ce livre',
      eventType: eventType || 'evenement',
      style: style || 'intime',
      recipientName,
      recipientAge,
      recipientGender
    });
    
    res.json({ questions });
  } catch (error) {
    console.error('❌ Erreur route generate-questions:', error);
    res.status(500).json({ error: error.message });
  }
});
// Route pour générer une citation
router.post('/generate-quote', authenticate, async (req, res) => {
  try {
    const { chapterTitle, eventType, style } = req.body;
    
    console.log('📝 Génération de citation pour:', { chapterTitle, eventType, style });
    
    const quote = await aiService.generateQuote(chapterTitle, eventType, style);
    
    res.json({ quote });
  } catch (error) {
    console.error('❌ Erreur route generate-quote:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route protégée pour générer des chapitres (pour utilisateurs connectés)
router.post('/generate-chapters', authenticate, async (req, res) => {
  try {
    const { 
      eventType, 
      style, 
      count, 
      bookTitle, 
      recipientName, 
      recipientAge, 
      recipientGender,
      recipientNickname,
      recipientTrait,
      recipientAnecdote,
      additionalContext,
      projectBrief,
      prompt,
      usePromptOverride
    } = req.body;

    const resolvedAdditionalContext = additionalContext || projectBrief || '';
    
    console.log('📝 [PROTÉGÉ] Génération de chapitres avec contexte:', {
      eventType, 
      style, 
      count, 
      bookTitle, 
      recipientName, 
      recipientAge, 
      recipientGender,
      recipientNickname,
      recipientTrait,
      recipientAnecdote,
      additionalContext: resolvedAdditionalContext
    });

    if (!count || count < 1) {
      return res.status(400).json({ error: 'Le nombre de chapitres doit être supérieur à 0' });
    }

    const promptConfig = await promptTemplateService.buildPrompt({
      promptKey: promptTemplateService.PROMPT_KEYS.CHAPTER_GENERATION,
      eventType: eventType || 'generique',
      variables: {
        count,
        eventType: eventType || 'générique',
        style: style || 'intime',
        bookTitle: bookTitle || 'Livre souvenir',
        recipientName: recipientName || 'la personne',
        recipientAge: recipientAge || 'non spécifié',
        recipientGender: recipientGender || 'non spécifié',
        recipientNickname: recipientNickname || '',
        recipientTrait: recipientTrait || '',
        recipientAnecdote: recipientAnecdote || '',
        additionalContext: resolvedAdditionalContext || ''
      }
    });

    const finalPrompt = usePromptOverride && prompt ? prompt : promptConfig.userPrompt;

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: promptConfig.systemPrompt
        },
        { 
          role: 'user', 
          content: finalPrompt 
        }
      ],
      temperature: promptConfig.temperature,
      maxTokens: promptConfig.maxTokens
    });

    const content = response.choices[0].message.content;
    const suggestedBookTitle = parseSuggestedBookTitle(content);

    let titles = parseChapterTitles(content);
    if (!Array.isArray(titles) || titles.length === 0) {
      console.log('⚠️ Pas de titres valides, utilisation du fallback');
      titles = generateFallbackTitles(eventType, count, recipientName, recipientAge, recipientGender);
    }

    const chapters = shapeChaptersFromTitles(titles, count);

    console.log(`✅ ${chapters.length} chapitres générés avec succès (protégé)`);
    res.json({
      chapters,
      suggestedBookTitle,
      promptSource: promptConfig.source,
      promptVersion: promptConfig.version
    });
    
  } catch (error) {
    console.error('❌ Erreur génération chapitres:', error);
    
    const fallbackChapters = generateFallbackTitles(
      req.body.eventType, 
      req.body.count || 8,
      req.body.recipientName,
      req.body.recipientAge,
      req.body.recipientGender
    ).map((title, index) => ({
      title: title,
      description: `Chapitre ${index + 1}`,
      order_index: index
    }));
    
    res.json({ 
      chapters: fallbackChapters,
      suggestedBookTitle: '',
      fallback: true,
      error: error.message 
    });
  }
});

// Route pour générer une introduction
router.post('/generate-introduction', authenticate, async (req, res) => {
  try {
    const { bookTitle, eventType, style, recipientName, recipientAge, recipientGender } = req.body;
    
    const prompt = `Rédige une introduction poétique et chaleureuse pour un livre souvenir.

Contexte :
- Titre du livre : ${bookTitle}
- Type d'événement : ${eventType}
- Style : ${style}
- Nom du destinataire : ${recipientName || 'la personne'}
- Âge : ${recipientAge || 'non spécifié'} ans
- Sexe : ${recipientGender || 'non spécifié'}

L'introduction doit :
- Faire environ 100-150 mots
- Expliquer pourquoi ce livre a été créé
- Mentionner le nom de la personne (${recipientName || 'le/la destinataire'})
- Donner envie de lire la suite
- Être écrite en français, avec une touche d'émotion

Réponds UNIQUEMENT avec le texte de l'introduction, sans guillemets.`;

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'Tu rédiges des introductions pour des livres souvenirs, avec élégance et émotion.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      maxTokens: 300
    });

    const introduction = response.choices[0].message.content.trim();
    res.json({ introduction });
    
  } catch (error) {
    console.error('❌ Erreur génération introduction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour générer une conclusion
router.post('/generate-conclusion', authenticate, async (req, res) => {
  try {
    const { bookTitle, eventType, style, recipientName } = req.body;
    
    const prompt = `Rédige une conclusion touchante pour un livre souvenir.

Contexte :
- Titre du livre : ${bookTitle}
- Type d'événement : ${eventType}
- Style : ${style}
- Nom du destinataire : ${recipientName || 'la personne'}

La conclusion doit :
- Faire environ 80-120 mots
- Remercier les contributeurs
- Souhaiter quelque chose de beau au destinataire
- Clore le livre avec élégance

Réponds UNIQUEMENT avec le texte de la conclusion, sans guillemets.`;

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'Tu rédiges des conclusions pour des livres souvenirs.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      maxTokens: 250
    });

    const conclusion = response.choices[0].message.content.trim();
    res.json({ conclusion });
    
  } catch (error) {
    console.error('❌ Erreur génération conclusion:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FONCTION DE FALLBACK
// ============================================

function generateFallbackTitles(eventType, count, recipientName, recipientAge, recipientGender) {
  const name = recipientName || 'la personne';
  const age = recipientAge ? parseInt(recipientAge) : null;
  
  // Adapter les titres selon l'âge
  let agePrefix = '';
  if (age) {
    if (age < 18) agePrefix = "d'enfance";
    else if (age < 30) agePrefix = "de jeunesse";
    else if (age < 50) agePrefix = "de vie";
    else agePrefix = "d'une vie";
  }

  const baseTitles = {
    generique: [
      `Souvenirs avec ${name}`,
      `Moments avec ${name}`,
      `Ce que j'aime chez ${name}`,
      `Messages pour ${name}`,
      `Photos de ${name}`,
      `Vœux pour ${name}`
    ],
    anniversaire: [
      `Souvenirs ${agePrefix} de ${name}`,
      `Nos moments avec ${name}`,
      `Ce que j'aime chez ${name}`,
      `Nos meilleurs souvenirs avec ${name}`,
      `Messages pour ${name}`,
      `Vœux pour ${name}`
    ],
    mariage: [
      'Leur rencontre',
      'La demande',
      'Les préparatifs',
      'La cérémonie',
      'La fête',
      `Messages pour ${name}`
    ],
    naissance: [
      `L'annonce de ${name}`,
      `L'attente de ${name}`,
      `L'arrivée de ${name}`,
      `Premiers moments avec ${name}`,
      `Messages pour ${name}`,
      `Rêves pour ${name}`
    ],
    depart: [
      `Souvenirs avec ${name}`,
      `Ce qu'on retient de ${name}`,
      `Anecdotes avec ${name}`,
      `Messages pour ${name}`,
      `Nouveau départ pour ${name}`,
      `On n'oublie pas ${name}`
    ],
    projet: [
      'Le début du projet',
      'Les étapes clés',
      'Les défis relevés',
      'Les réussites',
      `Messages pour ${name}`,
      'La suite'
    ],
    potdepart: [
      `Souvenirs avec ${name}`,
      `Moments marquants avec ${name}`,
      `Anecdotes avec ${name}`,
      `Messages des collègues pour ${name}`,
      `Ce qu'on retient de ${name}`,
      `Bon vent ${name} !`
    ]
  };

  const titles = baseTitles[eventType] || baseTitles.generique;
  const result = [];

  for (let i = 0; i < count; i++) {
    const baseIndex = i % titles.length;
    let title = titles[baseIndex];
    
    // Adapter le titre selon l'âge si nécessaire
    if (age && title.includes('souvenirs') && !title.includes(agePrefix)) {
      title = title.replace('souvenirs', `souvenirs ${agePrefix}`);
    }
    
    // Ajouter un suffixe si on dépasse le nombre de titres de base
    if (i >= titles.length) {
      const suffix = Math.floor(i / titles.length) + 1;
      title = `${title} ${suffix}`;
    }
    
    result.push(title);
  }
  
  return result;
}

module.exports = router;
