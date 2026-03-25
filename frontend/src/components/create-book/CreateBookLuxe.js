import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';
import './CreateBookLuxe.css';

const API_BASE = (() => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
})();
const STORAGE_KEY = 'createBookEventFlowV3';
const RETURN_TO_KEY = 'returnTo';
const RESUME_CREATE_KEY = 'resumeCreateBook';
const TITLE_STYLE_HINTS = ['Sobre, elegant', 'Concis, direct', 'Intrigant, collectif'];
const DEFAULT_TITLE_COUNT = 3;

const EVENT_PARAM_TO_TYPE = {
  anniversaire: 'anniversaire',
  anniverssaire: 'anniversaire',
  retraite: 'retraite',
  'pot-depart': 'depart',
  depart: 'depart',
  mariage: 'mariage',
  union: 'mariage',
  naissance: 'naissance',
  vacances: 'voyage',
  voyage: 'voyage',
  'fin-projet': 'projet',
  'fin-de-projet': 'projet',
  projet: 'projet',
  famille: 'famille',
  'reunion-famille': 'famille',
  libre: 'custom',
  'choix-libre': 'custom',
  custom: 'custom'
};

const DEFAULT_FORM = {
  event_type: '',
  event_subtype: '',
  narrative_person: '',
  custom_age: '',
  wedding_anniversary_years: '',
  event_custom_description: '',
  recipient_name: '',
  recipient_nickname: '',
  recipient_name_2: '',
  character_trait: '',
  signature_anecdote: '',
  signature_phrase: '',
  signature_place: '',
  future_wish: '',
  signature_passion: '',
  event_date: '',
  event_location: '',
  years_in_role: '',
  job_description_plain: '',
  will_be_missed_for: '',
  retirement_project: '',
  time_together: '',
  next_destination: '',
  how_they_met: '',
  complementarity: '',
  relationship_duration: '',
  couple_anecdote: '',
  parents_names: '',
  birth_anecdote: '',
  family_context: '',
  destination: '',
  trip_duration: '',
  trip_period: '',
  group_description: '',
  trip_highlight: '',
  unexpected_moment: '',
  signature_moment: '',
  trip_impact: '',
  project_name: '',
  project_duration: '',
  team_description: '',
  biggest_challenge: '',
  team_joke: '',
  project_impact: '',
  turning_point: '',
  family_name: '',
  reunion_occasion: '',
  generations_count: '',
  family_ritual: '',
  family_legend: '',
  family_saying: '',
  transmission_wish: '',
  chapter_count: 6,
  style_narratif: 'intime',
  finition: 'classique',
  papier: 'mat',
  book_subtitle: ''
};

const RESETTABLE_FIELDS = Object.keys(DEFAULT_FORM);

const EVENT_DEFINITIONS = [
  {
    type: 'anniversaire',
    label: 'Anniversaire',
    badge: 'ANNIVERSAIRE',
    screen1Title: 'Quel anniversaire ?',
    screen1Subtitle: "L'age determine le ton et la structure du livre",
    showNarrativeChoice: true,
    defaultNarrativeOptions: 'default',
    subtypes: [
      { id: 'anniversary_18', label: '18 ans', tone: 'Tendre et espiegle', style: 'intime', chapterCount: 6 },
      { id: 'anniversary_30', label: '30 ans', tone: 'Nostalgique et plein d elan', style: 'humoristique', chapterCount: 6 },
      { id: 'anniversary_40_50', label: '40 / 50 ans', tone: 'Profond et chaleureux', style: 'intime', chapterCount: 8 },
      { id: 'anniversary_60_70', label: '60 / 70 ans', tone: 'Transmission et celebration', style: 'poetique', chapterCount: 8 },
      { id: 'anniversary_80_plus', label: '80 ans +', tone: 'Memoriel et lumineux', style: 'poetique', chapterCount: 8 },
      { id: 'anniversary_other', label: 'Autre age', tone: 'Saisie libre', style: 'intime', chapterCount: 6, extraField: 'custom_age' }
    ]
  },
  {
    type: 'retraite',
    label: 'Retraite',
    badge: 'RETRAITE',
    screen1Title: 'Qui contribue au livre ?',
    screen1Subtitle: 'Le cercle de contributeurs determine la structure des chapitres',
    showNarrativeChoice: true,
    defaultNarrativeOptions: 'default',
    subtypes: [
      { id: 'retirement_pro', label: 'Collegues', tone: 'Humour et fierte professionnelle', style: 'factuel', chapterCount: 6, defaults: { contributor_circle: 'pro' } },
      { id: 'retirement_family', label: 'Famille', tone: 'Tendresse et transmission', style: 'intime', chapterCount: 6, defaults: { contributor_circle: 'family' } },
      { id: 'retirement_mixed', label: 'Les deux', tone: 'Equilibre des deux registres', style: 'intime', chapterCount: 8, defaults: { contributor_circle: 'mixed' } }
    ]
  },
  {
    type: 'depart',
    label: 'Depart',
    badge: 'DEPART',
    screen1Title: 'Quel type de depart ?',
    screen1Subtitle: 'Le contexte determine le registre emotionnel du livre',
    showNarrativeChoice: true,
    defaultNarrativeOptions: 'default',
    subtypes: [
      { id: 'departure_job', label: 'Nouveau poste / entreprise', tone: 'Nostalgie d equipe et elan', style: 'factuel', chapterCount: 6, defaults: { departure_context: 'job' } },
      { id: 'departure_expat', label: 'Expatriation / etranger', tone: 'Emotion forte et aventure', style: 'poetique', chapterCount: 8, defaults: { departure_context: 'expat' } },
      { id: 'departure_move', label: 'Demenagement / ville', tone: 'Memoire des lieux et avenir', style: 'intime', chapterCount: 6, defaults: { departure_context: 'move' } }
    ]
  },
  {
    type: 'mariage',
    label: 'Mariage / Union',
    badge: 'MARIAGE / UNION',
    screen1Title: 'Quelle occasion ?',
    screen1Subtitle: '',
    showNarrativeChoice: false,
    subtypes: [
      { id: 'wedding_marriage', label: 'Mariage', tone: 'Celebration et emotion', style: 'poetique', chapterCount: 8 },
      { id: 'wedding_pacs', label: 'PACS ou union libre', tone: 'Intime et complice', style: 'intime', chapterCount: 6 },
      { id: 'wedding_anniversary', label: 'Noces de...', tone: 'Memoriel et gratitude', style: 'poetique', chapterCount: 8, extraField: 'wedding_anniversary_years' }
    ]
  },
  {
    type: 'naissance',
    label: 'Naissance',
    badge: 'NAISSANCE',
    screen1Title: 'A quel moment creez-vous ce livre ?',
    screen1Subtitle: '',
    showNarrativeChoice: false,
    subtypes: [
      { id: 'birth_after', label: 'Apres la naissance', tone: 'Doux et lumineux', style: 'intime', chapterCount: 6 },
      { id: 'birth_during', label: 'Pendant la grossesse', tone: 'Anticipation et amour', style: 'poetique', chapterCount: 6 }
    ]
  },
  {
    type: 'voyage',
    label: 'Voyage / Vacances',
    badge: 'VOYAGE / VACANCES',
    screen1Title: 'Qui etait du voyage ?',
    screen1Subtitle: '',
    showNarrativeChoice: false,
    subtypes: [
      { id: 'trip_friends', label: 'Entre amis', tone: 'Complice et epique', style: 'humoristique', chapterCount: 6 },
      { id: 'trip_family', label: 'En famille', tone: 'Tendre et decale', style: 'intime', chapterCount: 8 },
      { id: 'trip_school', label: 'Voyage scolaire / colo', tone: 'Espiegle et souvenir d enfance', style: 'factuel', chapterCount: 6 }
    ]
  },
  {
    type: 'projet',
    label: 'Fin de projet',
    badge: 'FIN DE PROJET',
    screen1Title: 'Quel type de projet ?',
    screen1Subtitle: '',
    showNarrativeChoice: false,
    subtypes: [
      { id: 'project_company', label: "Projet d'entreprise", tone: "Fierte d equipe et humour interne", style: 'factuel', chapterCount: 6 },
      { id: 'project_association', label: 'Projet associatif / evenementiel', tone: 'Passion et reconnaissance', style: 'intime', chapterCount: 6 },
      { id: 'project_school', label: 'Promotion / cursus scolaire', tone: 'Nostalgie joyeuse et avenir', style: 'intime', chapterCount: 6 }
    ]
  },
  {
    type: 'famille',
    label: 'Reunion de famille',
    badge: 'REUNION DE FAMILLE',
    screen1Title: 'Quelle occasion ?',
    screen1Subtitle: '',
    showNarrativeChoice: false,
    subtypes: [
      { id: 'family_annual', label: 'Reunion annuelle', tone: 'Rituel et appartenance', style: 'intime', chapterCount: 6 },
      { id: 'family_reunion', label: 'Retrouvailles exceptionnelles', tone: 'Emotion et redecouverte', style: 'poetique', chapterCount: 8 },
      { id: 'family_memory', label: 'Livre de memoire / genealogie', tone: 'Memoriel et transmission', style: 'poetique', chapterCount: 8 }
    ]
  },
  {
    type: 'custom',
    label: 'Choix libre',
    badge: 'CHOIX LIBRE',
    screen1Title: 'Decrivez votre evenement',
    screen1Subtitle: 'En quelques mots, dites-nous de quoi il s agit',
    showNarrativeChoice: true,
    defaultNarrativeOptions: 'custom',
    subtypes: [
      { id: 'custom', label: 'Choix libre', tone: 'Souple et personnalise', style: 'intime', chapterCount: 6 }
    ]
  }
];

