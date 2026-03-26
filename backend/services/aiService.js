const { Mistral } = require('@mistralai/mistralai');
const promptEngine = require('./promptEngine');

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.error('MISTRAL_API_KEY manquante dans .env');
}

const mistral = new Mistral({ apiKey });

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

function normalizeQuestionText(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function parseQuestionsFromModelOutput(rawOutput = '') {
  const source = String(rawOutput || '').replace(/```json|```/gi, '').trim();
  if (!source) return [];

  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeQuestionText).filter(Boolean);
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.questions)) {
        return parsed.questions.map(normalizeQuestionText).filter(Boolean);
      }
      if (Array.isArray(parsed.items)) {
        return parsed.items.map(normalizeQuestionText).filter(Boolean);
      }
    }
  } catch (_error) {
    // Fallback below.
  }

  const fromLines = [];
  const numberedLineRegex = /(?:^|\n)\s*(?:[-*•]?\s*)?(?:\d+[\)\.\-]|Question\s*\d+\s*[:\-])\s*(.+)/gi;
  let match = numberedLineRegex.exec(source);
  while (match) {
    const normalized = normalizeQuestionText(match[1]);
    if (normalized) {
      fromLines.push(normalized);
    }
    match = numberedLineRegex.exec(source);
  }

  return fromLines;
}

function getPronouns(gender = '') {
  const normalizedGender = normalizeText(gender).toLowerCase();
  if (normalizedGender === 'homme' || normalizedGender === 'male') {
    return {
      pronoun: 'cet homme',
      subjectPronoun: 'il',
      possessive: 'son'
    };
  }
  if (normalizedGender === 'femme' || normalizedGender === 'female') {
    return {
      pronoun: 'cette femme',
      subjectPronoun: 'elle',
      possessive: 'sa'
    };
  }
  return {
    pronoun: 'cette personne',
    subjectPronoun: 'iel',
    possessive: 'sa'
  };
}

function resolveAgeContext(age, pronoun) {
  const numericAge = Number(age);
  if (!Number.isFinite(numericAge)) return '';
  if (numericAge < 18) return `${pronoun} est un mineur de ${numericAge} ans`;
  if (numericAge < 30) return `${pronoun} est un jeune adulte de ${numericAge} ans`;
  if (numericAge < 50) return `${pronoun} est adulte de ${numericAge} ans`;
  if (numericAge < 70) return `${pronoun} est un senior de ${numericAge} ans`;
  return `${pronoun} est un veteran de ${numericAge} ans`;
}

function resolveStyleInstruction(style) {
  const normalizedStyle = normalizeText(style).toLowerCase();
  if (normalizedStyle === 'poetique') return 'Style lyrique, elegant et image.';
  if (normalizedStyle === 'factuel') return 'Style direct, concret et structurant.';
  if (normalizedStyle === 'humour') return 'Style complice, leger et chaleureux.';
  return 'Style chaleureux, personnel et confidentiel.';
}

function resolveNarrativePromptType(outputType = '') {
  const normalizedOutputType = normalizeText(outputType).toLowerCase();
  if (normalizedOutputType === 'introduction') return 'book_introduction';
  if (normalizedOutputType === 'conclusion') return 'book_conclusion';
  return 'frame_texts';
}

async function generateQuestions(params = {}) {
  const {
    chapterTitle = 'Chapitre',
    eventType = 'generique',
    style = 'intime',
    bookTitle = 'Livre souvenir',
    recipientName = 'la personne celebree',
    recipientAge = 'non specifie',
    recipientGender = 'non specifie',
    recipientNickname = '',
    recipientTrait = '',
    recipientAnecdote = '',
    additionalContext = ''
  } = params;

  const pronouns = getPronouns(recipientGender);
  const ageContext = resolveAgeContext(recipientAge, pronouns.pronoun);
  const variables = {
    eventType: normalizeText(eventType, 'generique'),
    style: normalizeText(style, 'intime'),
    bookTitle: normalizeText(bookTitle, 'Livre souvenir'),
    chapterTitle: normalizeText(chapterTitle, 'Chapitre'),
    recipientName: normalizeText(recipientName, 'la personne celebree'),
    recipientAge: normalizeText(recipientAge, 'non specifie'),
    recipientGender: normalizeText(recipientGender, 'non specifie'),
    recipientNickname: normalizeText(recipientNickname),
    recipientTrait: normalizeText(recipientTrait),
    recipientAnecdote: normalizeText(recipientAnecdote),
    additionalContext: normalizeText(additionalContext),
    pronoun: pronouns.pronoun,
    subjectPronoun: pronouns.subjectPronoun,
    possessive: pronouns.possessive,
    ageContext,
    styleInstruction: resolveStyleInstruction(style)
  };

  const result = await promptEngine.runPromptGeneration({
    promptType: 'contributor_questions',
    variables,
    mistralClient: mistral,
    model: 'mistral-small-latest',
    maxRetries: 2
  });

  const questions = parseQuestionsFromModelOutput(result.output);
  if (questions.length === 0) {
    throw new promptEngine.PromptEngineError(
      'La sortie du modele ne contient aucune question exploitable.',
      'QUESTION_OUTPUT_EMPTY',
      422
    );
  }

  return questions.slice(0, 4);
}

