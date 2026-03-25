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
    style = 'intime',
    bookTitle = 'Livre souvenir',
    chapterTitle = 'Chapitre',
    recipientName = 'la personne celebree',
    recipientAge = 'non specifie',
    recipientGender = 'non specifie',
    chapterSummary = '',
    narrativeContext = '',
    targetLength = ''
  } = params;

  const variables = {
    output_type: normalizeText(outputType, 'frame'),
    eventType: normalizeText(eventType, 'generique'),
    style: normalizeText(style, 'intime'),
    bookTitle: normalizeText(bookTitle, 'Livre souvenir'),
    chapterTitle: normalizeText(chapterTitle, 'Chapitre'),
    recipientName: normalizeText(recipientName, 'la personne celebree'),
    recipientAge: normalizeText(recipientAge, 'non specifie'),
    recipientGender: normalizeText(recipientGender, 'non specifie'),
    chapterSummary: normalizeText(chapterSummary),
    narrativeContext: normalizeText(narrativeContext),
    targetLength: normalizeText(targetLength)
  };

  const result = await promptEngine.runPromptGeneration({
    promptType: 'frame_texts',
    variables,
    mistralClient: mistral,
    model: 'mistral-small-latest',
    maxRetries: 2
  });

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