const DEFAULT_NARRATIVE_OPTIONS = [
  { value: 'third_person', label: "Pour quelqu'un", description: 'Un cadeau collectif. Les proches racontent a la 3e personne.' },
  { value: 'second_person', label: 'Pour moi-meme', description: 'Je collecte les souvenirs de mes proches sur ma propre vie.' }
];

const CUSTOM_NARRATIVE_OPTIONS = [
  ...DEFAULT_NARRATIVE_OPTIONS,
  { value: 'group', label: 'Pour un groupe', description: 'Le livre est ecrit par et pour un collectif.' }
];

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeNullable(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function hasValue(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return normalizeText(value).length > 0;
}

const INVALID_TITLE_PATTERNS = [
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

function sanitizeTitleSuggestion(value) {
  return normalizeText(value)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^(?:title|titre)\s*[:\-]\s*/i, '')
    .replace(/^\d+[\.\)\-:]\s*/g, '')
    .trim();
}

function hasSuspiciousRepeatedTitleWords(value) {
  const stopWords = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'a', 'en', 'pour']);
  const tokens = sanitizeTitleSuggestion(value)
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

function extractRelevantTitleTokens(form, eventDef) {
  const rawValues = [
    getPrimaryRecipientName(form),
    form.recipient_nickname,
    form.recipient_name_2,
    getEffectiveLocation(form),
    form.destination,
    form.project_name,
    form.family_name,
    form.event_custom_description,
    eventDef?.label
  ];

  return [...new Set(rawValues
    .flatMap((entry) => sanitizeTitleSuggestion(entry)
      .toLowerCase()
      .split(/[^a-z0-9à-ÿ'-]+/i))
    .map((token) => token.trim())
    .filter((token) => token.length >= 4))];
}

function isRelevantTitleSuggestion(value, form, eventDef) {
  const normalized = sanitizeTitleSuggestion(value).toLowerCase();
  if (!normalized) return false;
  const relevantTokens = extractRelevantTitleTokens(form, eventDef);
  if (relevantTokens.length === 0) {
    return !INVALID_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
  }
  return relevantTokens.some((token) => normalized.includes(token));
}

function isLikelyTitleSuggestion(value, form = {}, eventDef = null) {
  const normalized = sanitizeTitleSuggestion(value);
  if (!normalized) return false;
  if (normalized.length < 4 || normalized.length > 90) return false;
  if (normalized.endsWith('?')) return false;
  if (/\*\*/.test(normalized)) return false;
  if (/[{}[\]]/.test(normalized)) return false;
  if (normalized.split(/\s+/).filter(Boolean).length > 10) return false;
  if (INVALID_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  if (hasSuspiciousRepeatedTitleWords(normalized)) return false;
  if (!isRelevantTitleSuggestion(normalized, form, eventDef)) return false;
  return true;
}

function authFetch(path, method, body, token) {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body || {})
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || 'Erreur de traitement.');
      error.payload = payload;
      throw error;
    }
    return payload;
  });
}

function groupFieldErrors(payload = {}) {
  const out = {};
  const entries = Array.isArray(payload?.fieldErrors) ? payload.fieldErrors : [];
  entries.forEach((entry) => {
    const field = normalizeText(entry?.field);
    if (!field) return;
    out[field] = normalizeText(entry?.message) || 'Champ invalide.';
  });
  return out;
}

function getEventDefinition(type) {
  return EVENT_DEFINITIONS.find((entry) => entry.type === type) || null;
}

function getSubtypeDefinition(eventDef, subtypeId) {
  if (!eventDef) return null;
  return eventDef.subtypes.find((entry) => entry.id === subtypeId) || null;
}

function inferEventTypeFromSearch(search = '') {
  const params = new URLSearchParams(search);
  const raw = normalizeText(params.get('event')).toLowerCase();
  return EVENT_PARAM_TO_TYPE[raw] || '';
}

function getPrimaryRecipientName(form) {
  switch (normalizeText(form.event_type)) {
    case 'projet':
      return normalizeText(form.project_name) || normalizeText(form.recipient_name);
    case 'famille':
      return normalizeText(form.family_name) || normalizeText(form.recipient_name);
    default:
      return normalizeText(form.recipient_name);
  }
}

function getEffectiveLocation(form) {
  if (normalizeText(form.event_type) === 'voyage') {
    return normalizeText(form.event_location) || normalizeText(form.destination);
  }
  return normalizeText(form.event_location);
}

function getAnniversaryAge(form) {
  switch (normalizeText(form.event_subtype)) {
    case 'anniversary_18': return 18;
    case 'anniversary_30': return 30;
    case 'anniversary_40_50': return 40;
    case 'anniversary_60_70': return 60;
    case 'anniversary_80_plus': return 80;
    case 'anniversary_other': {
      const parsed = Number(form.custom_age);
      return Number.isFinite(parsed) ? parsed : null;
    }
    default:
      return null;
  }
}

function buildFallbackTitles(form, eventDef, subtypeDef) {
  const recipient = normalizeText(getPrimaryRecipientName(form)) || 'vos souvenirs';
  const secondRecipient = normalizeText(form.recipient_name_2);
  const eventType = normalizeText(eventDef?.type).toLowerCase();
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

  return [...new Set((byEvent[eventType] || byEvent.custom).map((entry) => normalizeText(entry)).filter(Boolean))].slice(0, 3);
}

function getVisibleSteps(eventDef) {
  const steps = [{ id: 1, label: eventDef ? eventDef.screen1Title : "Choisissez l'evenement" }];
  if (eventDef?.showNarrativeChoice) {
    steps.push({ id: 2, label: 'Ce livre est...' });
  }
  steps.push({ id: 3, label: 'Les details' });
  steps.push({ id: 4, label: 'Titre du livre' });
  return steps;
}

