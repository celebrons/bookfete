const supabase = require('../config/supabase');
const promptEngine = require('./promptEngine');
const aiService = require('./aiService');

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';

const INLINE_DIRECTIVES_START = '[DIRECTIVES_TESTEUR_INLINE]';
const INLINE_DIRECTIVES_END = '[/DIRECTIVES_TESTEUR_INLINE]';

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

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhotoUrls(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (typeof value[0] === 'string') {
      return cleanText(value.join(', '), 140);
    }
    return `${value.length} element(s)`;
  }
  if (value && typeof value === 'object') {
    return `${Object.keys(value).length} champ(s)`;
  }
  return cleanText(value, 140);
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

  return orderedNames.map((name) => {
    const value = resolveVariableValue(variables, name);
    return {
      name,
      required: directVariables.has(name) || loopVariables.has(name),
      hasValue: hasRenderableValue(value),
      preview: formatVariableValuePreview(value)
    };
  });
}

function collectChapterPhotos({ organizerContribution = null, guestContributions = [] } = {}) {
  const organizerPhotos = Array.isArray(organizerContribution?.photoUrls)
    ? organizerContribution.photoUrls
    : [];
  const guestPhotos = Array.isArray(guestContributions)
    ? guestContributions.flatMap((contribution) => (
      Array.isArray(contribution?.photoUrls) ? contribution.photoUrls : []
    ))
    : [];

  return [...new Set(
    [...organizerPhotos, ...guestPhotos]
      .map((url) => normalizeText(url))
      .filter(Boolean)
  )];
}

