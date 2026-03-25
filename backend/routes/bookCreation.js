const express = require('express');
const supabase = require('../config/supabase');
const authenticate = require('../middleware/auth');
const promptEngine = require('../services/promptEngine');
const aiService = require('../services/aiService');
const {
  runChapterAmorceGeneration
} = require('../services/chapterAmorceService');
const {
  CHAPTER_COUNTS,
  BOOK_CONFIG_COLUMNS,
  BOOK_FINISHES,
  PAPER_TYPES,
  NARRATIVE_STYLES,
  EVENT_TYPE_ICONS,
  FIELD_DEFINITIONS,
  SUBTYPE_SCHEMAS,
  getSubtypeSchema,
  getSubtypeDefaults,
  isAllowedBookFinish,
  isAllowedChapterCount,
  isAllowedNarrativeStyle,
  isAllowedPaperType
} = require('../utils/bookCreationSchema');

const router = express.Router();

const NUMBER_FIELDS = new Set([
  'recipient_age',
  'years_in_role',
  'generations_count',
  'chapter_count'
]);

const STEP1_REQUIRED_FIELDS = [
  'recipient_name',
  'event_type',
  'event_subtype',
  'event_date',
  'event_location'
];

const FALLBACK_EVENT_TYPE_ROWS = [
  { type_slug: 'anniversaire', subtype_slug: 'anniversary_18', type_label: 'Anniversaire', subtype_label: '18 ans', default_tone: 'intime', default_chapter_count: 6, sort_order: 10 },
  { type_slug: 'anniversaire', subtype_slug: 'anniversary_30', type_label: 'Anniversaire', subtype_label: '30 ans', default_tone: 'humoristique', default_chapter_count: 6, sort_order: 11 },
  { type_slug: 'anniversaire', subtype_slug: 'anniversary_40_50', type_label: 'Anniversaire', subtype_label: '40 / 50 ans', default_tone: 'intime', default_chapter_count: 8, sort_order: 12 },
  { type_slug: 'anniversaire', subtype_slug: 'anniversary_60_70', type_label: 'Anniversaire', subtype_label: '60 / 70 ans', default_tone: 'poetique', default_chapter_count: 8, sort_order: 13 },
  { type_slug: 'anniversaire', subtype_slug: 'anniversary_80_plus', type_label: 'Anniversaire', subtype_label: '80 ans +', default_tone: 'poetique', default_chapter_count: 8, sort_order: 14 },
  { type_slug: 'anniversaire', subtype_slug: 'anniversary_other', type_label: 'Anniversaire', subtype_label: 'Autre age', default_tone: 'intime', default_chapter_count: 6, sort_order: 15 },

  { type_slug: 'retraite', subtype_slug: 'retirement_pro', type_label: 'Retraite', subtype_label: 'Collegues', default_tone: 'factuel', default_chapter_count: 6, sort_order: 20 },
  { type_slug: 'retraite', subtype_slug: 'retirement_family', type_label: 'Retraite', subtype_label: 'Famille', default_tone: 'intime', default_chapter_count: 6, sort_order: 21 },
  { type_slug: 'retraite', subtype_slug: 'retirement_mixed', type_label: 'Retraite', subtype_label: 'Les deux', default_tone: 'intime', default_chapter_count: 8, sort_order: 22 },

  { type_slug: 'depart', subtype_slug: 'departure_job', type_label: 'Depart', subtype_label: 'Nouveau poste / entreprise', default_tone: 'factuel', default_chapter_count: 6, sort_order: 30 },
  { type_slug: 'depart', subtype_slug: 'departure_expat', type_label: 'Depart', subtype_label: 'Expatriation / etranger', default_tone: 'poetique', default_chapter_count: 8, sort_order: 31 },
  { type_slug: 'depart', subtype_slug: 'departure_move', type_label: 'Depart', subtype_label: 'Demenagement / nouvelle ville', default_tone: 'intime', default_chapter_count: 6, sort_order: 32 },

  { type_slug: 'mariage', subtype_slug: 'wedding_marriage', type_label: 'Mariage / Union', subtype_label: 'Mariage', default_tone: 'poetique', default_chapter_count: 8, sort_order: 40 },
  { type_slug: 'mariage', subtype_slug: 'wedding_pacs', type_label: 'Mariage / Union', subtype_label: 'PACS / union libre', default_tone: 'intime', default_chapter_count: 6, sort_order: 41 },
  { type_slug: 'mariage', subtype_slug: 'wedding_anniversary', type_label: 'Mariage / Union', subtype_label: 'Noces', default_tone: 'poetique', default_chapter_count: 8, sort_order: 42 },

  { type_slug: 'naissance', subtype_slug: 'birth_after', type_label: 'Naissance', subtype_label: 'Apres la naissance', default_tone: 'intime', default_chapter_count: 6, sort_order: 50 },
  { type_slug: 'naissance', subtype_slug: 'birth_during', type_label: 'Naissance', subtype_label: 'Pendant la grossesse', default_tone: 'poetique', default_chapter_count: 6, sort_order: 51 },

  { type_slug: 'voyage', subtype_slug: 'trip_friends', type_label: 'Voyage / Vacances', subtype_label: 'Entre amis', default_tone: 'humoristique', default_chapter_count: 6, sort_order: 60 },
  { type_slug: 'voyage', subtype_slug: 'trip_family', type_label: 'Voyage / Vacances', subtype_label: 'En famille', default_tone: 'intime', default_chapter_count: 8, sort_order: 61 },
  { type_slug: 'voyage', subtype_slug: 'trip_school', type_label: 'Voyage / Vacances', subtype_label: 'Voyage scolaire / colo', default_tone: 'factuel', default_chapter_count: 6, sort_order: 62 },

  { type_slug: 'projet', subtype_slug: 'project_company', type_label: 'Fin de projet', subtype_label: 'Projet d entreprise', default_tone: 'factuel', default_chapter_count: 6, sort_order: 70 },
  { type_slug: 'projet', subtype_slug: 'project_association', type_label: 'Fin de projet', subtype_label: 'Projet associatif / evenementiel', default_tone: 'intime', default_chapter_count: 6, sort_order: 71 },
  { type_slug: 'projet', subtype_slug: 'project_school', type_label: 'Fin de projet', subtype_label: 'Promotion / cursus scolaire', default_tone: 'intime', default_chapter_count: 6, sort_order: 72 },

  { type_slug: 'famille', subtype_slug: 'family_annual', type_label: 'Reunion de famille', subtype_label: 'Reunion annuelle', default_tone: 'intime', default_chapter_count: 6, sort_order: 80 },
  { type_slug: 'famille', subtype_slug: 'family_reunion', type_label: 'Reunion de famille', subtype_label: 'Retrouvailles exceptionnelles', default_tone: 'poetique', default_chapter_count: 8, sort_order: 81 },
  { type_slug: 'famille', subtype_slug: 'family_memory', type_label: 'Reunion de famille', subtype_label: 'Livre de memoire', default_tone: 'poetique', default_chapter_count: 8, sort_order: 82 },

  { type_slug: 'custom', subtype_slug: 'custom', type_label: 'Choix libre', subtype_label: 'Choix libre', default_tone: 'intime', default_chapter_count: 6, sort_order: 90 }
];

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeDate(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return raw.slice(0, 10);
}