function getNarrativeOptions(eventDef) {
  if (!eventDef?.showNarrativeChoice) return [];
  return eventDef.defaultNarrativeOptions === 'custom' ? CUSTOM_NARRATIVE_OPTIONS : DEFAULT_NARRATIVE_OPTIONS;
}

function getNarrativeLabel(value) {
  if (value === 'second_person') return 'Pour moi';
  if (value === 'group') return 'Pour un groupe';
  return "Pour quelqu'un";
}

function getToneBadgeLabel(eventDef, form, subtypeDef) {
  if (eventDef?.showNarrativeChoice) {
    if (form.narrative_person === 'second_person') return 'Ton direct · tu / vous';
    if (form.narrative_person === 'group') return 'Ton collectif · nous / le groupe';
    return 'Ton narratif · il / elle';
  }
  return `Ton par defaut · ${normalizeText(subtypeDef?.tone || subtypeDef?.label || eventDef?.label)}`;
}

function buildContextItems(eventDef, subtypeDef, form, options = {}) {
  const eventLocked = Boolean(options?.eventLocked);
  const items = [];
  if (eventDef) {
    const subtypeText = eventDef.type === 'custom'
      ? normalizeText(form.event_custom_description) || 'Choix libre'
      : normalizeText(subtypeDef?.label);
    items.push(`Evenement : ${eventDef.label}${subtypeText ? ` · ${subtypeText}` : ''}`);
  }
  if (eventDef?.showNarrativeChoice) {
    items.push(`Destinataire : ${getNarrativeLabel(form.narrative_person)}`);
  }
  items.push(`Ton : ${normalizeText(subtypeDef?.tone || subtypeDef?.label || 'Personnalise')}`);
  return items;
}

function field(key, label, extra = {}) {
  return { key, label, type: 'text', ...extra };
}

function textarea(key, label, extra = {}) {
  return { key, label, type: 'textarea', ...extra };
}

function numberField(key, label, extra = {}) {
  return { key, label, type: 'number', ...extra };
}

function dateField(key, label, extra = {}) {
  return { key, label, type: 'date', ...extra };
}

function isSecondPerson(form) {
  return normalizeText(form.narrative_person) === 'second_person';
}

function isGroupPerson(form) {
  return normalizeText(form.narrative_person) === 'group';
}

