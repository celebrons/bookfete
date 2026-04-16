const supabase = require('../config/supabase');
const promptEngine = require('./promptEngine');
const aiService = require('./aiService');

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function stripWrappingQuotes(value = '') {
  return normalizeText(value)
    .replace(/^["'`«»]+|["'`«»]+$/g, '')
    .trim();
}

function getWordCount(value = '') {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function sanitizeTrigger(value = '') {
  return normalizeText(value)
    .replace(/^[-•*]\s*/g, '')
    .replace(/^["'`«»]+|["'`«»]+$/g, '')
    .trim();
}

function normalizeComparableText(value = '') {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractMeaningfulTokens(value = '') {
  const stopWords = new Set([
    'alors', 'ainsi', 'apres', 'avec', 'avait', 'avoir', 'comme', 'dans', 'depuis',
    'elle', 'elles', 'entre', 'etait', 'etre', 'fait', 'font', 'jour', 'juste',
    'leur', 'leurs', 'mais', 'meme', 'nous', 'pour', 'plus', 'quand', 'sans',
    'sera', 'sont', 'sous', 'tout', 'tous', 'tres', 'une', 'des', 'les', 'ses',
    'son', 'sur', 'que', 'qui', 'quoi', 'vous', 'votre', 'chez', 'cette', 'cet',
    'soir', 'cela', 'avant', 'notre', 'rien', 'moins', 'the', 'and'
  ]);

  return [...new Set(
    normalizeComparableText(value)
      .split(/[^a-z0-9'-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .filter((token) => !stopWords.has(token))
  )];
}

function buildFallbackFormulations({ recipientName = '', narrativePerson = '' } = {}) {
  const safeRecipientName = normalizeText(recipientName, 'cette personne');
  const normalizedNarrativePerson = normalizeText(narrativePerson);

  if (normalizedNarrativePerson === 'group') {
    return [
      `Ce qui donne tout de suite le ton de ${safeRecipientName}, c'est...`,
      `Il y a dans ${safeRecipientName} une facon d'etre qu'on reconnait immediatement, c'est...`,
      `Quand on pense a ${safeRecipientName} dans ce chapitre, l'image qui revient d'abord, c'est...`,
      `S'il fallait garder un seul detail pour raconter ${safeRecipientName} ici, ce serait...`,
      `Dans ce moment-la, ${safeRecipientName} montrait deja quelque chose d'essentiel, c'etait...`
    ];
  }

  return [
    `Ce qu'on remarque d'abord chez ${safeRecipientName}, c'est...`,
    `Il y a chez ${safeRecipientName} une facon d'etre qui revient toujours, c'est...`,
    `Quand je repense a ${safeRecipientName} dans ce chapitre, l'image qui revient d'abord, c'est...`,
    `S'il fallait garder un seul detail pour raconter ${safeRecipientName} ici, ce serait...`,
    `Dans ce moment-la, ${safeRecipientName} avait deja une maniere bien a lui de faire basculer l'atmosphere, c'etait...`
  ];
}

function inferChapterRole({ chapter = {}, currentIndex = 0, chapterTotal = 1 }) {
  const title = normalizeComparableText(chapter?.title);
  const description = normalizeComparableText(chapter?.description);
  const combined = `${title} ${description}`.trim();
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === Math.max(0, chapterTotal - 1);

  if (isLast || /\b(epilogue|conclusion|la suite|demain|apres|ce qui commence|suite commence)\b/.test(combined)) {
    return 'epilogue';
  }
  if (isFirst || /\b(ouverture|introduction|prologue|premiers pas|premiere page)\b/.test(combined)) {
    return 'opening';
  }
  if (/\b(racines|origines|portrait|empreinte|heritage|transmet|transmission)\b/.test(combined)) {
    return 'portrait';
  }
  if (/\b(bande|liens?|amitie|fratrie|groupe|ensemble|solidaires|solides)\b/.test(combined)) {
    return 'collective';
  }
  if (/\b(rires|scenes|legendes|anecdotes|moments|episode|fou rire)\b/.test(combined)) {
    return 'scene';
  }
  if (/\b(virages|courage|defi|bascule|tournant|obstacle|passage|tempete)\b/.test(combined)) {
    return 'transition';
  }
  return 'general';
}

function getChapterRoleGuidance(role = 'general') {
  switch (role) {
    case 'opening':
      return {
        focusHint: 'Installer la presence du destinataire et l entree dans le livre, sans consommer toute l anecdote signature des la premiere ligne.',
        markerPolicy: 'presence_first'
      };
    case 'epilogue':
      return {
        focusHint: 'Ouvrir vers la suite, l elan, la transmission ou ce qui commence apres ce chapitre. Eviter de repartir sur une anecdote precise du passe sauf si le titre l impose explicitement.',
        markerPolicy: 'future_first'
      };
    case 'portrait':
      return {
        focusHint: 'Mettre en avant une facon d etre, une empreinte ou ce qui construit la personne plus qu une scene isolee.',
        markerPolicy: 'trait_first'
      };
    case 'collective':
      return {
        focusHint: 'Faire sentir le lien, le nous, la place du destinataire dans le groupe, sans reduire le chapitre a une anecdote isolee.',
        markerPolicy: 'collective_first'
      };
    case 'scene':
      return {
        focusHint: 'S appuyer sur une scene precise, vivante, visible, avec un detail ou une parole qui ancre le chapitre.',
        markerPolicy: 'scene_first'
      };
    case 'transition':
      return {
        focusHint: 'Saisir un moment de bascule, de courage ou de passage, en restant relie a la progression du livre.',
        markerPolicy: 'transition_first'
      };
    default:
      return {
        focusHint: 'Rester au plus pres du titre du chapitre et des donnees fournies, sans ouvrir de piste generique.',
        markerPolicy: 'balanced'
      };
  }
}

function extractJsonObjectCandidates(rawOutput = '') {
  const cleaned = String(rawOutput || '')
    .replace(/```json|```/gi, '')
    .trim();
  const candidates = [];

  if (cleaned) {
    candidates.push(cleaned);
  }

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0] && objectMatch[0] !== cleaned) {
    candidates.push(objectMatch[0]);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function parseChapterAmorceOutput(rawOutput = '') {
  const candidates = extractJsonObjectCandidates(rawOutput);
  let parsed = null;

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsed = value;
        break;
      }
    } catch (_error) {
      // Try next candidate.
    }
  }

  if (!parsed) {
    throw new promptEngine.PromptEngineError(
      'La sortie amorce n est pas un JSON exploitable.',
      'CHAPTER_AMORCE_JSON_INVALID',
      422
    );
  }

  const amorceText = stripWrappingQuotes(
    parsed.amorce
      || parsed.amorce_text
      || parsed.text
      || parsed.opening
  );
  const triggers = [...new Set(
    (Array.isArray(parsed.triggers) ? parsed.triggers : [])
      .map((trigger) => sanitizeTrigger(trigger))
      .filter(Boolean)
  )].slice(0, 4);

  const amorceWordCount = getWordCount(amorceText);
  if (!amorceText || amorceWordCount < 8 || amorceWordCount > 40 || amorceText.includes('?')) {
    throw new promptEngine.PromptEngineError(
      'La phrase d amorce generee est invalide.',
      'CHAPTER_AMORCE_TEXT_INVALID',
      422,
      {
        amorcePreview: amorceText,
        wordCount: amorceWordCount
      }
    );
  }

  if (triggers.length < 3) {
    throw new promptEngine.PromptEngineError(
      'Les mots declencheurs generes sont insuffisants.',
      'CHAPTER_AMORCE_TRIGGERS_INVALID',
      422,
      { triggers }
    );
  }

  return {
    amorceText,
    triggers
  };
}

function validateRoleScopedAmorce({
  amorceText = '',
  triggers = [],
  chapterRole = 'general',
  fullSignatureAnecdote = '',
  scopedSignatureAnecdote = '',
  fullSignaturePhrase = '',
  scopedSignaturePhrase = ''
} = {}) {
  const combinedOutput = normalizeComparableText([
    amorceText,
    ...(Array.isArray(triggers) ? triggers : [])
  ].join(' '));

  if (
    ['epilogue', 'collective', 'portrait'].includes(chapterRole)
    && /\bce\s+(soir|jour)[- ]la\b/.test(combinedOutput)
  ) {
    throw new promptEngine.PromptEngineError(
      'L amorce generee ne correspond pas au role narratif attendu pour ce chapitre.',
      'CHAPTER_AMORCE_ROLE_INVALID',
      422,
      { chapterRole, amorcePreview: amorceText }
    );
  }

  const omittedPhrase = normalizeComparableText(fullSignaturePhrase);
  const visiblePhrase = normalizeComparableText(scopedSignaturePhrase);
  if (omittedPhrase && !visiblePhrase && combinedOutput.includes(omittedPhrase)) {
    throw new promptEngine.PromptEngineError(
      'L amorce reutilise une expression signature qui ne doit pas guider ce chapitre.',
      'CHAPTER_AMORCE_MARKER_LEAK',
      422,
      { chapterRole, leakedMarker: fullSignaturePhrase }
    );
  }

  const omittedAnecdote = normalizeComparableText(fullSignatureAnecdote);
  const visibleAnecdote = normalizeComparableText(scopedSignatureAnecdote);
  if (omittedAnecdote && !visibleAnecdote) {
    const anecdoteTokens = extractMeaningfulTokens(fullSignatureAnecdote);
    const strongTokenLeak = anecdoteTokens.some((token) => token.length >= 7 && combinedOutput.includes(token));
    const tokenLeakCount = anecdoteTokens.filter((token) => combinedOutput.includes(token)).length;

    if (strongTokenLeak || tokenLeakCount >= 2) {
      throw new promptEngine.PromptEngineError(
        'L amorce reutilise une anecdote signature qui ne doit pas structurer ce chapitre.',
        'CHAPTER_AMORCE_MARKER_LEAK',
        422,
        {
          chapterRole,
          leakedMarker: fullSignatureAnecdote,
          leakedTokenCount: tokenLeakCount
        }
      );
    }
  }
}

function buildChapterAmorceVariables({
  book = {},
  config = {},
  chapter = {},
  orderedChapters = []
}) {
  const safeChapters = Array.isArray(orderedChapters) ? orderedChapters : [];
  const chapterOrderIndex = Number(chapter?.order_index);
  const currentIndex = Number.isFinite(chapterOrderIndex)
    ? chapterOrderIndex
    : Math.max(0, safeChapters.findIndex((item) => item?.id === chapter?.id));
  const previousChapter = safeChapters
    .filter((item) => Number(item?.order_index) < currentIndex)
    .slice(-1)[0] || null;
  const nextChapter = safeChapters
    .find((item) => Number(item?.order_index) > currentIndex) || null;

  const recipientName = normalizeText(config?.recipient_name || book?.recipient_name);
  const recipientNickname = normalizeText(config?.recipient_nickname);
  const characterTrait = normalizeText(config?.character_trait);
  const signatureAnecdote = normalizeText(config?.signature_anecdote);
  const signaturePhrase = normalizeText(config?.signature_phrase);
  const futureWish = normalizeText(config?.future_wish);
  const narrativePerson = normalizeText(config?.narrative_person, 'third_person');
  const chapterRole = inferChapterRole({
    chapter,
    currentIndex,
    chapterTotal: safeChapters.length || 1
  });
  const { focusHint, markerPolicy } = getChapterRoleGuidance(chapterRole);
  const scopedAnecdote = chapterRole === 'scene' ? signatureAnecdote : '';
  const scopedPhrase = ['opening', 'scene'].includes(chapterRole) ? signaturePhrase : '';
  const scopedFutureWish = ['epilogue', 'portrait', 'transition'].includes(chapterRole) ? futureWish : '';
  const hasPersonalMarkers = [characterTrait, scopedAnecdote, scopedPhrase].some(Boolean);
  const generationMode = hasPersonalMarkers ? 'A' : 'B';
  const fallbackFormulations = buildFallbackFormulations({
    recipientName: recipientNickname || recipientName,
    narrativePerson
  });

  return {
    book_title: normalizeText(book?.title),
    event_type: normalizeText(config?.event_type || book?.event_type),
    event_subtype: normalizeText(config?.event_subtype),
    narrative_person: narrativePerson,
    recipient_name: recipientName,
    recipient_nickname: recipientNickname,
    character_trait: characterTrait,
    signature_anecdote: scopedAnecdote,
    signature_phrase: scopedPhrase,
    future_wish: scopedFutureWish,
    chapter_index: currentIndex + 1,
    chapter_total: safeChapters.length || 1,
    chapter_title: normalizeText(chapter?.title, 'Chapitre'),
    chapter_theme: normalizeText(chapter?.theme),
    chapter_arc: normalizeText(chapter?.arc),
    prev_chapter_title: normalizeText(previousChapter?.title),
    next_chapter_title: normalizeText(nextChapter?.title),
    chapter_role: chapterRole,
    chapter_focus_hint: focusHint,
    marker_policy: markerPolicy,
    generation_mode: generationMode,
    fallback_formulations: generationMode === 'B' ? fallbackFormulations : []
  };
}

async function getChapterAmorceContext(chapterId, ownerId) {
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('*, book:books(*)')
    .eq('id', chapterId)
    .maybeSingle();

  if (chapterError) {
    throw chapterError;
  }
  if (!chapter?.id || !chapter?.book?.id) {
    throw new promptEngine.PromptEngineError(
      'Chapitre introuvable.',
      'CHAPTER_NOT_FOUND',
      404
    );
  }
  if (ownerId && chapter.book.owner_id !== ownerId) {
    throw new promptEngine.PromptEngineError(
      'Acces refuse a ce chapitre.',
      'CHAPTER_FORBIDDEN',
      403
    );
  }

  const [{ data: config, error: configError }, { data: orderedChapters, error: chaptersError }] = await Promise.all([
    supabase
      .from('book_configs')
      .select('*')
      .eq('book_id', chapter.book.id)
      .maybeSingle(),
    supabase
      .from('chapters')
      .select('*')
      .eq('book_id', chapter.book.id)
      .order('order_index', { ascending: true })
  ]);

  if (configError) {
    throw configError;
  }
  if (chaptersError) {
    throw chaptersError;
  }

  return {
    chapter,
    book: chapter.book,
    config: config || {},
    orderedChapters: Array.isArray(orderedChapters) ? orderedChapters : []
  };
}

async function runChapterAmorceGeneration({
  book,
  config,
  chapter,
  orderedChapters,
  model = '',
  force = false
}) {
  if (chapter?.amorce_validated && !force) {
    throw new promptEngine.PromptEngineError(
      'Cette amorce est deja validee. Confirmez la regeneration pour la remplacer.',
      'CHAPTER_AMORCE_VALIDATED',
      409
    );
  }

  const variables = buildChapterAmorceVariables({
    book,
    config,
    chapter,
    orderedChapters
  });
  const roleValidationContext = {
    chapterRole: variables.chapter_role,
    fullSignatureAnecdote: normalizeText(config?.signature_anecdote),
    scopedSignatureAnecdote: normalizeText(variables.signature_anecdote),
    fullSignaturePhrase: normalizeText(config?.signature_phrase),
    scopedSignaturePhrase: normalizeText(variables.signature_phrase)
  };

  let lastParsingError = null;
  let lastResult = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    lastResult = await promptEngine.runPromptGeneration({
      promptType: 'chapter_amorce',
      variables,
      mistralClient: aiService.mistral,
      model: normalizeText(model, process.env.MISTRAL_MODEL || 'mistral-small-latest'),
      maxRetries: 2
    });

    try {
      const parsed = parseChapterAmorceOutput(lastResult.output);
      validateRoleScopedAmorce({
        ...parsed,
        ...roleValidationContext
      });
      return {
        ...parsed,
        variables,
        promptVersion: lastResult?.template?.version || null,
        rawOutput: lastResult.output
      };
    } catch (error) {
      lastParsingError = error;
    }
  }

  throw lastParsingError || new promptEngine.PromptEngineError(
    'Impossible de parser l amorce du chapitre.',
    'CHAPTER_AMORCE_PARSE_FAILED',
    422,
    { outputPreview: String(lastResult?.output || '').slice(0, 1200) }
  );
}

async function persistChapterAmorce(chapterId, amorcePayload, options = {}) {
  const nowIso = new Date().toISOString();
  const updatePayload = {
    amorce_text: normalizeText(amorcePayload?.amorceText) || null,
    triggers: Array.isArray(amorcePayload?.triggers) ? amorcePayload.triggers : [],
    amorce_generated_at: nowIso,
    amorce_validated: false,
    questions_validated: false
  };

  if (Object.prototype.hasOwnProperty.call(options, 'amorceValidated')) {
    updatePayload.amorce_validated = Boolean(options.amorceValidated);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'questionsValidated')) {
    updatePayload.questions_validated = Boolean(options.questionsValidated);
  }

  const { data, error } = await supabase
    .from('chapters')
    .update(updatePayload)
    .eq('id', chapterId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  parseChapterAmorceOutput,
  validateRoleScopedAmorce,
  buildChapterAmorceVariables,
  getChapterAmorceContext,
  runChapterAmorceGeneration,
  persistChapterAmorce
};
