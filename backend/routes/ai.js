const express = require('express');

const router = express.Router();
const supabase = require('../config/supabase');
const aiService = require('../services/aiService');
const promptEngine = require('../services/promptEngine');
const authenticate = require('../middleware/auth');

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function normalizeTitles(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === 'string') return normalizeText(entry);
        if (entry && typeof entry === 'object') {
          return normalizeText(entry.title || entry.label || entry.name || entry.chapterTitle);
        }
        return '';
      })
      .filter(Boolean);
  }

  if (raw && typeof raw === 'object') {
    const candidates = [raw.chapterTitles, raw.titles, raw.chapters, raw.items];
    for (const candidate of candidates) {
      const normalized = normalizeTitles(candidate);
      if (normalized.length > 0) return normalized;
    }
  }

  return [];
}

function sanitizeChapterTitle(rawTitle = '') {
  const normalized = normalizeText(rawTitle)
    .replace(/^["'«»\-\s]+|["'«»\-\s]+$/g, '')
    .replace(/^(?:chapitre\s*\d+\s*[:\-]|\d+[\.\)\-:]\s*)/i, '')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= 84) return normalized;
return `${normalized.slice(0, 81).trim()}...`;
}

const CHAPTER_TITLE_BLOCKLIST = [
  /system settings/i,
  /user management/i,
  /roles?, permissions?/i,
  /database configuration/i,
  /database connections?/i,
  /api integrations?/i,
  /api keys?/i,
  /environment variables?/i,
  /\badmin\b/i,
  /\bdashboard\b/i,
  /\bsettings\b/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /\bschema\b/i,
  /\bprompts?\b/i,
  /\bplatform\b/i,
  /\berror messages?\b/i,
  /\bissues?\b/i,
  /\bi['’]d be happy\b/i,
  /\bguide you\b/i
];

function isLikelyChapterTitleCandidate(rawTitle = '') {
  const normalized = sanitizeChapterTitle(rawTitle);
  if (!normalized) return false;
  if (normalized.length < 4 || normalized.length > 84) return false;
  if (normalized.endsWith('?')) return false;
  if (/\*\*/.test(normalized)) return false;
  if (/[{}[\]]/.test(normalized)) return false;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 8) return false;
  if (/^(?:what|which|why|how|are|is|can|could|would|please|it\s+seems|i['’]d)/i.test(normalized)) return false;
  if (CHAPTER_TITLE_BLOCKLIST.some((pattern) => pattern.test(normalized))) return false;
  return true;
}

function parseChapterTitlesOutput(rawOutput = '') {
  const source = String(rawOutput || '').replace(/```json|```/gi, '').trim();
  if (!source) return [];

  try {
    const parsed = JSON.parse(source);
    const normalized = normalizeTitles(parsed);
    if (normalized.length > 0) return normalized;
  } catch (_error) {
    // Fallback below.
  }

  const lineRegex = /(?:^|\n)\s*(?:[-*•]?\s*)?(?:chapitre\s*\d+\s*[:\-]|\d+[\.\)\-])\s*(.+)/gi;
  const fromLines = [];
  let match = lineRegex.exec(source);
  while (match) {
    const title = normalizeText(match[1]);
    if (title) fromLines.push(title);
    match = lineRegex.exec(source);
  }
  if (fromLines.length > 0) {
    return fromLines;
  }

  const looseLines = source
    .split('\n')
    .map((line) => normalizeText(line.replace(/^\s*(?:[-*•]|(?:\d+[\.\)\-:]))\s*/g, '')))
    .filter((line) => line.length >= 6 && line.length <= 100)
    .filter((line) => !/^(?:format|consigne|sortie|exemple|titre(?:s)?\s*:?$)/i.test(line));

  if (looseLines.length > 0) {
    return looseLines;
  }

  const inlineSegments = source
    .split(/[;|]/g)
    .map((segment) => normalizeText(segment))
    .filter((segment) => segment.length >= 6 && segment.length <= 100);
  return inlineSegments;
}

function buildFallbackChapterTitles(variables = {}, count = 6, rawOutput = '') {
  const safeCount = Math.max(1, Number(count) || 1);
  const eventType = normalizeText(variables.eventType || variables.event_type).toLowerCase();
  const baseByEvent = {
    anniversaire: 'Souvenirs marquants',
    retraite: 'Moments partages',
    depart: 'Instants de passage',
    mariage: 'Moments de complicite',
    naissance: 'Premiers souvenirs',
    voyage: 'Instants de voyage',
    projet: 'Temps forts du projet',
    famille: 'Memoire de famille'
  };

  const fromOutput = parseChapterTitlesOutput(rawOutput)
    .map((title) => sanitizeChapterTitle(title))
    .filter((title) => isLikelyChapterTitleCandidate(title));

  const unique = [...new Set(fromOutput)];
  const base = baseByEvent[eventType] || 'Souvenirs choisis';

  while (unique.length < safeCount) {
    const index = unique.length + 1;
    unique.push(`${base} ${index}`);
  }

  return unique.slice(0, safeCount);
}

const BOOK_TITLE_BLOCKLIST = [
  /it seems like/i,
  /could you please/i,
  /for example/i,
  /system settings/i,
  /database connections?/i,
  /api keys?/i,
  /environment variables?/i,
  /user management/i,
  /roles?, permissions?/i,
  /configuration task/i,
  /database configuration/i,
  /api integrations?/i,
  /\badmin\b/i,
  /\bdashboard\b/i,
  /\bsettings\b/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /\bschema\b/i,
  /\bprompts?\b/i
];

function sanitizeBookTitleCandidate(rawValue = '') {
  return normalizeText(rawValue)
    .replace(/^["'`Â«Â»\s\-–—]+|["'`Â«Â»\s\-–—]+$/g, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^(?:title|titre)\s*[:\-]\s*/i, '')
    .replace(/^\d+[\.\)\-:]\s*/g, '')
    .trim();
}

function hasSuspiciousRepeatedTitleWords(rawValue = '') {
  const stopWords = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'a', 'en', 'pour']);
  const tokens = sanitizeBookTitleCandidate(rawValue)
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ'-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !stopWords.has(token));

  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) return true;
    seen.add(token);
  }
  return false;
}