function normalizeInteger(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(numeric);
}

function estimateTotalPages(chapterCount) {
  const safeCount = Number.isFinite(Number(chapterCount)) ? Number(chapterCount) : 6;
  return Math.max(32, safeCount * 8 + 16);
}

function extractBookConfigPayload(payload = {}) {
  const output = {};
  for (const key of BOOK_CONFIG_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    if (key === 'event_date') {
      output[key] = normalizeDate(payload[key]);
      continue;
    }
    if (NUMBER_FIELDS.has(key)) {
      output[key] = normalizeInteger(payload[key], null);
      continue;
    }
    output[key] = normalizeNullableText(payload[key]);
  }
  return output;
}

function formatEventDateLong(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value).trim().length > 0;
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
      if (Array.isArray(parsed.questions)) return parsed.questions;
      return Object.values(parsed).find((value) => Array.isArray(value)) || [];
    }
  } catch (_error) {
    // Fallback below.
  }
  return source
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)-]?)\s*/g, '').trim())
    .filter(Boolean);
}

function parseTitleSuggestions(rawOutput = '', recipientName = '', eventLabel = '') {
  const values = parseStructuredList(rawOutput)
    .map((value) => {
      if (typeof value === 'string') return normalizeText(value);
      if (value && typeof value === 'object') {
        return normalizeText(value.title || value.label || value.name);
      }
      return '';
    })
    .filter(Boolean);
  const unique = [...new Set(values)];
  const fallbackBase = normalizeText(recipientName) || 'Livre souvenir';
  const fallback = [
    `Les souvenirs de ${fallbackBase}`,
    `${normalizeText(eventLabel) || 'Evenement'} de ${fallbackBase}`,
    `Pour ${fallbackBase}`
  ];
  while (unique.length < 3) {
    unique.push(fallback[unique.length] || `Titre ${unique.length + 1}`);
  }
  return unique.slice(0, 3);
}

const CHAPTER_TITLE_BLOCKLIST = [
  /system settings/i,
  /user management/i,
  /roles?, permissions?/i,
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

function sanitizeChapterTitleCandidate(value = '') {
  return normalizeText(value)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^(?:chapitre|chapter)\s*\d+\s*[:\-]\s*/i, '')
    .replace(/^\d+[\.\)\-:]\s*/g, '')
    .trim();
}

