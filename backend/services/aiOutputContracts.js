function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function stripCodeFences(value) {
  return String(value || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

function parseJsonCandidate(content) {
  const clean = stripCodeFences(content);
  if (!clean) return null;

  try {
    return JSON.parse(clean);
  } catch (_error) {
    // no-op
  }

  const arrayMatch = clean.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (_error) {
      // no-op
    }
  }

  const objectMatch = clean.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (_error) {
      // no-op
    }
  }

  return null;
}

function containsTemplatePlaceholder(value) {
  const source = String(value || '');
  return /{{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*}}/.test(source)
    || /\[[a-zA-Z_][a-zA-Z0-9_]*\]/.test(source);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeQuestionList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return normalizeText(item);
      if (item && typeof item === 'object') {
        return normalizeText(item.question || item.title || item.label);
      }
      return '';
    })
    .filter(Boolean);
}

function parseQuestionsContractOutput(content) {
  const parsed = parseJsonCandidate(content);
  if (Array.isArray(parsed)) {
    return {
      questions: normalizeQuestionList(parsed),
      strictJson: true
    };
  }
  if (parsed && typeof parsed === 'object') {
    const candidates = [parsed.questions, parsed.items];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return {
          questions: normalizeQuestionList(candidate),
          strictJson: true
        };
      }
    }
  }
  return {
    questions: [],
    strictJson: false
  };
}

function validateQuestionsContract(rawQuestions, options = {}) {
  const expectedCount = Number.isInteger(Number(options.expectedCount))
    ? Math.max(1, Number(options.expectedCount))
    : 4;
  const recipientName = normalizeText(options.recipientName);
  const normalized = normalizeQuestionList(rawQuestions).slice(0, expectedCount);
  const issues = [];

  if (normalized.length < expectedCount) {
    issues.push(`question_count_${normalized.length}_expected_${expectedCount}`);
  }

  const seen = new Set();
  const normalizedNoDuplicate = [];
  for (const question of normalized) {
    const key = normalizeText(question).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalizedNoDuplicate.push(question);
    }
  }
  if (normalizedNoDuplicate.length < normalized.length) {
    issues.push('duplicate_questions');
  }

  const effectiveList = normalizedNoDuplicate;
  for (const question of effectiveList) {
    if (containsTemplatePlaceholder(question)) {
      issues.push('contains_unresolved_placeholder');
      break;
    }
  }

  if (recipientName) {
    const directAddressPattern = new RegExp(`^\\s*${escapeRegExp(recipientName)}\\s*[,!:]`, 'i');
    const directAddressHit = effectiveList.some((question) => directAddressPattern.test(question));
    if (directAddressHit) {
      issues.push('direct_address_to_recipient');
    }
  }

  const tooShort = effectiveList.some((question) => normalizeText(question).length < 18);
  if (tooShort) {
    issues.push('question_too_short');
  }

  const nonInterrogative = effectiveList.some((question) => !question.includes('?'));
  if (nonInterrogative) {
    issues.push('question_without_interrogation_mark');
  }

  return {
    isValid: issues.length === 0 && effectiveList.length === expectedCount,
    issues: Array.from(new Set(issues)),
    normalizedQuestions: effectiveList.slice(0, expectedCount)
  };
}

function normalizeTitles(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return normalizeText(item);
        if (item && typeof item === 'object') {
          return normalizeText(item.title || item.name || item.chapterTitle || item.label);
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
      raw.Sommaire,
      raw['Sommaire des souvenirs']
    ];
    for (const candidate of arrayCandidates) {
      const normalized = normalizeTitles(candidate);
      if (normalized.length > 0) return normalized;
    }
  }

  return [];
}

function parseChapterContractOutput(content) {
  const parsed = parseJsonCandidate(content);
  if (!parsed) {
    return {
      titles: [],
      suggestedBookTitle: '',
      strictJson: false
    };
  }

  const titleCandidates = parsed && typeof parsed === 'object'
    ? [
        parsed.bookTitle,
        parsed.title,
        parsed.book_title,
        parsed['Titre de l Ouvrage'],
        parsed["Titre de l'Ouvrage"],
        parsed['Titre du livre'],
        parsed['Titre du Livre']
      ]
    : [];

  let suggestedBookTitle = '';
  for (const candidate of titleCandidates) {
    const normalizedCandidate = normalizeText(candidate);
    if (normalizedCandidate) {
      suggestedBookTitle = normalizedCandidate;
      break;
    }
  }

  return {
    titles: normalizeTitles(parsed),
    suggestedBookTitle,
    strictJson: true
  };
}

function validateChapterTitlesContract(rawTitles, options = {}) {
  const expectedCount = Number.isInteger(Number(options.expectedCount))
    ? Math.max(1, Number(options.expectedCount))
    : 8;
  const minimumRequired = Math.min(expectedCount, 3);
  const titles = normalizeTitles(rawTitles);
  const issues = [];
  const uniqueTitles = [];
  const seen = new Set();

  for (const title of titles) {
    const normalized = normalizeText(title);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueTitles.push(normalized);
  }

  if (uniqueTitles.length < minimumRequired) {
    issues.push(`insufficient_titles_${uniqueTitles.length}_required_${minimumRequired}`);
  }

  if (uniqueTitles.length < titles.length) {
    issues.push('duplicate_titles');
  }

  const invalidLength = uniqueTitles.some((title) => title.length < 3 || title.length > 120);
  if (invalidLength) {
    issues.push('invalid_title_length');
  }

  const hasPlaceholder = uniqueTitles.some((title) => containsTemplatePlaceholder(title));
  if (hasPlaceholder) {
    issues.push('title_contains_placeholder');
  }

  const obviousFallbackTitles = uniqueTitles.filter((title) => /^chapitre\s+\d+$/i.test(title)).length;
  if (obviousFallbackTitles >= minimumRequired) {
    issues.push('generic_titles_only');
  }

  return {
    isValid: issues.length === 0,
    issues: Array.from(new Set(issues)),
    normalizedTitles: uniqueTitles.slice(0, expectedCount)
  };
}

function sanitizeBookTitleCandidate(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (containsTemplatePlaceholder(normalized)) return '';
  if (normalized.length < 3 || normalized.length > 180) return '';
  return normalized;
}

module.exports = {
  containsTemplatePlaceholder,
  parseQuestionsContractOutput,
  validateQuestionsContract,
  parseChapterContractOutput,
  validateChapterTitlesContract,
  sanitizeBookTitleCandidate
};