function extractRelevantTitleTokens(variables = {}) {
  const rawValues = [
    variables.recipient_name,
    variables.recipientName,
    variables.recipient_nickname,
    variables.recipientNickname,
    variables.recipient_name_2,
    variables.recipientName2,
    variables.event_location,
    variables.eventLocation,
    variables.destination,
    variables.project_name,
    variables.projectName,
    variables.family_name,
    variables.familyName,
    variables.event_custom_description,
    variables.eventCustomDescription
  ];

  return [...new Set(rawValues
    .flatMap((value) => sanitizeBookTitleCandidate(value)
      .toLowerCase()
      .split(/[^a-z0-9à-ÿ'-]+/i))
    .map((token) => token.trim())
    .filter((token) => token.length >= 4))];
}

function isRelevantBookTitleCandidate(rawValue = '', variables = {}) {
  const value = sanitizeBookTitleCandidate(rawValue).toLowerCase();
  if (!value) return false;

  const relevantTokens = extractRelevantTitleTokens(variables);
  if (relevantTokens.length === 0) {
    return !BOOK_TITLE_BLOCKLIST.some((pattern) => pattern.test(value));
  }

  return relevantTokens.some((token) => value.includes(token));
}

function isLikelyBookTitleCandidate(rawValue = '', variables = {}) {
  const value = sanitizeBookTitleCandidate(rawValue);
  if (!value) return false;
  if (value.length < 4 || value.length > 90) return false;
  if (/\*\*/.test(value)) return false;
  if (/[{}[\]]/.test(value)) return false;
  if (value.includes('\n')) return false;
  if (value.endsWith('?')) return false;
  const wordCount = value.split(/\s+/).filter(Boolean).length;
  if (wordCount > 10) return false;
  if (BOOK_TITLE_BLOCKLIST.some((pattern) => pattern.test(value))) return false;
  if (hasSuspiciousRepeatedTitleWords(value)) return false;
  if (!isRelevantBookTitleCandidate(value, variables)) return false;
  return true;
}

function buildBookTitleFallbacks(variables = {}) {
  const recipient = normalizeText(
    variables.recipient_name
    || variables.recipientName
    || variables.recipient_nickname
    || variables.recipientNickname
    || 'la personne celebre'
  );
  const secondRecipient = normalizeText(variables.recipient_name_2 || variables.recipientName2);
  const eventType = normalizeText(variables.event_type || variables.eventType).toLowerCase();
  const pairTitle = secondRecipient ? `${recipient} & ${secondRecipient}` : recipient;

  const byEvent = {
    anniversaire: [
      `Pour ${recipient}`,
      `${recipient}, souvenirs choisis`,
      `Autour de ${recipient}`
    ],
    retraite: [
      `Pour ${recipient}`,
      `Le temps de ${recipient}`,
      `${recipient}, souvenirs choisis`
    ],
    depart: [
      `Pour ${recipient}`,
      `Autour de ${recipient}`,
      `${recipient}, souvenirs choisis`
    ],
    mariage: [
      pairTitle,
      `Autour de ${pairTitle}`,
      `Pour ${pairTitle}`
    ],
    naissance: [
      `Bienvenue ${recipient}`,
      `Pour ${recipient}`,
      `${recipient}, deja tant d'amour`
    ],
    voyage: [
      recipient,
      `Carnet de ${recipient}`,
      `${recipient}, souvenirs choisis`
    ],
    projet: [
      recipient,
      `${recipient}, aventure collective`,
      'Souvenirs du projet'
    ],
    famille: [
      recipient,
      `Memoire de ${recipient}`,
      `${recipient}, souvenirs choisis`
    ],
    custom: [
      `Pour ${recipient}`,
      `${recipient}, souvenirs choisis`,
      `Autour de ${recipient}`
    ]
  };

  return [...new Set((byEvent[eventType] || byEvent.custom)
    .map((entry) => sanitizeBookTitleCandidate(entry))
    .filter(Boolean))].slice(0, 3);
}

function parseBookTitleOutput(rawOutput = '', variables = {}) {
  const source = String(rawOutput || '').replace(/```json|```/gi, '').trim();
  if (!source) return '';

  try {
    const parsed = JSON.parse(source);
    if (typeof parsed === 'string') {
      const candidate = sanitizeBookTitleCandidate(parsed);
      return isLikelyBookTitleCandidate(candidate, variables) ? candidate : '';
    }
    if (parsed && typeof parsed === 'object') {
      const candidate = sanitizeBookTitleCandidate(parsed.bookTitle || parsed.title || parsed.book_title);
      return isLikelyBookTitleCandidate(candidate, variables) ? candidate : '';
    }
  } catch (_error) {
    // Fallback below.
  }

  const lineMatch = source.match(
    /(?:^|\n)\s*(?:titre(?:\s+du\s+livre|\s+de\s+l['’]ouvrage)?|book\s*title)\s*[:\-]\s*(.+)/i
  );
  if (lineMatch?.[1]) {
    const candidate = sanitizeBookTitleCandidate(lineMatch[1]);
    return isLikelyBookTitleCandidate(candidate, variables) ? candidate : '';
  }
  const candidate = sanitizeBookTitleCandidate(source.split('\n')[0]);
  return isLikelyBookTitleCandidate(candidate, variables) ? candidate : '';
}

function parseStructuredList(rawOutput = '') {
  const source = String(rawOutput || '').replace(/```json|```/gi, '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.items)) return parsed.items;
      if (Array.isArray(parsed.titles)) return parsed.titles;
      if (Array.isArray(parsed.suggestions)) return parsed.suggestions;
      return Object.values(parsed).find((value) => Array.isArray(value)) || [];
    }
  } catch (_error) {
    // Fallback to line parsing.
  }
  return source
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|(?:\d+[\.\)\-:]))\s*/g, '').trim())
    .filter(Boolean);
}

function parseBookTitleSuggestions(rawOutput = '', variables = {}) {
  const values = parseStructuredList(rawOutput)
    .map((entry) => {
      if (typeof entry === 'string') return sanitizeBookTitleCandidate(entry);
      if (entry && typeof entry === 'object') {
        return sanitizeBookTitleCandidate(entry.title || entry.label || entry.name);
      }
      return '';
    })
    .filter(Boolean)
    .filter((entry) => isLikelyBookTitleCandidate(entry, variables));

  const unique = [...new Set(values)];
  const fallback = buildBookTitleFallbacks(variables);

  while (unique.length < 3) {
    unique.push(fallback[unique.length] || `Titre ${unique.length + 1}`);
  }
  return unique.slice(0, 3);
}

function buildChapterVariables(body = {}) {
  return {
    eventType: normalizeText(body.eventType, 'generique'),
    style: normalizeText(body.style, 'intime'),
    bookTitle: normalizeText(body.bookTitle, 'Livre souvenir'),
    recipientName: normalizeText(body.recipientName, 'la personne celebree'),
    recipientAge: normalizeText(body.recipientAge, 'non specifie'),
    recipientGender: normalizeText(body.recipientGender, 'non specifie'),
    recipientNickname: normalizeText(body.recipientNickname),
    recipientTrait: normalizeText(body.recipientTrait),
    recipientAnecdote: normalizeText(body.recipientAnecdote),
    additionalContext: normalizeText(body.additionalContext || body.projectBrief),
    count: Number.isFinite(Number(body.count)) ? Number(body.count) : 8
  };
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
    normalizeText(book?.cover_config?.aiProjectBrief),
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
    firstNonEmptyText(config.event_custom_description)
  ].filter(Boolean).join(' | ');
}