function hasRepeatedMeaningfulWords(value = '') {
  const stopWords = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'a', 'en', 'pour']);
  const tokens = sanitizeChapterTitleCandidate(value)
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

function isLikelyChapterTitleCandidate(value = '') {
  const normalized = sanitizeChapterTitleCandidate(value);
  if (!normalized) return false;
  if (normalized.length < 4 || normalized.length > 84) return false;
  if (normalized.endsWith('?')) return false;
  if (/\*\*/.test(normalized)) return false;
  if (/[{}[\]]/.test(normalized)) return false;
  if (normalized.split(/\s+/).filter(Boolean).length > 12) return false;
  if (CHAPTER_TITLE_BLOCKLIST.some((pattern) => pattern.test(normalized))) return false;
  if (hasRepeatedMeaningfulWords(normalized)) return false;
  return true;
}

function buildFallbackChapterTitles(variables = {}, count = 6) {
  const eventType = normalizeText(variables.event_type).toLowerCase();
  const byEvent = {
    anniversaire: [
      'Le portrait sensible',
      "L'histoire que l'on raconte",
      'Les voix des proches',
      'Les moments qui comptent',
      'Ce qui vous rassemble',
      'Ce que l avenir promet',
      'Les details inoubliables',
      'La suite en lumière'
    ],
    retraite: [
      'Les annees qui ont marque',
      'Le role de tous les jours',
      'Les scenes de bureau',
      'Ce qui va manquer',
      'Les voix qui remercient',
      'Le temps qui s ouvre',
      'Ce que l on retient',
      'Et maintenant'
    ],
    depart: [
      'Le temps partage',
      'Les reperes du quotidien',
      'Ce qui restera',
      'Les moments que l on garde',
      'Les voix du passage',
      'La prochaine etape',
      'Les traces laissees',
      'Un nouvel elan'
    ],
    mariage: [
      'La rencontre',
      'Les premiers liens',
      'Ce qui vous unit',
      'Les souvenirs fondateurs',
      'Les voix qui racontent',
      'Les gestes du quotidien',
      'La promesse',
      'Pour la suite'
    ],
    naissance: [
      'Avant toi',
      'Les premiers instants',
      'Les voix autour de toi',
      'Les details deja precieux',
      'Ce que l on imagine',
      'Ce que l on te souhaite',
      'Les liens qui t attendent',
      'Bienvenue'
    ],
    voyage: [
      'Le depart',
      'Le decor et la lumière',
      'Les scenes partagees',
      'Les rires en chemin',
      "L'imprevu devenu souvenir",
      'Les lieux que l on garde',
      'Ce que le voyage change',
      'Le retour'
    ],
    projet: [
      'Le point de depart',
      'Les forces en presence',
      'Le grand defi',
      'Le moment de bascule',
      'Les voix de l equipe',
      'Ce que le projet change',
      'Les souvenirs du collectif',
      'Et apres'
    ],
    famille: [
      'Le bonheur des retrouvailles',
      'Les visages retrouves',
      'Les gestes qui reviennent',
      'Les histoires transmises',
      'Les rituels de la famille',
      'Les voix de toutes les generations',
      'Ce qui nous relie',
      'La memoire en partage'
    ],
    custom: [
      'Le point de depart',
      'Les moments marquants',
      'Les voix qui racontent',
      'Les details qui restent',
      'Le fil du souvenir',
      'Les traces laissees',
      'Ce que l on retient',
      'Et la suite'
    ]
  };

  const base = byEvent[eventType] || byEvent.custom;
  const safeCount = Math.max(1, Number(count) || 1);
  return base.slice(0, safeCount);
}

function parseChapterTitles(rawOutput = '', count = 6, variables = {}) {
  const values = parseStructuredList(rawOutput)
    .map((value) => {
      if (typeof value === 'string') return sanitizeChapterTitleCandidate(value);
      if (value && typeof value === 'object') {
        return sanitizeChapterTitleCandidate(value.title || value.label || value.name || value.chapterTitle);
      }
      return '';
    })
    .filter((value) => isLikelyChapterTitleCandidate(value));

  const unique = [...new Set(values)];
  const safeCount = Math.max(1, Number(count) || 1);
  const fallback = buildFallbackChapterTitles(variables, safeCount);
  while (unique.length < safeCount) {
    unique.push(fallback[unique.length] || `Chapitre ${unique.length + 1}`);
  }
  return unique.slice(0, safeCount);
}

function buildMissingFieldErrors(requiredFields = [], config = {}) {
  return requiredFields
    .filter((field) => !hasValue(config[field]))
    .map((field) => ({
      field,
      message: 'Ce champ est obligatoire.'
    }));
}