function getFieldGroups(eventDef, subtypeDef, form) {
  const second = isSecondPerson(form);
  const group = isGroupPerson(form);
  const subtypeId = normalizeText(subtypeDef?.id);

  switch (normalizeText(eventDef?.type)) {
    case 'anniversaire':
      return {
        required: [
          field('recipient_name', second ? 'Votre prenom' : 'Prenom de la personne fetee', {
            helper: second
              ? 'Utilise pour personnaliser l amorce et le ton des contributions'
              : 'Utilise dans tous les chapitres et le titre du livre',
            placeholder: 'Ex: Omar'
          }),
          field(
            'character_trait',
            subtypeId === 'anniversary_18'
              ? (second ? 'Votre trait - ce qui vous rend unique' : 'Son trait - ce qui le/la rend unique')
              : subtypeId === 'anniversary_30'
                ? (second ? 'Votre trait le plus marquant' : 'Son trait le plus marquant')
                : subtypeId === 'anniversary_60_70'
                  ? (second ? 'Ce que vous avez transmis aux autres' : 'Ce qu il/elle a transmis aux autres')
                  : subtypeId === 'anniversary_80_plus'
                    ? (second ? 'L empreinte que vous laissez sur les gens' : 'L empreinte qu il/elle laisse sur les gens')
                    : (second ? 'Votre trait de caractere le plus marquant' : 'Son trait de caractere le plus marquant'),
            {
              helper: 'En quelques mots — sera le fil rouge du livre',
              placeholder: 'Ex: genereux, solaire, rassurant'
            }
          ),
          textarea(
            'signature_anecdote',
            subtypeId === 'anniversary_18'
              ? (second ? 'Une anecdote que vos proches pourront raconter' : "L'anecdote qui fait toujours rire")
              : subtypeId === 'anniversary_30'
                ? (second ? 'Une anecdote sur vous que vos proches pourront developper' : "L'anecdote que tout le monde raconte")
                : subtypeId === 'anniversary_40_50'
                  ? (second ? 'Une anecdote emblematique sur vous' : "L'anecdote emblematique")
                  : subtypeId === 'anniversary_60_70'
                    ? (second ? "L'histoire qu'on raconte toujours sur vous" : "L'histoire qu'on raconte toujours en famille")
                    : subtypeId === 'anniversary_80_plus'
                      ? (second ? 'La legende que toute la famille raconte sur vous' : 'La legende que toute la famille connait')
                      : (second ? 'Une anecdote emblematique sur vous' : "L'anecdote emblematique"),
            {
              helper: second
                ? 'Elle guidera les contributions de vos proches'
                : "Les suggestions de chapitres s appuient dessus",
              placeholder: 'Decrivez une anecdote concrete.'
            }
          ),
          dateField('event_date', "Date de l'anniversaire"),
          field('event_location', 'Ville / lieu de la fete', { placeholder: 'Ex: Paris' })
        ],
        optional: [
          field('recipient_nickname', 'Surnom ou petit nom', {
            helper: 'Ex : Papy Jo, La Chef — enrichit le ton du livre'
          }),
          field('signature_phrase', second ? 'Votre expression ou phrase fetiche' : 'Sa phrase ou expression signature', {
            helper: 'Peut devenir un fil conducteur entre les chapitres'
          }),
          field(
            'signature_place',
            subtypeId === 'anniversary_60_70'
              ? (second ? 'Le lieu de votre vie' : 'Le lieu de toute une vie')
              : subtypeId === 'anniversary_80_plus'
                ? (second ? 'Votre lieu de vie symbolique' : 'Son lieu de vie symbolique')
                : (second ? 'Un lieu qui vous ressemble' : 'Un lieu qui lui ressemble'),
            { helper: 'Ancrage sensoriel utilise dans les descriptions' }
          ),
          textarea(
            'future_wish',
            subtypeId === 'anniversary_60_70'
              ? (second ? 'Ce que vous voulez transmettre' : "Ce qu'on lui souhaite")
              : subtypeId === 'anniversary_80_plus'
                ? (second ? 'Votre message pour les generations suivantes' : 'Le message pour les generations suivantes')
                : (second ? 'Ce que vous voulez que ce livre transmette' : "Ce qu'on lui souhaite pour la suite"),
            { helper: 'Oriente la conclusion du livre' }
          ),
          field('signature_passion', second ? 'Votre passion ou activite principale' : 'Sa passion ou activite signature', {
            helper: 'Peut generer un chapitre dedie si renseigne'
          })
        ]
      };
    case 'retraite':
      return {
        required: [
          field('recipient_name', second ? 'Votre prenom' : 'Prenom de la personne qui part en retraite'),
          numberField('years_in_role', "Annees dans l'entreprise ou la fonction", {
            helper: "Donne l'echelle temporelle du livre",
            min: 1,
            max: 80
          }),
          textarea('job_description_plain', second ? 'Votre role en quelques mots' : 'Son poste ou role en quelques mots', {
            helper: 'Pas le titre officiel — ex : celle qui gerait tout sans qu on le voie'
          }),
          textarea('will_be_missed_for', second ? 'Ce que vous pensez laisser derriere vous' : 'Ce qui va manquer a ceux qui restent'),
          dateField('event_date', 'Date du depart en retraite'),
          field('event_location', 'Ville / lieu de la fete')
        ],
        optional: [
          field('recipient_nickname', 'Surnom ou petit nom'),
          textarea('retirement_project', second ? 'Votre projet pour la retraite' : 'Son projet pour la retraite', {
            helper: "Oriente le chapitre final vers l'avenir"
          }),
          textarea('signature_anecdote', 'Anecdote de bureau emblematique'),
          field('signature_phrase', second ? 'Votre phrase fetiche au travail' : 'Sa phrase fetiche au travail'),
          textarea('future_wish', second ? "Ce que vous voulez que ce livre transmette" : "Ce qu'on lui souhaite")
        ]
      };
    case 'depart':
      return {
        required: [
          field('recipient_name', second ? 'Votre prenom' : 'Prenom de la personne qui part'),
          field('time_together', second ? 'Combien de temps avez-vous ete parmi eux ?' : 'Combien de temps a-t-il/elle ete parmi vous ?', {
            helper: 'Ex : 3 ans dans l equipe, 5 ans dans ce quartier'
          }),
          textarea('will_be_missed_for', second ? 'Ce que vous pensez laisser derriere vous' : 'Ce qui va le plus manquer'),
          dateField('event_date', 'Date du depart'),
          field('event_location', 'Ville / lieu de la fete')
        ],
        optional: [
          field('recipient_nickname', 'Surnom ou petit nom'),
          field('next_destination', second ? 'Votre prochaine destination ou etape' : 'Sa prochaine destination ou etape', {
            helper: "Oriente l'epilogue vers l'avenir"
          }),
          textarea('signature_anecdote', 'Anecdote emblematique partagee'),
          field('signature_phrase', second ? 'Votre phrase ou expression signature' : 'Sa phrase ou expression signature'),
          textarea('future_wish', second ? 'Ce que vous voulez transmettre' : "Ce qu'on lui souhaite")
        ]
      };
    case 'mariage':
      return {
        required: [
          field('recipient_name', 'Prenom du / de la marie·e 1'),
          field('recipient_name_2', 'Prenom du / de la marie·e 2'),
          textarea('how_they_met', 'Comment ils se sont rencontres', {
            helper: 'En 1 a 2 phrases naturelles — ancrage narratif de tout le livre'
          }),
          textarea('complementarity', 'Ce qui les rend complementaires', {
            helper: 'Ex : elle est spontanee, lui planifie tout'
          }),
          dateField('event_date', "Date de l'evenement"),
          field('event_location', 'Lieu de la ceremonie ou de la fete')
        ],
        optional: [
          field('relationship_duration', 'Duree de leur relation avant ce jour', {
            helper: 'Calibre la profondeur des chapitres sur leur histoire commune'
          }),
          textarea('couple_anecdote', 'Anecdote de couple que tout le monde connait'),
          field('signature_place', 'Leur lieu symbolique', {
            helper: 'Ex : le cafe ou ils se retrouvaient'
          }),
          textarea('future_wish', "Ce qu'on leur souhaite")
        ]
      };
    case 'naissance':
      return {
        required: [
          field('recipient_name', 'Prenom du bebe', {
            helper: "Indiquez 'A venir' si le prenom n'est pas encore choisi"
          }),
          field('parents_names', 'Prenoms des parents'),
          textarea('future_wish', "Ce qu'on lui souhaite comme vie", {
            helper: "Oriente le ton general — lettre adressee a l'enfant"
          }),
          dateField('event_date', 'Date de naissance ou terme prevu'),
          field('event_location', 'Ville / lieu')
        ],
        optional: [
          field('family_context', 'Contexte familial', {
            helper: 'Ex : premier enfant, petit dernier de 4'
          }),
          textarea('birth_anecdote', 'Anecdote de la grossesse ou de la naissance'),
          field('character_trait', 'Premier trait de caractere deja visible')
        ]
      };
    case 'voyage':
      return {
        required: [
          field('recipient_name', 'Nom du voyage ou du groupe', {
            helper: 'Ex : Les Dupont en Espagne, Roadtrip Islande 2024'
          }),
          field('destination', 'Destination(s)', {
            helper: 'Plusieurs si roadtrip — chaque lieu peut devenir un chapitre'
          }),
          field('trip_duration', 'Duree du voyage'),
          field('trip_period', 'Periode', {
            helper: 'Ex : 10 jours en aout 2024'
          }),
          dateField('event_date', 'Date repere du voyage', {
            helper: 'Date de depart ou date repere pour le livre'
          }),
          textarea('group_description', 'Qui etait du voyage', {
            helper: 'Ex : famille de 5 dont 3 enfants, 4 amies de lycee'
          }),
          textarea('trip_highlight', 'Le moment le plus fort du voyage')
        ],
        optional: [
          textarea('unexpected_moment', "Le moment inattendu ou l'imprevu", {
            helper: 'Oriente le chapitre aventure / rebondissement'
          }),
          field('signature_moment', 'Le plat / lieu / activite incontournable'),
          textarea('trip_impact', 'Ce que ce voyage a change', {
            helper: "Oriente l'epilogue si renseigne"
          })
        ]
      };
    case 'projet':
      return {
        required: [
          field('project_name', 'Nom du projet'),
          field('project_duration', 'Duree du projet', {
            helper: 'Ex : 18 mois, 2 saisons, 3 ans'
          }),
          textarea('team_description', "L'equipe en quelques mots", {
            helper: 'Ex : 7 personnes de 3 pays'
          }),
          textarea('biggest_challenge', 'Le plus grand defi surmonte'),
          dateField('event_date', 'Date de fin du projet'),
          field('event_location', 'Ville / lieu')
        ],
        optional: [
          field('team_joke', "La phrase ou le running joke d'equipe"),
          textarea('project_impact', 'Ce que le projet a change'),
          textarea('turning_point', 'Le moment de bascule', {
            helper: "Quand tout a failli s'arreter"
          })
        ]
      };
    case 'famille':
      return {
        required: [
          field('family_name', 'Nom de famille ou du groupe'),
          field('reunion_occasion', 'Occasion de la reunion', {
            helper: 'Ex : reunion estivale annuelle, 20 ans sans se voir'
          }),
          numberField('generations_count', 'Nombre de generations reunies', {
            helper: 'Calibre la structure des chapitres',
            min: 1,
            max: 8
          }),
          dateField('event_date', 'Date de la reunion'),
          field('event_location', 'Lieu de la reunion')
        ],
        optional: [
          textarea('family_ritual', 'Le rituel familial immuable'),
          textarea('family_legend', 'La legende familiale que tout le monde connait'),
          field('family_saying', 'La phrase qui se transmet de generation en generation'),
          textarea('transmission_wish', 'Ce que la famille veut transmettre aux plus jeunes')
        ]
      };
    case 'custom':
      return {
        required: [
          field(
            'recipient_name',
            group
              ? 'Nom du groupe ou du collectif'
              : (second ? 'Votre prenom' : 'Prenom ou nom de la personne concernee')
          ),
          field(
            'character_trait',
            group
              ? 'Ce qui rend ce groupe unique'
              : (second ? 'Ce qui vous rend unique' : 'Ce qui le/la rend unique')
          ),
          textarea(
            'signature_anecdote',
            group
              ? 'Un souvenir ou moment fort du groupe'
              : (second ? 'Une anecdote sur vous' : 'Une anecdote emblematique')
          ),
          dateField('event_date', "Date de l'evenement"),
          field('event_location', 'Ville / lieu')
        ],
        optional: [
          field('recipient_nickname', 'Surnom ou petit nom'),
          textarea('future_wish', "Ce qu'on souhaite pour la suite"),
          field('signature_phrase', 'Phrase ou expression signature')
        ]
      };
    default:
      return { required: [], optional: [] };
  }
}

function renderSuggestionDescription(index) {
  return TITLE_STYLE_HINTS[index] || 'Style premium';
}