async function enrichChapterGenerationBody(body = {}, ownerId = '') {
  const bookId = normalizeText(body.bookId);
  if (!bookId || !ownerId) {
    return body;
  }

  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .eq('owner_id', ownerId)
    .single();

  if (bookError || !book) {
    return body;
  }

  const { data: config } = await supabase
    .from('book_configs')
    .select('*')
    .eq('book_id', bookId)
    .maybeSingle();

  const configRecipientName = firstNonEmptyText(
    config?.recipient_name,
    config?.project_name,
    config?.family_name
  );

  return {
    ...body,
    eventType: firstNonEmptyText(body.eventType, book.event_type, config?.event_type),
    style: firstNonEmptyText(body.style, config?.narrative_style, book.style_narratif),
    bookTitle: firstNonEmptyText(body.bookTitle, book.title),
    recipientName: firstNonEmptyText(body.recipientName, configRecipientName, book.recipient_name),
    recipientAge: firstNonEmptyText(body.recipientAge, config?.recipient_age, book.recipient_age),
    recipientGender: firstNonEmptyText(body.recipientGender, config?.recipient_gender, book.recipient_gender),
    recipientNickname: firstNonEmptyText(body.recipientNickname, config?.recipient_nickname),
    recipientTrait: firstNonEmptyText(
      body.recipientTrait,
      config?.character_trait,
      config?.will_be_missed_for,
      config?.complementarity,
      config?.trip_impact,
      config?.project_impact,
      config?.transmission_wish
    ),
    recipientAnecdote: firstNonEmptyText(
      body.recipientAnecdote,
      config?.signature_anecdote,
      config?.couple_anecdote,
      config?.birth_anecdote,
      config?.trip_highlight,
      config?.biggest_challenge,
      config?.family_legend,
      config?.event_custom_description
    ),
    additionalContext: firstNonEmptyText(
      body.additionalContext,
      body.projectBrief,
      buildAdditionalContextFromBookConfig(config, book)
    )
  };
}