function getStepStatus(config = {}, subtypeSchema = null, book = null) {
  const step1Complete = STEP1_REQUIRED_FIELDS.every((field) => hasValue(config[field]))
    && hasValue(book?.title);
  const requiredStep2 = subtypeSchema?.required || [];
  const step2Complete = requiredStep2.every((field) => hasValue(config[field]));
  const hasFormat = hasValue(config.chapter_count) && hasValue(config.book_finish);
  const paperOk = config.book_finish === 'livret'
    ? true
    : hasValue(config.paper_type);
  const step3Complete = hasFormat && paperOk;
  return {
    currentStep: !step1Complete ? 1 : (!step2Complete ? 2 : (!step3Complete ? 3 : 3)),
    step1Complete,
    step2Complete,
    step3Complete
  };
}

async function fetchEventTypesRows() {
  const { data, error } = await supabase
    .from('event_types')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const merged = new Map();
  [...FALLBACK_EVENT_TYPE_ROWS, ...(Array.isArray(data) ? data : [])].forEach((row) => {
    const key = `${normalizeText(row.type_slug)}::${normalizeText(row.subtype_slug)}`;
    if (!key || key === '::') return;
    merged.set(key, row);
  });
  return [...merged.values()].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function buildEventTypesPayload(rows = []) {
  const grouped = [];
  const byType = new Map();
  rows.forEach((row) => {
    const typeSlug = normalizeText(row.type_slug);
    if (!typeSlug) return;
    if (!byType.has(typeSlug)) {
      const typeEntry = {
        type_slug: typeSlug,
        type_label: normalizeText(row.type_label) || typeSlug,
        icon: EVENT_TYPE_ICONS[typeSlug] || 'sparkles',
        subtypes: []
      };
      byType.set(typeSlug, typeEntry);
      grouped.push(typeEntry);
    }
    byType.get(typeSlug).subtypes.push({
      subtype_slug: normalizeText(row.subtype_slug),
      subtype_label: normalizeText(row.subtype_label),
      default_tone: normalizeText(row.default_tone) || 'intime',
      default_chapter_count: Number(row.default_chapter_count) || 6,
      tone_hint: `Ton recommande: ${normalizeText(row.default_tone) || 'intime'}`
    });
  });
  return grouped;
}

async function fetchEventSubtype(eventType, eventSubtype) {
  const { data, error } = await supabase
    .from('event_types')
    .select('*')
    .eq('type_slug', eventType)
    .eq('subtype_slug', eventSubtype)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  return FALLBACK_EVENT_TYPE_ROWS.find((row) => (
    normalizeText(row.type_slug) === normalizeText(eventType)
    && normalizeText(row.subtype_slug) === normalizeText(eventSubtype)
  )) || null;
}

async function getOwnedBookOrThrow(bookId, ownerId) {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error('Livre introuvable');
    notFound.status = 404;
    throw notFound;
  }
  return data;
}