function evaluateContributionsRichness(contributions = []) {
  const safeContributions = Array.isArray(contributions) ? contributions : [];
  if (safeContributions.length === 0) return 'faible';

  const longResponses = safeContributions.filter((item) => (
    normalizeText(item?.response_text).split(/\s+/).filter(Boolean).length >= 100
  )).length;

  const shortResponses = safeContributions.filter((item) => (
    normalizeText(item?.response_text).split(/\s+/).filter(Boolean).length < 50
  )).length;

  if (safeContributions.length >= 6 && longResponses >= 6) {
    return 'riche';
  }

  if (safeContributions.length < 3 || shortResponses >= safeContributions.length) {
    return 'faible';
  }

  return 'moyenne';
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

function applyInlineDirectivesToDataBlock(dataBlock = '', directives = '') {
  const source = String(dataBlock || '');
  const startMarker = escapeRegExp(INLINE_DIRECTIVES_START);
  const endMarker = escapeRegExp(INLINE_DIRECTIVES_END);
  const withoutExistingBlock = source.replace(
    new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g'),
    ''
  ).trim();

  const directiveBlock = buildPromptDirectiveBlock(directives);
  if (!directiveBlock) {
    return withoutExistingBlock;
  }

  return [withoutExistingBlock, directiveBlock].filter(Boolean).join('\n\n');
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

function buildInlineTemplateLabel(label = '') {
  const baseLabel = normalizeText(label, 'Texte du chapitre')
    .replace(/\s*-\s*inline$/i, '')
    .trim();
  return `${baseLabel} - inline`;
}

function buildChapterPromptVariables(sourcePayload, chapterTitle = '', chapterSummary = '') {
  const book = sourcePayload?.book || {};
  const config = sourcePayload?.config || {};
  const chapter = sourcePayload?.chapter || {};
  const organizerContribution = chapter?.organizerContribution || null;
  const guestContributions = Array.isArray(chapter?.guestContributions)
    ? chapter.guestContributions
    : [];

  const promptContributions = [];
  if (organizerContribution?.message) {
    promptContributions.push({
      name: 'Organisateur',
      role: 'organisateur',
      response_text: cleanText(organizerContribution.message, 5000)
    });
  }

  guestContributions.forEach((contribution) => {
    const responseText = cleanText(contribution?.message, 5000);
    if (!responseText) return;
    promptContributions.push({
      name: cleanText(contribution?.contributorName, 180) || 'Contributeur',
      role: cleanText(contribution?.role, 180) || 'proche',
      response_text: responseText
    });
  });

  const chapterPhotos = collectChapterPhotos({
    organizerContribution: organizerContribution
      ? { photoUrls: normalizePhotoUrls(organizerContribution.photoUrls) }
      : null,
    guestContributions
  }).slice(0, 24);

  const promptPhotos = chapterPhotos.map((url, index) => ({
    caption: `Photo ${index + 1}`,
    date: null,
    url
  }));
  const contributionsText = promptContributions
    .map((entry) => `${cleanText(entry?.name, 160) || 'Contributeur'} (${cleanText(entry?.role, 120) || 'proche'}) : ${cleanText(entry?.response_text, 700)}`)
    .filter(Boolean)
    .join('\n');
  const photosText = promptPhotos
    .map((entry) => cleanText([entry.caption, entry.date].filter(Boolean).join(' '), 160))
    .filter(Boolean)
    .join('\n');

  const normalizedEventType = cleanText(config?.eventType || book.eventType, 160) || 'evenement';
  const normalizedEventSubtype = cleanText(config?.eventSubtype, 160) || '';
  const normalizedNarrativePerson = cleanText(config?.narrativePerson, 120) || 'third_person';
  const normalizedRecipientName = cleanText(book.recipientName, 160) || 'la personne celebree';
  const normalizedRecipientNickname = cleanText(config?.recipientNickname, 160) || '';
  const normalizedCharacterTrait = cleanText(config?.characterTrait, 220) || '';
  const normalizedSignatureAnecdote = cleanText(config?.signatureAnecdote, 500) || '';
  const normalizedSignaturePhrase = cleanText(config?.signaturePhrase, 220) || '';
  const normalizedFutureWish = cleanText(config?.futureWish, 320) || '';
  const normalizedChapterTitle = cleanText(chapterTitle || chapter.title, 180) || 'Chapitre';
  const normalizedChapterTheme = cleanText(chapter.description, 700) || normalizedChapterTitle || 'Souvenirs marquants';
  const normalizedChapterArc = cleanText(chapterSummary, 1200) || '';
  const normalizedChapterEmotion = cleanText(book.styleNarratif, 120) || 'intime';
  const normalizedBookTitle = cleanText(book.title, 180) || 'Livre souvenir';
  const normalizedBookTone = cleanText(book.styleNarratif, 120) || 'intime';
  const normalizedBookLocation = cleanText(book.location, 140) || '';
  const normalizedBookYear = cleanText(book.year, 40) || String(new Date().getFullYear());
  const normalizedRecipientAge = cleanText(book.recipientAge, 80) || 'non specifie';
  const normalizedPrevChapterTitle = cleanText(chapter.previousTitle, 180) || '';
  const normalizedNextChapterTitle = cleanText(chapter.nextTitle, 180) || '';
  const normalizedChapterAmorce = cleanText(chapter.amorceText, 320) || '';
  const normalizedChapterTriggers = Array.isArray(chapter.triggers)
    ? chapter.triggers.map((trigger) => cleanText(trigger, 80)).filter(Boolean)
    : [];
  const chapterIndex = Number(chapter.orderIndex || 0) + 1;
  const chapterTotal = Number(chapter.chapterTotal || sourcePayload?.book?.chapterTotal || 0) || 0;
  const contributionsCount = promptContributions.length;
  const contributionsRichness = evaluateContributionsRichness(promptContributions);

  return {
    book_title: cleanText(book.title, 180) || 'Livre souvenir',
    book_occasion: normalizedEventType,
    event_type: normalizedEventType,
    event_subtype: normalizedEventSubtype,
    narrative_person: normalizedNarrativePerson,
    recipient_name: normalizedRecipientName,
    recipient_nickname: normalizedRecipientNickname,
    recipient_age: normalizedRecipientAge,
    book_tone: normalizedBookTone,
    book_location: normalizedBookLocation,
    book_year: normalizedBookYear,
    chapter_total: chapterTotal,
    chapter_index: chapterIndex,
    chapter_title: normalizedChapterTitle,
    chapter_theme: normalizedChapterTheme,
    chapter_arc: normalizedChapterArc,
    chapter_emotion: normalizedChapterEmotion,
    prev_chapter_title: normalizedPrevChapterTitle,
    next_chapter_title: normalizedNextChapterTitle,
    character_trait: normalizedCharacterTrait,
    signature_anecdote: normalizedSignatureAnecdote,
    signature_phrase: normalizedSignaturePhrase,
    future_wish: normalizedFutureWish,
    chapter_amorce: normalizedChapterAmorce,
    chapter_triggers: normalizedChapterTriggers,
    contributions_count: contributionsCount,
    contributions_richness: contributionsRichness,
    contributions: promptContributions,
    photos: promptPhotos,
    contributions_text: contributionsText,
    contributionstext: contributionsText,
    contributionsText: contributionsText,
    photos_text: photosText,
    photostext: photosText,
    photosText: photosText,

    bookTitle: normalizedBookTitle,
    bookOccasion: normalizedEventType,
    eventType: normalizedEventType,
    eventSubtype: normalizedEventSubtype,
    narrativePerson: normalizedNarrativePerson,
    recipientName: normalizedRecipientName,
    recipientNickname: normalizedRecipientNickname,
    recipientAge: normalizedRecipientAge,
    bookTone: normalizedBookTone,
    bookLocation: normalizedBookLocation,
    bookYear: normalizedBookYear,
    chapterTotal: chapterTotal,
    chapterIndex: chapterIndex,
    chapterTitle: normalizedChapterTitle,
    chapterTheme: normalizedChapterTheme,
    chapterArc: normalizedChapterArc,
    chapterEmotion: normalizedChapterEmotion,
    prevChapterTitle: normalizedPrevChapterTitle,
    nextChapterTitle: normalizedNextChapterTitle,
    characterTrait: normalizedCharacterTrait,
    signatureAnecdote: normalizedSignatureAnecdote,
    signaturePhrase: normalizedSignaturePhrase,
    futureWish: normalizedFutureWish,
    chapterAmorce: normalizedChapterAmorce,
    chapterTriggers: normalizedChapterTriggers,
    contributionsCount: contributionsCount,
    contributionsRichness: contributionsRichness,
    contributionsText: contributionsText,
    photosText: photosText
  };
}

async function getChapterPromptAdminContext(chapterId, ownerId = '', ownerEmail = '') {
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('*, book:books(*)')
    .eq('id', chapterId)
    .maybeSingle();

  if (chapterError) {
    throw new promptEngine.PromptEngineError(
      `Erreur lecture chapitre: ${chapterError.message}`,
      'CHAPTER_PROMPT_ADMIN_CHAPTER_READ_FAILED',
      500
    );
  }

  if (!chapter?.id || !chapter?.book?.id) {
    throw new promptEngine.PromptEngineError(
      'Chapitre introuvable.',
      'CHAPTER_PROMPT_ADMIN_NOT_FOUND',
      404
    );
  }

  if (ownerId && chapter.book.owner_id !== ownerId) {
    throw new promptEngine.PromptEngineError(
      'Acces refuse a ce chapitre.',
      'CHAPTER_PROMPT_ADMIN_FORBIDDEN',
      403
    );
  }

  const [{ data: config, error: configError }, { data: orderedChapters, error: orderedChaptersError }, { data: contributions, error: contributionsError }, { data: invites, error: invitesError }] = await Promise.all([
    supabase.from('book_configs').select('*').eq('book_id', chapter.book.id).maybeSingle(),
    supabase.from('chapters').select('*').eq('book_id', chapter.book.id).order('order_index', { ascending: true }),
    supabase.from('contributions').select('*').eq('chapter_id', chapter.id).order('created_at', { ascending: true }),
    supabase.from('chapter_invites').select('*').eq('chapter_id', chapter.id)
  ]);

  if (configError) {
    throw new promptEngine.PromptEngineError(
      `Erreur lecture configuration livre: ${configError.message}`,
      'CHAPTER_PROMPT_ADMIN_CONFIG_READ_FAILED',
      500
    );
  }
  if (orderedChaptersError) {
    throw new promptEngine.PromptEngineError(
      `Erreur lecture chapitres du livre: ${orderedChaptersError.message}`,
      'CHAPTER_PROMPT_ADMIN_ORDERED_READ_FAILED',
      500
    );
  }
  if (contributionsError) {
    throw new promptEngine.PromptEngineError(
      `Erreur lecture contributions: ${contributionsError.message}`,
      'CHAPTER_PROMPT_ADMIN_CONTRIBUTIONS_READ_FAILED',
      500
    );
  }
  if (invitesError) {
    throw new promptEngine.PromptEngineError(
      `Erreur lecture invitations: ${invitesError.message}`,
      'CHAPTER_PROMPT_ADMIN_INVITES_READ_FAILED',
      500
    );
  }

  const safeOrderedChapters = Array.isArray(orderedChapters) ? orderedChapters : [];
  const currentOrderIndex = Number(chapter.order_index || 0);
  const previousChapter = safeOrderedChapters
    .filter((item) => Number(item?.order_index || 0) < currentOrderIndex)
    .slice(-1)[0] || null;
  const nextChapter = safeOrderedChapters
    .find((item) => Number(item?.order_index || 0) > currentOrderIndex) || null;

  const organizerEmailKey = normalizeEmail(ownerEmail);
  const safeContributions = Array.isArray(contributions) ? contributions : [];
  const organizerContribution = safeContributions
    .filter((contribution) => (
      organizerEmailKey
      && normalizeEmail(contribution?.contributor_email) === organizerEmailKey
      && contribution.is_finalized !== false
    ))
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] || null;

  const guestContributions = safeContributions
    .filter((contribution) => {
      const normalizedEmail = normalizeEmail(contribution?.contributor_email);
      return (
        normalizedEmail
        && normalizedEmail !== organizerEmailKey
        && normalizedEmail !== CHAPTER_STATE_EMAIL
        && normalizedEmail !== CHAPTER_DRAFT_EMAIL
        && contribution.approved === true
        && contribution.is_finalized !== false
        && !contribution.needs_revision
      );
    })
    .map((contribution) => ({
      contributorName:
        cleanText(contribution.contributor_name, 180)
        || cleanText(normalizeEmail(contribution.contributor_email).split('@')[0], 180)
        || 'Contributeur',
      role: 'proche',
      message: cleanText(contribution.message, 2400),
      photoUrls: normalizePhotoUrls(contribution.photo_urls),
      createdAt: contribution?.created_at || null
    }));

  const eventDate = normalizeText(config?.event_date);
  const bookSource = {
    id: chapter.book.id,
    title: cleanText(chapter.book.title, 180) || 'Livre souvenir',
    recipientName: cleanText(config?.recipient_name || chapter.book.recipient_name, 180) || 'la personne celebree',
    recipientAge: cleanText(config?.recipient_age || chapter.book.recipient_age, 80) || '',
    recipientGender: cleanText(config?.recipient_gender || chapter.book.recipient_gender, 120) || '',
    eventType: cleanText(config?.event_type || chapter.book.event_type, 120) || 'evenement',
    styleNarratif: cleanText(config?.narrative_style || chapter.book.style_narratif, 120) || 'intime',
    location: cleanText(config?.event_location || chapter.book.location, 140) || '',
    year: eventDate ? String(new Date(eventDate).getFullYear()) : String(new Date().getFullYear()),
    chapterTotal: safeOrderedChapters.length
  };

  const sourcePayload = {
    book: bookSource,
    config: {
      eventType: cleanText(config?.event_type || chapter.book.event_type, 120) || 'evenement',
      eventSubtype: cleanText(config?.event_subtype, 120) || '',
      narrativePerson: cleanText(config?.narrative_person, 120) || 'third_person',
      recipientNickname: cleanText(config?.recipient_nickname, 160) || '',
      characterTrait: cleanText(config?.character_trait, 220) || '',
      signatureAnecdote: cleanText(config?.signature_anecdote, 500) || '',
      signaturePhrase: cleanText(config?.signature_phrase, 220) || '',
      futureWish: cleanText(config?.future_wish, 320) || ''
    },
    chapter: {
      id: chapter.id,
      orderIndex: currentOrderIndex,
      chapterTotal: safeOrderedChapters.length,
      title: cleanText(chapter.title, 180) || 'Chapitre',
      description: cleanText(chapter.description, 700),
      previousTitle: cleanText(previousChapter?.title, 180),
      nextTitle: cleanText(nextChapter?.title, 180),
      amorceText: cleanText(chapter.amorce_text, 320),
      triggers: Array.isArray(chapter.triggers)
        ? chapter.triggers.map((trigger) => cleanText(trigger, 80)).filter(Boolean)
        : [],
      organizerContribution: organizerContribution
        ? {
            message: cleanText(organizerContribution.message, 3200),
            photoUrls: normalizePhotoUrls(organizerContribution.photo_urls),
            createdAt: organizerContribution?.created_at || null
          }
        : null,
      guestContributions,
      stats: {
        invitedCount: Array.isArray(invites) ? invites.length : 0,
        respondedCount: Array.isArray(invites)
          ? invites.filter((invite) => invite.accepted || invite.contributed).length
          : 0
      }
    }
  };

  const variables = buildChapterPromptVariables(
    sourcePayload,
    sourcePayload.chapter.title,
    sourcePayload.chapter.description
  );
  const activeTemplate = await promptEngine.getActivePromptTemplate('chapter_body');
  const directives = extractInlineDirectives(activeTemplate?.data_block || '', activeTemplate);
  const templateVariables = extractPromptVariableMeta(activeTemplate, variables);

  return {
    chapter,
    book: chapter.book,
    config: config || {},
    sourcePayload,
    variables,
    templateVariables,
    activeTemplate,
    directives,
    contextSummary: {
      bookTitle: variables.book_title,
      chapterTitle: variables.chapter_title,
      tone: variables.book_tone,
      eventType: variables.book_occasion,
      chapterIndex: variables.chapter_index,
      chapterTotal: variables.chapter_total
    }
  };
}

function buildChapterBodyPromptTemplateWithDirectives(activeTemplate, directives = '') {
  const normalizedDirectives = normalizeText(directives);
  if (!normalizedDirectives) {
    return {
      ...activeTemplate
    };
  }

  return {
    ...activeTemplate,
    data_block: normalizedDirectives,
    output_format: '',
    min_words: 0,
    max_words: 0
  };
}

async function testInlineChapterBodyPrompt({
  chapterId,
  ownerId,
  ownerEmail,
  directives = '',
  model = 'mistral-small-latest'
}) {
  const context = await getChapterPromptAdminContext(chapterId, ownerId, ownerEmail);
  const template = buildChapterBodyPromptTemplateWithDirectives(context.activeTemplate, directives);
  const templateVariables = extractPromptVariableMeta(template, context.variables);
  const result = await promptEngine.testPromptTemplate({
    template,
    variables: context.variables,
    mistralClient: aiService.mistral,
    runModel: true,
    model
  });

  return {
    ...context,
    template,
    templateVariables,
    result
  };
}

async function publishInlineChapterBodyPrompt({
  chapterId,
  ownerId,
  ownerEmail,
  directives = '',
  createdBy = ''
}) {
  const context = await getChapterPromptAdminContext(chapterId, ownerId, ownerEmail);
  const activeTemplate = context.activeTemplate;
  const nextTemplatePayload = {
    type: 'chapter_body',
    label: buildInlineTemplateLabel(activeTemplate?.label),
    status: 'draft',
    system_prompt: activeTemplate?.system_prompt || '',
    context_block: activeTemplate?.context_block || '',
    data_block: normalizeText(directives),
    output_format: '',
    forbidden_phrases: Array.isArray(activeTemplate?.forbidden_phrases) ? activeTemplate.forbidden_phrases : [],
    min_words: 0,
    max_words: 0
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
  getChapterPromptAdminContext,
  testInlineChapterBodyPrompt,
  publishInlineChapterBodyPrompt
};