async function generateChaptersFromRequest(body = {}) {
  const variables = buildChapterVariables(body);
  if (!Number.isFinite(variables.count) || variables.count < 1) {
    throw new promptEngine.PromptEngineError(
      'Le nombre de chapitres doit etre superieur a 0.',
      'CHAPTER_COUNT_INVALID',
      400
    );
  }

  const [bookTitleResult, chapterTitlesResult] = await Promise.all([
    promptEngine.runPromptGeneration({
      promptType: 'book_title',
      variables,
      mistralClient: aiService.mistral,
      model: 'mistral-small-latest',
      maxRetries: 2
    }),
    promptEngine.runPromptGeneration({
      promptType: 'chapter_titles',
      variables,
      mistralClient: aiService.mistral,
      model: 'mistral-small-latest',
      maxRetries: 2
    })
  ]);

  const suggestedBookTitle = parseBookTitleOutput(bookTitleResult.output, variables);
  const parsedTitles = parseChapterTitlesOutput(chapterTitlesResult.output)
    .map((title) => sanitizeChapterTitle(title))
    .filter((title) => isLikelyChapterTitleCandidate(title));

  const titles = (parsedTitles.length > 0
    ? parsedTitles
    : buildFallbackChapterTitles(variables, variables.count, chapterTitlesResult.output))
    .slice(0, variables.count);

  const chapters = titles.map((title, index) => ({
    title,
    description: `Chapitre ${index + 1} - Partagez vos souvenirs`,
    order_index: index
  }));

  return {
    chapters,
    suggestedBookTitle,
    promptSource: 'database',
    promptVersion: {
      book_title: bookTitleResult?.template?.version || null,
      chapter_titles: chapterTitlesResult?.template?.version || null
    }
  };
}