function getStep1Validity(eventDef, form) {
  if (!eventDef) return false;
  if (eventDef.type === 'custom') {
    return hasValue(form.event_custom_description);
  }
  if (!hasValue(form.event_subtype)) return false;
  if (form.event_subtype === 'anniversary_other') return hasValue(form.custom_age);
  if (form.event_subtype === 'wedding_anniversary') return hasValue(form.wedding_anniversary_years);
  return true;
}

function buildSuggestionVariables(form, eventDef, subtypeDef, selectedTitle = '') {
  const variables = {
    event_type: normalizeText(form.event_type || eventDef?.type),
    event_subtype: normalizeText(form.event_subtype || subtypeDef?.id),
    narrative_person: normalizeText(form.narrative_person),
    recipient_name: normalizeText(getPrimaryRecipientName(form)),
    recipient_nickname: normalizeText(form.recipient_nickname) || normalizeText(getPrimaryRecipientName(form)),
    event_date: normalizeText(form.event_date),
    event_location: normalizeText(getEffectiveLocation(form)),
    narrative_style: normalizeText(subtypeDef?.style || form.style_narratif || 'intime'),
    chapter_count: Number(subtypeDef?.chapterCount || form.chapter_count || 6),
    title: normalizeText(selectedTitle),
    book_subtitle: normalizeText(form.book_subtitle)
  };

  Object.entries(form).forEach(([key, value]) => {
    if (!hasValue(value)) return;
    variables[key] = value;
  });

  const derivedAge = getAnniversaryAge(form);
  if (derivedAge) variables.recipient_age = derivedAge;
  if (normalizeText(form.event_type) === 'projet') variables.recipient_name = normalizeText(form.project_name);
  if (normalizeText(form.event_type) === 'famille') variables.recipient_name = normalizeText(form.family_name);
  if (normalizeText(form.event_type) === 'voyage') variables.event_location = normalizeText(form.destination) || variables.event_location;
  if (normalizeText(form.event_type) === 'custom') variables.event_custom_description = normalizeText(form.event_custom_description);
  if (normalizeText(form.event_subtype) === 'wedding_anniversary') {
    variables.wedding_anniversary_years = normalizeText(form.wedding_anniversary_years);
  }

  return variables;
}

function buildCreationPayload(form, eventDef, subtypeDef, selectedTitle) {
  const payload = {
    event_type: normalizeText(form.event_type || eventDef?.type),
    event_subtype: normalizeText(form.event_subtype || subtypeDef?.id),
    recipient_name: normalizeText(getPrimaryRecipientName(form)),
    event_date: normalizeText(form.event_date),
    event_location: normalizeText(getEffectiveLocation(form)),
    recipient_nickname: normalizeNullable(form.recipient_nickname),
    narrative_style: normalizeText(subtypeDef?.style || form.style_narratif || 'intime'),
    chapter_count: Number(subtypeDef?.chapterCount || form.chapter_count || 6),
    book_finish: 'classique',
    paper_type: 'mat',
    title: normalizeText(selectedTitle)
  };

  switch (normalizeText(eventDef?.type)) {
    case 'anniversaire':
      payload.recipient_age = getAnniversaryAge(form);
      payload.character_trait = normalizeText(form.character_trait);
      payload.signature_anecdote = normalizeText(form.signature_anecdote);
      payload.signature_phrase = normalizeNullable(form.signature_phrase);
      payload.signature_place = normalizeNullable(form.signature_place);
      payload.future_wish = normalizeNullable(form.future_wish);
      payload.signature_passion = normalizeNullable(form.signature_passion);
      break;
    case 'retraite':
      payload.years_in_role = Number(form.years_in_role) || null;
      payload.job_description_plain = normalizeText(form.job_description_plain);
      payload.will_be_missed_for = normalizeText(form.will_be_missed_for);
      payload.contributor_circle = normalizeText(subtypeDef?.defaults?.contributor_circle || '');
      payload.retirement_project = normalizeNullable(form.retirement_project);
      payload.signature_anecdote = normalizeNullable(form.signature_anecdote);
      payload.signature_phrase = normalizeNullable(form.signature_phrase);
      payload.future_wish = normalizeNullable(form.future_wish);
      break;
    case 'depart':
      payload.departure_context = normalizeText(subtypeDef?.defaults?.departure_context || '');
      payload.time_together = normalizeText(form.time_together);
      payload.will_be_missed_for = normalizeText(form.will_be_missed_for);
      payload.next_destination = normalizeNullable(form.next_destination);
      payload.signature_anecdote = normalizeNullable(form.signature_anecdote);
      payload.signature_phrase = normalizeNullable(form.signature_phrase);
      payload.future_wish = normalizeNullable(form.future_wish);
      break;
    case 'mariage':
      payload.recipient_name_2 = normalizeText(form.recipient_name_2);
      payload.how_they_met = normalizeText(form.how_they_met);
      payload.complementarity = normalizeText(form.complementarity);
      payload.relationship_duration = normalizeNullable(
        normalizeText(form.relationship_duration)
        || (normalizeText(form.event_subtype) === 'wedding_anniversary' ? normalizeText(form.wedding_anniversary_years) : '')
      );
      payload.couple_anecdote = normalizeNullable(form.couple_anecdote);
      payload.signature_place = normalizeNullable(form.signature_place);
      payload.future_wish = normalizeNullable(form.future_wish);
      break;
    case 'naissance':
      payload.parents_names = normalizeText(form.parents_names);
      payload.future_wish = normalizeText(form.future_wish);
      payload.birth_anecdote = normalizeNullable(form.birth_anecdote);
      payload.character_trait = normalizeNullable(form.character_trait);
      payload.family_context = normalizeNullable(form.family_context);
      break;
    case 'voyage':
      payload.destination = normalizeText(form.destination);
      payload.trip_duration = normalizeText(form.trip_duration);
      payload.trip_period = normalizeText(form.trip_period);
      payload.group_description = normalizeText(form.group_description);
      payload.trip_highlight = normalizeText(form.trip_highlight);
      payload.unexpected_moment = normalizeNullable(form.unexpected_moment);
      payload.signature_moment = normalizeNullable(form.signature_moment);
      payload.trip_impact = normalizeNullable(form.trip_impact);
      break;
    case 'projet':
      payload.project_name = normalizeText(form.project_name);
      payload.project_duration = normalizeText(form.project_duration);
      payload.team_description = normalizeText(form.team_description);
      payload.biggest_challenge = normalizeText(form.biggest_challenge);
      payload.team_joke = normalizeNullable(form.team_joke);
      payload.project_impact = normalizeNullable(form.project_impact);
      payload.turning_point = normalizeNullable(form.turning_point);
      break;
    case 'famille':
      payload.family_name = normalizeText(form.family_name);
      payload.reunion_occasion = normalizeText(form.reunion_occasion);
      payload.generations_count = Number(form.generations_count) || null;
      payload.family_ritual = normalizeNullable(form.family_ritual);
      payload.family_legend = normalizeNullable(form.family_legend);
      payload.family_saying = normalizeNullable(form.family_saying);
      payload.transmission_wish = normalizeNullable(form.transmission_wish);
      break;
    case 'custom':
      payload.character_trait = normalizeText(form.character_trait);
      payload.signature_anecdote = normalizeText(form.signature_anecdote);
      payload.signature_phrase = normalizeNullable(form.signature_phrase);
      payload.future_wish = normalizeNullable(form.future_wish);
      break;
    default:
      break;
  }

  return payload;
}