async function getBookConfig(bookId) {
  const { data, error } = await supabase
    .from('book_configs')
    .select('*')
    .eq('book_id', bookId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getContributionStats(bookId) {
  const { data, error } = await supabase
    .from('chapters')
    .select('id, contributions:contributions(message)')
    .eq('book_id', bookId);
  if (error) throw error;
  const chapterRows = Array.isArray(data) ? data : [];
  const messages = [];
  chapterRows.forEach((chapter) => {
    const contributions = Array.isArray(chapter.contributions) ? chapter.contributions : [];
    contributions.forEach((contribution) => {
      const message = normalizeText(contribution?.message);
      if (message) messages.push(message);
    });
  });
  const contributionsCount = messages.length;
  const avgWords = contributionsCount > 0
    ? messages.reduce((sum, message) => sum + message.split(/\s+/).filter(Boolean).length, 0) / contributionsCount
    : 0;
  let contributionsRichness = 'moyenne';
  if (contributionsCount < 3 || avgWords < 50) {
    contributionsRichness = 'faible';
  } else if (contributionsCount >= 6 && avgWords > 100) {
    contributionsRichness = 'riche';
  }
  return {
    contributionsCount,
    contributionsRichness
  };
}

async function buildPromptVariables({ book, config, eventSubtypeRow, chapterCountOverride = null }) {
  const variables = {};
  const eventDateLong = formatEventDateLong(config.event_date);
  const chapterCount = Number.isFinite(Number(chapterCountOverride))
    ? Number(chapterCountOverride)
    : (Number(config.chapter_count) || Number(eventSubtypeRow?.default_chapter_count) || 6);
  const defaultTone = normalizeText(eventSubtypeRow?.default_tone) || 'intime';

  variables.book_title = normalizeText(book?.title);
  variables.event_type = normalizeText(config.event_type);
  variables.event_subtype = normalizeText(config.event_subtype);
  variables.event_date = eventDateLong || normalizeText(config.event_date);
  variables.event_location = normalizeText(config.event_location);
  variables.recipient_name = normalizeText(config.recipient_name);
  variables.recipient_nickname = normalizeText(config.recipient_nickname) || normalizeText(config.recipient_name);
  variables.narrative_style = normalizeText(config.narrative_style) || defaultTone;
  variables.chapter_count = chapterCount;
  variables.book_finish = normalizeText(config.book_finish) || 'classique';

  Object.entries(config).forEach(([key, value]) => {
    if (!hasValue(value)) return;
    if (variables[key] !== undefined) return;
    if (['id', 'book_id', 'created_at', 'updated_at'].includes(key)) return;
    variables[key] = value;
  });

  if (hasValue(config.event_date)) {
    const year = new Date(config.event_date).getFullYear();
    if (Number.isFinite(year)) variables.event_year = year;
  }

  const contributionStats = await getContributionStats(book.id);
  variables.contributions_count = contributionStats.contributionsCount;
  variables.contributions_richness = contributionStats.contributionsRichness;

  return variables;
}

async function applyBookSyncFromConfig(bookId, ownerId, patch = {}, eventSubtypeRow = null) {
  const updatePayload = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'recipient_name')) {
    updatePayload.recipient_name = normalizeText(patch.recipient_name) || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'event_type')) {
    updatePayload.event_type = normalizeText(patch.event_type) || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'recipient_age')) {
    updatePayload.recipient_age = normalizeInteger(patch.recipient_age, null);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'narrative_style')) {
    updatePayload.style_narratif = normalizeText(patch.narrative_style) || normalizeText(eventSubtypeRow?.default_tone) || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'book_finish')) {
    updatePayload.finition = normalizeText(patch.book_finish) || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'paper_type')) {
    updatePayload.papier = normalizeText(patch.paper_type) || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chapter_count')) {
    updatePayload.pages = estimateTotalPages(Number(patch.chapter_count) || 6);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    updatePayload.title = normalizeText(patch.title) || null;
  }
  if (Object.keys(updatePayload).length === 0) return null;

  const { data, error } = await supabase
    .from('books')
    .update(updatePayload)
    .eq('id', bookId)
    .eq('owner_id', ownerId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function upsertBookConfig(bookId, patch = {}) {
  const payload = extractBookConfigPayload(patch);
  payload.book_id = bookId;
  const existing = await getBookConfig(bookId);

  if (existing?.id) {
    const { data, error } = await supabase
      .from('book_configs')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('book_configs')
    .insert([payload])
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function ensureChapterCount(bookId, targetCount) {
  const safeTarget = Math.max(1, Number(targetCount) || 1);
  const { data: existingChapters, error: selectError } = await supabase
    .from('chapters')
    .select('*')
    .eq('book_id', bookId)
    .order('order_index', { ascending: true });
  if (selectError) throw selectError;

  const rows = Array.isArray(existingChapters) ? existingChapters : [];
  for (let index = 0; index < safeTarget; index += 1) {
    const existing = rows[index];
    if (existing) {
      if (existing.order_index !== index) {
        const { error: updateOrderError } = await supabase
          .from('chapters')
          .update({ order_index: index })
          .eq('id', existing.id);
        if (updateOrderError) throw updateOrderError;
      }
      continue;
    }
    const { error: insertError } = await supabase
      .from('chapters')
      .insert([{
        book_id: bookId,
        order_index: index,
        title: `Chapitre ${index + 1}`,
        description: `Chapitre ${index + 1} - En preparation`,
        questions_ia: [],
        amorce_text: null,
        triggers: [],
        amorce_generated_at: null,
        amorce_validated: false
      }]);
    if (insertError) throw insertError;
  }

  const toDelete = rows.slice(safeTarget);
  if (toDelete.length > 0) {
    const ids = toDelete.map((chapter) => chapter.id);
    const { error: deleteError } = await supabase
      .from('chapters')
      .delete()
      .in('id', ids);
    if (deleteError) throw deleteError;
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from('chapters')
    .select('*')
    .eq('book_id', bookId)
    .order('order_index', { ascending: true });
  if (refreshError) throw refreshError;
  return refreshed || [];
}

router.get('/event-types', async (_req, res) => {
  try {
    const rows = await fetchEventTypesRows();
    const types = buildEventTypesPayload(rows);
    return res.json({
      types,
      totalSubtypes: rows.length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erreur chargement types.' });
  }
});

router.get('/schema', async (_req, res) => {
  try {
    const rows = await fetchEventTypesRows();
    return res.json({
      types: buildEventTypesPayload(rows),
      fieldDefinitions: FIELD_DEFINITIONS,
      subtypeSchemas: SUBTYPE_SCHEMAS,
      chapterCounts: CHAPTER_COUNTS,
      narrativeStyles: NARRATIVE_STYLES,
      bookFinishes: BOOK_FINISHES,
      paperTypes: PAPER_TYPES
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erreur chargement schema.' });
  }
});

router.post('/start', authenticate, async (req, res) => {
  try {
    const payload = extractBookConfigPayload(req.body || {});
    const step1Errors = buildMissingFieldErrors(STEP1_REQUIRED_FIELDS, payload);
    if (step1Errors.length > 0) {
      return res.status(422).json({ error: 'Champs obligatoires manquants.', fieldErrors: step1Errors });
    }

    const eventSubtypeRow = await fetchEventSubtype(payload.event_type, payload.event_subtype);
    if (!eventSubtypeRow) {
      return res.status(422).json({
        error: 'Type et sous-type invalides.',
        fieldErrors: [{ field: 'event_subtype', message: 'Sous-type invalide pour ce type.' }]
      });
    }

    const defaultTone = normalizeText(eventSubtypeRow.default_tone) || 'intime';
    const defaultChapterCount = Number(eventSubtypeRow.default_chapter_count) || 6;
    const configDefaults = getSubtypeDefaults(payload.event_subtype);

    const bookInsertPayload = {
      owner_id: req.user.id,
      title: normalizeText(req.body?.title) || `Livre de ${normalizeText(payload.recipient_name)}`,
      event_type: payload.event_type,
      recipient_name: payload.recipient_name,
      recipient_age: payload.recipient_age,
      style_narratif: defaultTone,
      finition: 'classique',
      papier: 'mat',
      pages: estimateTotalPages(defaultChapterCount),
      statut: 'en_cours'
    };

    const { data: book, error: bookError } = await supabase
      .from('books')
      .insert([bookInsertPayload])
      .select('*')
      .single();
    if (bookError) throw bookError;

    const config = await upsertBookConfig(book.id, {
      ...payload,
      ...configDefaults,
      chapter_count: defaultChapterCount,
      narrative_style: defaultTone,
      book_finish: 'classique',
      paper_type: 'mat'
    });

    return res.status(201).json({
      book,
      config,
      stepStatus: getStepStatus(config, getSubtypeSchema(config.event_subtype), book)
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur initialisation creation livre.' });
  }
});

router.get('/:bookId', authenticate, async (req, res) => {
  try {
    const book = await getOwnedBookOrThrow(req.params.bookId, req.user.id);
    const config = await getBookConfig(book.id);
    const { data: chapters, error: chaptersError } = await supabase
      .from('chapters')
      .select('*')
      .eq('book_id', book.id)
      .order('order_index', { ascending: true });
    if (chaptersError) throw chaptersError;
    return res.json({
      book,
      config,
      chapters: chapters || [],
      stepStatus: getStepStatus(config || {}, getSubtypeSchema(config?.event_subtype), book)
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur chargement configuration livre.' });
  }
});

router.patch('/:bookId/autosave', authenticate, async (req, res) => {
  try {
    const book = await getOwnedBookOrThrow(req.params.bookId, req.user.id);
    const currentConfig = await getBookConfig(book.id);
    if (!currentConfig) {
      return res.status(404).json({ error: 'Configuration livre introuvable.' });
    }

    const patch = extractBookConfigPayload(req.body || {});
    const incomingTitle = normalizeText(req.body?.title);
    const nextEventType = patch.event_type || currentConfig.event_type;
    const nextEventSubtype = patch.event_subtype || currentConfig.event_subtype;

    if (patch.event_type || patch.event_subtype) {
      const subtypeRow = await fetchEventSubtype(nextEventType, nextEventSubtype);
      if (!subtypeRow) {
        return res.status(422).json({
          error: 'Type et sous-type invalides.',
          fieldErrors: [{ field: 'event_subtype', message: 'Sous-type invalide pour ce type.' }]
        });
      }
      Object.assign(patch, getSubtypeDefaults(nextEventSubtype));
      if (!patch.chapter_count && !currentConfig.chapter_count) {
        patch.chapter_count = Number(subtypeRow.default_chapter_count) || 6;
      }
      if (!patch.narrative_style && !currentConfig.narrative_style) {
        patch.narrative_style = normalizeText(subtypeRow.default_tone) || 'intime';
      }
    }

    const config = await upsertBookConfig(book.id, patch);
    const eventSubtypeRow = await fetchEventSubtype(config.event_type, config.event_subtype);
    const syncedBook = await applyBookSyncFromConfig(book.id, req.user.id, {
      ...patch,
      ...(incomingTitle ? { title: incomingTitle } : {})
    }, eventSubtypeRow);
    const finalBook = syncedBook || book;

    return res.json({
      ok: true,
      savedAt: new Date().toISOString(),
      book: finalBook,
      config,
      stepStatus: getStepStatus(config, getSubtypeSchema(config.event_subtype), finalBook)
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur sauvegarde automatique.' });
  }
});

router.post('/:bookId/step1/complete', authenticate, async (req, res) => {
  try {
    const book = await getOwnedBookOrThrow(req.params.bookId, req.user.id);
    const currentConfig = await getBookConfig(book.id);
    if (!currentConfig) {
      return res.status(404).json({ error: 'Configuration livre introuvable.' });
    }

    const patch = extractBookConfigPayload(req.body || {});
    const nextEventType = patch.event_type || currentConfig.event_type;
    const nextEventSubtype = patch.event_subtype || currentConfig.event_subtype;
    const eventSubtypeRow = await fetchEventSubtype(nextEventType, nextEventSubtype);
    if (!eventSubtypeRow) {
      return res.status(422).json({
        error: 'Type et sous-type invalides.',
        fieldErrors: [{ field: 'event_subtype', message: 'Sous-type invalide pour ce type.' }]
      });
    }
    Object.assign(patch, getSubtypeDefaults(nextEventSubtype));

    const config = await upsertBookConfig(book.id, patch);
    const step1Errors = buildMissingFieldErrors(STEP1_REQUIRED_FIELDS, config);
    if (step1Errors.length > 0) {
      return res.status(422).json({ error: 'Merci de completer les champs requis.', fieldErrors: step1Errors });
    }

    const selectedTitle = normalizeText(req.body?.title || req.body?.selectedTitle);
    const syncedBook = await applyBookSyncFromConfig(book.id, req.user.id, {
      ...patch,
      ...(selectedTitle ? { title: selectedTitle } : {})
    }, eventSubtypeRow);
    const effectiveBook = syncedBook || book;

    const promptVariables = await buildPromptVariables({
      book: effectiveBook,
      config,
      eventSubtypeRow
    });
    const titleResult = await promptEngine.runPromptGeneration({
      promptType: 'book_title',
      variables: promptVariables,
      mistralClient: aiService.mistral,
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      maxRetries: 2
    });

    const suggestions = parseTitleSuggestions(
      titleResult.output,
      config.recipient_name,
      eventSubtypeRow.type_label
    );

    if (!hasValue(effectiveBook.title) && suggestions.length > 0) {
      const [firstSuggestion] = suggestions;
      const updatedBook = await applyBookSyncFromConfig(book.id, req.user.id, { title: firstSuggestion }, eventSubtypeRow);
      return res.json({
        ok: true,
        titleSuggestions: suggestions,
        selectedTitle: updatedBook?.title || firstSuggestion,
        promptVersion: titleResult?.template?.version || null,
        book: updatedBook || effectiveBook,
        config,
        stepStatus: getStepStatus(config, getSubtypeSchema(config.event_subtype), updatedBook || effectiveBook)
      });
    }

    return res.json({
      ok: true,
      titleSuggestions: suggestions,
      selectedTitle: effectiveBook.title,
      promptVersion: titleResult?.template?.version || null,
      book: effectiveBook,
      config,
      stepStatus: getStepStatus(config, getSubtypeSchema(config.event_subtype), effectiveBook)
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur validation etape 1.' });
  }
});

router.post('/:bookId/step2/complete', authenticate, async (req, res) => {
  try {
    const book = await getOwnedBookOrThrow(req.params.bookId, req.user.id);
    const currentConfig = await getBookConfig(book.id);
    if (!currentConfig) {
      return res.status(404).json({ error: 'Configuration livre introuvable.' });
    }

    const patch = extractBookConfigPayload(req.body || {});
    const config = await upsertBookConfig(book.id, patch);
    const subtypeSchema = getSubtypeSchema(config.event_subtype);
    if (!subtypeSchema) {
      return res.status(422).json({ error: 'Sous-type non reconnu.' });
    }
    const fieldErrors = buildMissingFieldErrors(subtypeSchema.required, config);
    if (fieldErrors.length > 0) {
      return res.status(422).json({ error: 'Merci de completer les informations principales.', fieldErrors });
    }

    const eventSubtypeRow = await fetchEventSubtype(config.event_type, config.event_subtype);
    const promptVariables = await buildPromptVariables({
      book,
      config,
      eventSubtypeRow
    });

    const chapterCount = Number(config.chapter_count)
      || Number(eventSubtypeRow?.default_chapter_count)
      || 6;

    const chapterTitleResult = await promptEngine.runPromptGeneration({
      promptType: 'chapter_titles',
      variables: {
        ...promptVariables,
        chapter_count: chapterCount,
        count: chapterCount
      },
      mistralClient: aiService.mistral,
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      maxRetries: 2
    });

    const chapterTitles = parseChapterTitles(chapterTitleResult.output, chapterCount, promptVariables);
    const chapters = await ensureChapterCount(book.id, chapterCount);

    const chapterDrafts = chapterTitles.map((title, index) => ({
      ...chapters[index],
      title: title || `Chapitre ${index + 1}`,
      order_index: index
    }));

    const updatedChapters = [];
    for (let index = 0; index < chapterDrafts.length; index += 1) {
      const chapter = chapterDrafts[index];
      const generatedAmorce = await runChapterAmorceGeneration({
        book,
        config,
        chapter,
        orderedChapters: chapterDrafts,
        model: process.env.MISTRAL_MODEL || 'mistral-small-latest'
      });

      const { data: updatedChapter, error: updateError } = await supabase
        .from('chapters')
        .update({
          title: chapter.title,
          order_index: index,
          description: `Chapitre ${index + 1} - Partagez vos souvenirs`,
          amorce_text: generatedAmorce.amorceText,
          triggers: generatedAmorce.triggers,
          amorce_generated_at: new Date().toISOString(),
          amorce_validated: false,
          questions_validated: false
        })
        .eq('id', chapter.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      updatedChapters.push(updatedChapter);
    }

    return res.json({
      ok: true,
      chapters: updatedChapters,
      chapterPromptVersion: chapterTitleResult?.template?.version || null,
      stepStatus: getStepStatus(config, subtypeSchema, book)
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur validation etape 2.' });
  }
});

router.post('/:bookId/step3/complete', authenticate, async (req, res) => {
  try {
    const book = await getOwnedBookOrThrow(req.params.bookId, req.user.id);
    const currentConfig = await getBookConfig(book.id);
    if (!currentConfig) {
      return res.status(404).json({ error: 'Configuration livre introuvable.' });
    }

    const patch = extractBookConfigPayload(req.body || {});
    if (hasValue(patch.chapter_count) && !isAllowedChapterCount(patch.chapter_count)) {
      return res.status(422).json({
        error: 'Nombre de chapitres invalide.',
        fieldErrors: [{ field: 'chapter_count', message: 'Choisissez 4, 6 ou 8 chapitres.' }]
      });
    }
    if (hasValue(patch.narrative_style) && !isAllowedNarrativeStyle(patch.narrative_style)) {
      return res.status(422).json({
        error: 'Style narratif invalide.',
        fieldErrors: [{ field: 'narrative_style', message: 'Valeur non autorisee.' }]
      });
    }
    if (hasValue(patch.book_finish) && !isAllowedBookFinish(patch.book_finish)) {
      return res.status(422).json({
        error: 'Finition invalide.',
        fieldErrors: [{ field: 'book_finish', message: 'Valeur non autorisee.' }]
      });
    }
    if (hasValue(patch.paper_type) && !isAllowedPaperType(patch.paper_type)) {
      return res.status(422).json({
        error: 'Type de papier invalide.',
        fieldErrors: [{ field: 'paper_type', message: 'Valeur non autorisee.' }]
      });
    }

    const config = await upsertBookConfig(book.id, patch);
    if (!hasValue(config.book_finish)) {
      return res.status(422).json({
        error: 'Choisissez une finition.',
        fieldErrors: [{ field: 'book_finish', message: 'La finition est obligatoire.' }]
      });
    }
    if (config.book_finish !== 'livret' && !hasValue(config.paper_type)) {
      return res.status(422).json({
        error: 'Choisissez un papier.',
        fieldErrors: [{ field: 'paper_type', message: 'Le papier est obligatoire pour cette finition.' }]
      });
    }

    const eventSubtypeRow = await fetchEventSubtype(config.event_type, config.event_subtype);
    const chapterCount = Number(config.chapter_count)
      || Number(eventSubtypeRow?.default_chapter_count)
      || 6;

    const syncedBook = await applyBookSyncFromConfig(book.id, req.user.id, {
      chapter_count: chapterCount,
      narrative_style: hasValue(config.narrative_style)
        ? config.narrative_style
        : (normalizeText(eventSubtypeRow?.default_tone) || 'intime'),
      book_finish: config.book_finish,
      paper_type: config.book_finish === 'livret' ? null : config.paper_type
    }, eventSubtypeRow);

    const chapters = await ensureChapterCount(book.id, chapterCount);

    const { data: finalBook, error: finalBookError } = await supabase
      .from('books')
      .update({ statut: 'en_cours' })
      .eq('id', book.id)
      .eq('owner_id', req.user.id)
      .select('*')
      .single();
    if (finalBookError) throw finalBookError;

    return res.json({
      ok: true,
      book: finalBook || syncedBook || book,
      config,
      chapters,
      globalStatus: 'en_cours_de_collecte',
      redirectTo: `/book/${book.id}`
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error.message || 'Erreur validation etape 3.' });
  }
});

module.exports = router;