router.post('/generate-chapters-public', async (req, res) => {
  try {
    const payload = await generateChaptersFromRequest(req.body || {});
    return res.json(payload);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur generation chapitres.' });
  }
});

router.post('/generate-chapters', authenticate, async (req, res) => {
  try {
    const enrichedBody = await enrichChapterGenerationBody(req.body || {}, req.user?.id);
    const payload = await generateChaptersFromRequest(enrichedBody);
    return res.json(payload);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur generation chapitres.' });
  }
});

router.post('/generate-book-titles-public', async (req, res) => {
  try {
    const incoming = (req.body && typeof req.body === 'object') ? req.body : {};
    const variables = (incoming.variables && typeof incoming.variables === 'object')
      ? incoming.variables
      : incoming;

    const result = await promptEngine.runPromptGeneration({
      promptType: 'book_title',
      variables,
      mistralClient: aiService.mistral,
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      maxRetries: 2
    });

    const suggestions = parseBookTitleSuggestions(result.output, variables);
    const singleTitle = parseBookTitleOutput(result.output, variables);
    if (singleTitle && !suggestions.includes(singleTitle)) {
      suggestions.unshift(singleTitle);
    }

    return res.json({
      suggestions: suggestions.slice(0, 3),
      promptSource: 'database',
      promptVersion: result?.template?.version || null
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur generation titres.' });
  }
});

router.post('/generate-questions', authenticate, async (req, res) => {
  try {
    const questions = await aiService.generateQuestions(req.body || {});
    return res.json({ questions });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur generation questions.' });
  }
});

router.post('/generate-quote', authenticate, async (req, res) => {
  try {
    const quote = await aiService.generateQuote(
      req.body?.chapterTitle,
      req.body?.eventType,
      req.body?.style
    );
    return res.json({ quote });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur generation citation.' });
  }
});

router.post('/generate-introduction', authenticate, async (req, res) => {
  try {
    const content = await aiService.generateNarrativeContent({
      ...(req.body || {}),
      outputType: 'introduction',
      chapterTitle: normalizeText(req.body?.chapterTitle, 'Introduction')
    });
    return res.json({ introduction: content });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur generation introduction.' });
  }
});

router.post('/generate-conclusion', authenticate, async (req, res) => {
  try {
    const content = await aiService.generateNarrativeContent({
      ...(req.body || {}),
      outputType: 'conclusion',
      chapterTitle: normalizeText(req.body?.chapterTitle, 'Conclusion')
    });
    return res.json({ conclusion: content });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur generation conclusion.' });
  }
});

module.exports = router;