function FieldRenderer({ meta, value, error, onChange }) {
  if (!meta) return null;
  return (
    <div className="form-group">
      <label>{meta.label}{meta.required ? ' *' : ''}</label>
      {meta.helper ? <p className="form-helper">{meta.helper}</p> : null}
      {meta.type === 'textarea' ? (
        <textarea
          className="create-book-textarea"
          value={value || ''}
          placeholder={meta.placeholder || ''}
          rows={meta.rows || 4}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type={meta.type === 'number' ? 'number' : (meta.type === 'date' ? 'date' : 'text')}
          value={value || ''}
          min={meta.min}
          max={meta.max}
          placeholder={meta.placeholder || ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? <p className="ab-field-error">{error}</p> : null}
    </div>
  );
}

export default function CreateBookLuxe() {
  const navigate = useNavigate();
  const location = useLocation();
  const saveTimerRef = useRef(null);
  const wizardCardRef = useRef(null);
  const autoResumeAttemptedRef = useRef(false);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [error, setError] = useState('');
  const [savedLabel, setSavedLabel] = useState('');
  const [optionalOpen, setOptionalOpen] = useState(() => window.innerWidth > 768);
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState(0);
  const [customTitle, setCustomTitle] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const forcedEventType = useMemo(() => inferEventTypeFromSearch(location.search), [location.search]);
  const isEventTypeLocked = Boolean(forcedEventType);
  const selectedEvent = useMemo(() => getEventDefinition(form.event_type), [form.event_type]);
  const selectedSubtype = useMemo(() => getSubtypeDefinition(selectedEvent, form.event_subtype), [selectedEvent, form.event_subtype]);
  const visibleSteps = useMemo(() => getVisibleSteps(selectedEvent), [selectedEvent]);
  const currentStepIndex = useMemo(() => {
    const index = visibleSteps.findIndex((item) => item.id === step);
    return index >= 0 ? index : 0;
  }, [visibleSteps, step]);
  const selectedTitle = useMemo(() => {
    const custom = normalizeText(customTitle);
    if (custom) return custom;
    const picked = normalizeText(titleSuggestions[selectedTitleIndex]);
    if (picked) return picked;
    return normalizeText(buildFallbackTitles(form, selectedEvent, selectedSubtype)[0]);
  }, [customTitle, titleSuggestions, selectedTitleIndex, form, selectedEvent, selectedSubtype]);
  const fieldGroups = useMemo(() => getFieldGroups(selectedEvent, selectedSubtype, form), [selectedEvent, selectedSubtype, form]);
  const narrativeOptions = useMemo(() => getNarrativeOptions(selectedEvent), [selectedEvent]);
  const step1Valid = useMemo(() => getStep1Validity(selectedEvent, form), [selectedEvent, form]);
  const step2Valid = useMemo(() => !selectedEvent?.showNarrativeChoice || hasValue(form.narrative_person), [selectedEvent, form.narrative_person]);
  const headerTitle = useMemo(
    () => (isEventTypeLocked && selectedEvent ? selectedEvent.label : 'Creez votre livre unique'),
    [isEventTypeLocked, selectedEvent]
  );
  const contextItems = useMemo(() => {
    const items = buildContextItems(selectedEvent, selectedSubtype, form);
    if (!isEventTypeLocked || !selectedEvent || items.length === 0) return items;
    const subtypeText = selectedEvent.type === 'custom'
      ? normalizeText(form.event_custom_description) || 'Choix libre'
      : normalizeText(selectedSubtype?.label) || selectedEvent.label;
    const nextItems = [...items];
    nextItems[0] = `Contexte : ${subtypeText}`;
    return nextItems;
  }, [isEventTypeLocked, selectedEvent, selectedSubtype, form]);

  useEffect(() => {
    const storedRaw = localStorage.getItem(STORAGE_KEY);
    const queryEventType = inferEventTypeFromSearch(location.search);
    let nextForm = { ...DEFAULT_FORM };
    let nextStep = 1;
    let nextSuggestions = [];
    let nextSelectedTitleIndex = 0;
    let nextCustomTitle = '';

    if (storedRaw) {
      try {
        const parsed = JSON.parse(storedRaw);
        if (parsed?.form && typeof parsed.form === 'object') {
          nextForm = { ...nextForm, ...parsed.form };
        }
        if (Array.isArray(parsed?.titleSuggestions)) nextSuggestions = parsed.titleSuggestions.slice(0, DEFAULT_TITLE_COUNT);
        if (Number.isFinite(Number(parsed?.selectedTitleIndex))) nextSelectedTitleIndex = Math.max(0, Math.min(2, Number(parsed.selectedTitleIndex)));
        nextCustomTitle = normalizeText(parsed?.customTitle);
        if (Number.isFinite(Number(parsed?.step))) nextStep = Number(parsed.step);
      } catch (_error) {
        nextForm = { ...DEFAULT_FORM };
      }
    }

    if (queryEventType && queryEventType !== nextForm.event_type) {
      const eventDef = getEventDefinition(queryEventType);
      nextForm = {
        ...DEFAULT_FORM,
        event_type: queryEventType,
        event_subtype: eventDef?.subtypes?.[0]?.id || (queryEventType === 'custom' ? 'custom' : ''),
        chapter_count: eventDef?.subtypes?.[0]?.chapterCount || 6,
        style_narratif: eventDef?.subtypes?.[0]?.style || 'intime'
      };
      nextStep = 1;
      nextSuggestions = [];
      nextSelectedTitleIndex = 0;
      nextCustomTitle = '';
    }

    setForm(nextForm);
    setStep(Math.max(1, Math.min(4, nextStep)));
    setTitleSuggestions(nextSuggestions);
    setSelectedTitleIndex(nextSelectedTitleIndex);
    setCustomTitle(nextCustomTitle);
  }, [location.search]);

  useEffect(() => {
    if (!selectedEvent) return;
    if (hasValue(form.event_subtype)) return;
    const firstSubtype = selectedEvent.subtypes[0];
    if (!firstSubtype) return;
    setForm((prev) => ({
      ...prev,
      event_subtype: firstSubtype.id,
      chapter_count: firstSubtype.chapterCount || 6,
      style_narratif: firstSubtype.style || 'intime'
    }));
  }, [selectedEvent, form.event_subtype]);

  useEffect(() => {
    if (!selectedEvent?.showNarrativeChoice && step === 2) {
      setStep(3);
    }
  }, [selectedEvent, step]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSavedLabel('Sauvegarde...');
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        step,
        form,
        titleSuggestions,
        selectedTitleIndex,
        customTitle
      }));
      setSavedLabel('Sauvegarde');
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [step, form, titleSuggestions, selectedTitleIndex, customTitle]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const focusWizardTop = () => {
    if (wizardCardRef.current?.scrollIntoView) {
      wizardCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const resetForNewEvent = (type) => {
    const nextEvent = getEventDefinition(type);
    setForm({
      ...DEFAULT_FORM,
      event_type: type,
      event_subtype: nextEvent?.subtypes?.[0]?.id || (type === 'custom' ? 'custom' : ''),
      chapter_count: nextEvent?.subtypes?.[0]?.chapterCount || 6,
      style_narratif: nextEvent?.subtypes?.[0]?.style || 'intime'
    });
    setStep(1);
    setTitleSuggestions([]);
    setSelectedTitleIndex(0);
    setCustomTitle('');
    setFieldErrors({});
  };

  const handleEventTypeSelect = (type) => {
    if (!type || type === form.event_type) return;
    const hasData = RESETTABLE_FIELDS.some((key) => hasValue(form[key]));
    if (hasData) {
      const confirmed = window.confirm('Changer ce choix reinitialisera les champs suivants. Continuer ?');
      if (!confirmed) return;
    }
    resetForNewEvent(type);
  };

  const handleSubtypeSelect = (subtypeId) => {
    if (!subtypeId || subtypeId === form.event_subtype) return;
    const hasData = RESETTABLE_FIELDS.some((key) => hasValue(form[key]));
    if (hasData && (step >= 3 || hasValue(form.recipient_name) || hasValue(form.character_trait) || hasValue(form.signature_anecdote))) {
      const confirmed = window.confirm('Changer ce choix reinitialisera les champs suivants. Continuer ?');
      if (!confirmed) return;
    }
    const subtype = getSubtypeDefinition(selectedEvent, subtypeId);
    setForm({
      ...DEFAULT_FORM,
      event_type: form.event_type,
      event_subtype: subtypeId,
      chapter_count: subtype?.chapterCount || 6,
      style_narratif: subtype?.style || 'intime'
    });
    setStep(1);
    setTitleSuggestions([]);
    setSelectedTitleIndex(0);
    setCustomTitle('');
    setFieldErrors({});
  };

  const handleStep1Continue = () => {
    const nextErrors = {};
    if (!selectedEvent) {
      nextErrors.event_type = "Choisissez d'abord un evenement.";
    } else if (selectedEvent.type === 'custom') {
      if (!hasValue(form.event_custom_description)) nextErrors.event_custom_description = 'Ce champ est obligatoire.';
    } else {
      if (!hasValue(form.event_subtype)) nextErrors.event_subtype = 'Choisissez un sous-type.';
      if (form.event_subtype === 'anniversary_other' && !hasValue(form.custom_age)) nextErrors.custom_age = 'Indiquez l age.';
      if (form.event_subtype === 'wedding_anniversary' && !hasValue(form.wedding_anniversary_years)) {
        nextErrors.wedding_anniversary_years = 'Indiquez le nombre d annees.';
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setStep(selectedEvent?.showNarrativeChoice ? 2 : 3);
  };

  const handleStep2Continue = () => {
    if (!step2Valid) {
      setFieldErrors({ narrative_person: 'Choisissez une option.' });
      return;
    }
    setFieldErrors({});
    setStep(3);
  };

  const loadTitleSuggestions = async () => {
    setError('');
    setLoadingSuggestions(true);
    try {
      const variables = buildSuggestionVariables(form, selectedEvent, selectedSubtype, selectedTitle);
      const response = await fetch(`${API_BASE}/ai/generate-book-titles-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Impossible de recuperer les suggestions.');
      const incoming = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
      const cleaned = incoming
        .map((entry) => sanitizeTitleSuggestion(entry))
        .filter((entry) => isLikelyTitleSuggestion(entry, form, selectedEvent));
      const fallback = buildFallbackTitles(form, selectedEvent, selectedSubtype)
        .map((entry) => sanitizeTitleSuggestion(entry))
        .filter(Boolean);
      const merged = [...new Set([...cleaned, ...fallback])].slice(0, DEFAULT_TITLE_COUNT);
      setTitleSuggestions(merged);
      setSelectedTitleIndex(0);
      setCustomTitle('');
    } catch (apiError) {
      setTitleSuggestions(buildFallbackTitles(form, selectedEvent, selectedSubtype));
      setSelectedTitleIndex(0);
      setCustomTitle('');
      setError(apiError.message || 'Suggestions indisponibles pour le moment.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleGoToTitleStep = async () => {
    const nextErrors = {};
    fieldGroups.required.forEach((meta) => {
      if (!hasValue(form[meta.key])) nextErrors[meta.key] = 'Ce champ est obligatoire.';
    });
    if (normalizeText(form.event_type) === 'voyage' && !hasValue(getEffectiveLocation(form))) {
      nextErrors.destination = nextErrors.destination || 'La destination est obligatoire.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setStep(4);
    await loadTitleSuggestions();
  };

  const goBack = () => {
    const previousVisibleStep = visibleSteps[Math.max(0, currentStepIndex - 1)];
    setStep(previousVisibleStep?.id || 1);
  };

  const handleCreateBook = async () => {
    setError('');
    setFieldErrors({});

    if (!hasValue(selectedTitle)) {
      setFieldErrors({ title: 'Choisissez un titre ou ecrivez votre propre titre.' });
      focusWizardTop();
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    if (!token) {
      localStorage.setItem(RETURN_TO_KEY, `${location.pathname}${location.search}`);
      localStorage.setItem(RESUME_CREATE_KEY, '1');
      setError('Connectez-vous ou creez un compte pour finaliser la creation du livre.');
      setShowLoginModal(true);
      focusWizardTop();
      return;
    }

    try {
      setCreating(true);
      const payload = buildCreationPayload(form, selectedEvent, selectedSubtype, selectedTitle);
      const started = await authFetch('/books/create/start', 'POST', payload, token);
      const bookId = normalizeText(started?.book?.id);
      if (!bookId) throw new Error('Impossible de creer le livre.');

      await authFetch(`/books/create/${bookId}/step2/complete`, 'POST', payload, token);
      const finished = await authFetch(`/books/create/${bookId}/step3/complete`, 'POST', {
        chapter_count: payload.chapter_count,
        narrative_style: payload.narrative_style,
        book_finish: payload.book_finish,
        paper_type: payload.paper_type
      }, token);

      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(RETURN_TO_KEY);
      localStorage.removeItem(RESUME_CREATE_KEY);
      navigate(normalizeText(finished?.redirectTo) || `/book/${bookId}`);
    } catch (createError) {
      const extracted = groupFieldErrors(createError?.payload);
      if (Object.keys(extracted).length > 0) setFieldErrors(extracted);
      setError(createError.message || 'Creation impossible pour le moment.');
      focusWizardTop();
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (autoResumeAttemptedRef.current) return undefined;
    if (step !== 4 || creating || showLoginModal) return undefined;
    if (localStorage.getItem(RESUME_CREATE_KEY) !== '1') return undefined;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session?.access_token) return;
      autoResumeAttemptedRef.current = true;
      localStorage.removeItem(RESUME_CREATE_KEY);
      setShowLoginModal(false);
      handleCreateBook();
    });

    return () => {
      active = false;
    };
  }, [step, creating, showLoginModal, selectedTitle, form, selectedEvent, selectedSubtype]);

  return (
    <div className="wizard-container event-create-flow">
      <div className="wizard-card" ref={wizardCardRef}>
        <header className="wizard-header">
          <div className="ab-header-top">
            <span className="event-badge">{selectedEvent?.badge || 'CREATION'}</span>
            <span className="ab-save-label">{savedLabel}</span>
          </div>
          <h1>{headerTitle}</h1>
          <div className="progress-steps ab-progress-steps">
            {visibleSteps.map((item, index) => {
              const active = item.id === step;
              const done = currentStepIndex > index;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`progress-step ab-progress-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                  onClick={() => {
                    if (index > currentStepIndex) return;
                    setStep(item.id);
                  }}
                >
                  <span className={`progress-bar ${active || done ? 'active' : ''}`} />
                  <span className={`progress-label ${active ? 'active' : ''}`}>Etape {index + 1}/{visibleSteps.length}</span>
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </div>
        </header>

        <section className="wizard-content">
          {error ? <div className="wizard-error">{error}</div> : null}

          {step === 1 ? (
            <div className="ab-step">
              <h2 className="form-title">{selectedEvent?.screen1Title || "Quel type de livre voulez-vous creer ?"}</h2>
              {selectedEvent?.screen1Subtitle ? <p className="form-intro">{selectedEvent.screen1Subtitle}</p> : null}

              {isEventTypeLocked && selectedEvent ? (
                <div className="ab-event-lock" aria-label="Evenement selectionne">
                  <span className="ab-event-lock-label">Parcours</span>
                  <strong className="ab-event-lock-title">{selectedEvent.label}</strong>
                  <span className="ab-event-lock-note">deja selectionne</span>
                </div>
              ) : (
                <>
                  <div className="ab-event-grid">
                    {EVENT_DEFINITIONS.map((eventDef) => (
                      <button
                        key={eventDef.type}
                        type="button"
                        className={`ab-event-card ${form.event_type === eventDef.type ? 'is-selected' : ''}`}
                        onClick={() => handleEventTypeSelect(eventDef.type)}
                      >
                        <span className="ab-select-title">{eventDef.label}</span>
                      </button>
                    ))}
                  </div>
                  {fieldErrors.event_type ? <p className="ab-field-error">{fieldErrors.event_type}</p> : null}
                </>
              )}

              {selectedEvent?.type === 'custom' ? (
                <div className="form-group">
                  <label>Quel est l evenement ? *</label>
                  <p className="form-helper">Ex : depart a la retraite de mon beau-pere, fin de notre association, voyage en famille au Japon</p>
                  <textarea
                    className="create-book-textarea"
                    value={form.event_custom_description || ''}
                    onChange={(event) => setField('event_custom_description', event.target.value)}
                    placeholder="Decrivez l evenement en quelques mots"
                  />
                  {fieldErrors.event_custom_description ? <p className="ab-field-error">{fieldErrors.event_custom_description}</p> : null}
                </div>
              ) : selectedEvent ? (
                <>
                  <div className="ab-subtype-grid">
                    {selectedEvent.subtypes.map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        className={`ab-select-card ${form.event_subtype === option.id ? 'is-selected' : ''}`}
                        onClick={() => handleSubtypeSelect(option.id)}
                      >
                        <span className="ab-select-title">{option.label}</span>
                        <small className="ab-select-subtitle">{option.tone}</small>
                      </button>
                    ))}
                  </div>
                  {fieldErrors.event_subtype ? <p className="ab-field-error">{fieldErrors.event_subtype}</p> : null}

                  {form.event_subtype === 'anniversary_other' ? (
                    <div className="form-group">
                      <label>Age libre *</label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={form.custom_age || ''}
                        onChange={(event) => setField('custom_age', event.target.value)}
                        placeholder="Ex: 45"
                      />
                      {fieldErrors.custom_age ? <p className="ab-field-error">{fieldErrors.custom_age}</p> : null}
                    </div>
                  ) : null}

                  {form.event_subtype === 'wedding_anniversary' ? (
                    <div className="form-group">
                      <label>Combien d annees ? *</label>
                      <input
                        type="text"
                        value={form.wedding_anniversary_years || ''}
                        onChange={(event) => setField('wedding_anniversary_years', event.target.value)}
                        placeholder="Ex: 10 ans, 25 ans, 50 ans"
                      />
                      {fieldErrors.wedding_anniversary_years ? <p className="ab-field-error">{fieldErrors.wedding_anniversary_years}</p> : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="ab-actions-row">
                <button type="button" className="btn btn-primary" onClick={handleStep1Continue} disabled={!step1Valid}>
                  Continuer
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 && selectedEvent?.showNarrativeChoice ? (
            <div className="ab-step">
              <h2 className="form-title">Ce livre est...</h2>
              <p className="form-intro">Le ton sera different selon que vous ecrivez sur vous ou sur quelqu un.</p>
              <div className={`ab-scope-grid ${narrativeOptions.length === 3 ? 'ab-scope-grid--three' : ''}`}>
                {narrativeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`ab-scope-card ${form.narrative_person === option.value ? 'is-selected' : ''}`}
                    onClick={() => setField('narrative_person', option.value)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
              {fieldErrors.narrative_person ? <p className="ab-field-error">{fieldErrors.narrative_person}</p> : null}

              <div className="ab-actions-row">
                <button type="button" className="btn button-secondary" onClick={goBack}>Retour</button>
                <button type="button" className="btn btn-primary" onClick={handleStep2Continue} disabled={!step2Valid}>
                  Continuer
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="ab-step">
              <div className="ab-context-bar">
                {contextItems.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="ab-tone-badge">{getToneBadgeLabel(selectedEvent, form, selectedSubtype)}</div>

              <h2 className="form-title">Les details</h2>

              {fieldGroups.required.map((meta) => (
                <FieldRenderer
                  key={meta.key}
                  meta={{ ...meta, required: true }}
                  value={form[meta.key]}
                  error={fieldErrors[meta.key]}
                  onChange={(value) => setField(meta.key, value)}
                />
              ))}

              {fieldGroups.optional.length > 0 ? (
                <div className="ab-collapsible">
                  <button type="button" className="ab-collapsible-trigger" onClick={() => setOptionalOpen((prev) => !prev)}>
                    Enrichir le livre
                  </button>
                  <p className="ab-collapsible-subtitle">Ces informations ameliorent la qualite des suggestions</p>
                  {optionalOpen ? (
                    <div className="ab-grid-2">
                      {fieldGroups.optional.map((meta) => (
                        <FieldRenderer
                          key={meta.key}
                          meta={meta}
                          value={form[meta.key]}
                          error={fieldErrors[meta.key]}
                          onChange={(value) => setField(meta.key, value)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="ab-actions-row">
                <button type="button" className="btn button-secondary" onClick={goBack}>Retour</button>
                <button type="button" className="btn btn-primary" onClick={handleGoToTitleStep}>
                  Voir les suggestions de titres
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="ab-step">
              <div className="ab-context-bar">
                {contextItems.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="ab-tone-badge">{getToneBadgeLabel(selectedEvent, form, selectedSubtype)}</div>

              <h2 className="form-title">Titre du livre</h2>
              <p className="form-intro">3 titres ont ete suggeres a partir de vos informations.</p>
              <p className="form-helper ab-title-helper">Vous pourrez modifier ce titre plus tard si besoin.</p>

              <div className="ab-title-grid">
                {Array.from({ length: DEFAULT_TITLE_COUNT }).map((_, index) => (
                  loadingSuggestions ? (
                    <div key={`skeleton-${index}`} className="ab-title-card is-loading">
                      <div className="ab-skeleton-line lg" />
                      <div className="ab-skeleton-line md" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      key={`title-${index}`}
                      className={`ab-title-card ${selectedTitleIndex === index && !hasValue(customTitle) ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSelectedTitleIndex(index);
                        setCustomTitle('');
                      }}
                    >
                      <strong>{normalizeText(titleSuggestions[index]) || `Suggestion ${index + 1}`}</strong>
                      <small>{renderSuggestionDescription(index)}</small>
                    </button>
                  )
                ))}
              </div>

              <div className="form-group">
                <label>Ou ecrivez votre propre titre</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(event) => setCustomTitle(event.target.value)}
                  placeholder="Saisissez votre titre personnalise"
                />
                {fieldErrors.title ? <p className="ab-field-error">{fieldErrors.title}</p> : null}
              </div>

              <div className="form-group">
                <label>
                  Sous-titre du livre <span className="ab-optional-chip">optionnel</span>
                </label>
                <input
                  type="text"
                  value={form.book_subtitle || ''}
                  onChange={(event) => setField('book_subtitle', event.target.value)}
                  placeholder="Ex : Edition prestige · Paris, 2025"
                />
              </div>

              <div className="ab-actions-row">
                <button type="button" className="btn button-secondary" onClick={goBack}>Retour</button>
                <button type="button" className="btn btn-primary" onClick={handleCreateBook} disabled={creating}>
                  {creating ? 'Creation en cours...' : 'Creer le livre'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {showLoginModal ? (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-icon">!</div>
            <h3 className="modal-title">Connexion requise pour finaliser</h3>
            <p className="modal-text">Vos etapes sont sauvegardees. Connectez-vous puis revenez sur creation de livre pour finaliser.</p>
            <div className="modal-actions">
              <Link to="/login" className="btn btn-primary modal-button">Se connecter</Link>
              <Link to="/register" className="btn button-secondary modal-button">Creer un compte</Link>
              <button type="button" className="modal-link" onClick={() => setShowLoginModal(false)}>Continuer plus tard</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