async function generateNarrativeContent(params = {}) {
  const {
    outputType = 'frame',
    eventType = 'generique',
    eventSubtype = '',
    style = 'intime',
    bookTitle = 'Livre souvenir',
    chapterTitle = 'Chapitre',
    recipientName = 'la personne celebree',
    recipientNickname = '',
    recipientAge = 'non specifie',
    recipientGender = 'non specifie',
    narrativePerson = '',
    characterTrait = '',
    signatureAnecdote = '',
    signaturePhrase = '',
    futureWish = '',
    eventDate = '',
    eventLocation = '',
    chapterTitles = [],
    chapterSummary = '',
    narrativeContext = '',
    targetLength = ''
  } = params;

  const variables = {
    output_type: normalizeText(outputType, 'frame'),
    eventType: normalizeText(eventType, 'generique'),
    eventSubtype: normalizeText(eventSubtype),
    style: normalizeText(style, 'intime'),
    bookTitle: normalizeText(bookTitle, 'Livre souvenir'),
    chapterTitle: normalizeText(chapterTitle, 'Chapitre'),
    recipientName: normalizeText(recipientName, 'la personne celebree'),
    recipientNickname: normalizeText(recipientNickname),
    recipientAge: normalizeText(recipientAge, 'non specifie'),
    recipientGender: normalizeText(recipientGender, 'non specifie'),
    narrativePerson: normalizeText(narrativePerson),
    characterTrait: normalizeText(characterTrait),
    signatureAnecdote: normalizeText(signatureAnecdote),
    signaturePhrase: normalizeText(signaturePhrase),
    futureWish: normalizeText(futureWish),
    eventDate: normalizeText(eventDate),
    eventLocation: normalizeText(eventLocation),
    chapterTitles: Array.isArray(chapterTitles) ? chapterTitles.map((item) => normalizeText(item)).filter(Boolean) : [],
    chapterTitlesText: Array.isArray(chapterTitles) ? chapterTitles.map((item) => normalizeText(item)).filter(Boolean).join('\n') : '',
    chapterSummary: normalizeText(chapterSummary),
    narrativeContext: normalizeText(narrativeContext),
    targetLength: normalizeText(targetLength),

    outputType: normalizeText(outputType, 'frame'),
    event_type: normalizeText(eventType, 'generique'),
    event_subtype: normalizeText(eventSubtype),
    book_title: normalizeText(bookTitle, 'Livre souvenir'),
    chapter_title: normalizeText(chapterTitle, 'Chapitre'),
    recipient_name: normalizeText(recipientName, 'la personne celebree'),
    recipient_nickname: normalizeText(recipientNickname),
    recipient_age: normalizeText(recipientAge, 'non specifie'),
    recipient_gender: normalizeText(recipientGender, 'non specifie'),
    narrative_person: normalizeText(narrativePerson),
    character_trait: normalizeText(characterTrait),
    signature_anecdote: normalizeText(signatureAnecdote),
    signature_phrase: normalizeText(signaturePhrase),
    future_wish: normalizeText(futureWish),
    event_date: normalizeText(eventDate),
    event_location: normalizeText(eventLocation),
    chapter_titles: Array.isArray(chapterTitles) ? chapterTitles.map((item) => normalizeText(item)).filter(Boolean) : [],
    chapter_titles_text: Array.isArray(chapterTitles) ? chapterTitles.map((item) => normalizeText(item)).filter(Boolean).join('\n') : '',
    chapter_summary: normalizeText(chapterSummary),
    narrative_context: normalizeText(narrativeContext),
    target_length: normalizeText(targetLength)
  };

  const primaryPromptType = resolveNarrativePromptType(outputType);
  let result;

  try {
    result = await promptEngine.runPromptGeneration({
      promptType: primaryPromptType,
      variables,
      mistralClient: mistral,
      model: 'mistral-small-latest',
      maxRetries: 2
    });
  } catch (error) {
    const shouldFallbackToFrameTexts = (
      primaryPromptType !== 'frame_texts'
      && error?.code === 'PROMPT_TEMPLATE_NOT_FOUND'
    );

    if (!shouldFallbackToFrameTexts) {
      throw error;
    }

    result = await promptEngine.runPromptGeneration({
      promptType: 'frame_texts',
      variables,
      mistralClient: mistral,
      model: 'mistral-small-latest',
      maxRetries: 2
    });
  }

  return normalizeText(result.output);
}

async function generateQuote(chapterTitle, eventType, style) {
  return generateNarrativeContent({
    outputType: 'quote',
    eventType: eventType || 'generique',
    style: style || 'intime',
    chapterTitle: chapterTitle || 'Chapitre'
  });
}

module.exports = {
  generateQuestions,
  generateNarrativeContent,
  generateQuote,
  mistral
};
