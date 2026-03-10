import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';
import './PromptAdminLuxe.css';

const PROMPT_KEY_OPTIONS = [
  { value: 'chapter_generation', label: 'Generation chapitres' },
  { value: 'question_generation', label: 'Generation questions' },
  { value: 'content_generation', label: 'Generation contenu' }
];

const EVENT_PRESETS = [
  '*',
  'anniversaire',
  'mariage',
  'naissance',
  'depart',
  'projet',
  'retraite',
  'vacances'
];

const DEFAULT_MODEL = 'mistral-small-latest';

const SIMPLE_SCENARIOS = [
  {
    value: 'book_title',
    label: 'Titre du livre',
    promptKey: 'chapter_generation',
    objective: 'Produire un titre premium et memorable.'
  },
  {
    value: 'chapter_titles',
    label: 'Titres des chapitres',
    promptKey: 'chapter_generation',
    objective: 'Produire un sommaire elegant et personnalise.'
  },
  {
    value: 'questions',
    label: 'Questions',
    promptKey: 'question_generation',
    objective: 'Produire des questions narratives pour les proches.'
  },
  {
    value: 'chapter_content',
    label: 'Contenu des chapitres',
    promptKey: 'content_generation',
    objective: 'Rediger le texte principal d un chapitre.'
  },
  {
    value: 'introduction',
    label: 'Introduction',
    promptKey: 'content_generation',
    objective: 'Rediger une ouverture de livre fluide et emotionnelle.'
  },
  {
    value: 'conclusion',
    label: 'Conclusion',
    promptKey: 'content_generation',
    objective: 'Rediger une conclusion coherente et touchante.'
  }
];

const CHAPTER_PROMPT_VARIABLES = [
  {
    placeholder: '{{count}}',
    frontKey: 'chaptersCount / chaptersToAdd',
    source: 'create-book: pages/8, book page: delta de chapitres',
    description: 'Nombre de chapitres a generer.'
  },
  {
    placeholder: '{{eventType}}',
    frontKey: 'bookData.event_type / book.event_type',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Type d evenement (anniversaire, projet, etc.).'
  },
  {
    placeholder: '{{style}}',
    frontKey: 'bookData.style_narratif / book.style_narratif',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Ton narratif cible.'
  },
  {
    placeholder: '{{bookTitle}}',
    frontKey: 'bookData.title / book.title',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Titre du livre.'
  },
  {
    placeholder: '{{recipientName}}',
    frontKey: 'bookData.recipient_name / book.recipient_name',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Nom de la personne ou equipe cible.'
  },
  {
    placeholder: '{{recipientAge}}',
    frontKey: 'bookData.recipient_age / book.recipient_age',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Age/anciennete utile pour adapter le vocabulaire.'
  },
  {
    placeholder: '{{recipientGender}}',
    frontKey: 'bookData.recipient_gender / book.recipient_gender',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Genre de reference.'
  },
  {
    placeholder: '{{recipientNickname}}',
    frontKey: 'bookData.recipient_nickname',
    source: 'CreateBookWizardLuxe',
    description: 'Surnom pour personnalisation emotionnelle.'
  },
  {
    placeholder: '{{recipientTrait}}',
    frontKey: 'bookData.recipient_trait',
    source: 'CreateBookWizardLuxe',
    description: 'Trait marquant.'
  },
  {
    placeholder: '{{recipientAnecdote}}',
    frontKey: 'bookData.recipient_anecdote',
    source: 'CreateBookWizardLuxe',
    description: 'Anecdote centrale.'
  },
  {
    placeholder: '{{additionalContext}}',
    frontKey: 'bookData.ai_project_brief / book.cover_config.aiProjectBrief',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Contexte additionnel libre.'
  }
];

const QUESTION_PROMPT_VARIABLES = [
  {
    placeholder: '{{chapterTitle}}',
    frontKey: 'chapter.title',
    source: 'useQuestions / Step1Questions',
    description: 'Titre du chapitre en cours.'
  },
  {
    placeholder: '{{eventType}}',
    frontKey: 'book.event_type',
    source: 'useQuestions / Step1Questions',
    description: 'Type d evenement.'
  },
  {
    placeholder: '{{style}}',
    frontKey: 'book.style_narratif',
    source: 'useQuestions / Step1Questions',
    description: 'Ton narratif choisi.'
  },
  {
    placeholder: '{{bookTitle}}',
    frontKey: 'book.title',
    source: 'useQuestions / Step1Questions',
    description: 'Titre du livre.'
  },
  {
    placeholder: '{{recipientName}}',
    frontKey: 'book.recipient_name',
    source: 'useQuestions / Step1Questions',
    description: 'Nom cible.'
  },
  {
    placeholder: '{{recipientAge}}',
    frontKey: 'book.recipient_age',
    source: 'useQuestions / Step1Questions',
    description: 'Age cible.'
  },
  {
    placeholder: '{{recipientGender}}',
    frontKey: 'book.recipient_gender',
    source: 'useQuestions / Step1Questions',
    description: 'Genre cible.'
  },
  {
    placeholder: '{{pronoun}}',
    frontKey: 'derive backend',
    source: 'backend/services/aiService.generateQuestions',
    description: 'Pronom objet derive depuis le genre.'
  },
  {
    placeholder: '{{subjectPronoun}}',
    frontKey: 'derive backend',
    source: 'backend/services/aiService.generateQuestions',
    description: 'Pronom sujet derive.'
  },
  {
    placeholder: '{{possessive}}',
    frontKey: 'derive backend',
    source: 'backend/services/aiService.generateQuestions',
    description: 'Possessif derive.'
  },
  {
    placeholder: '{{ageContext}}',
    frontKey: 'derive backend',
    source: 'backend/services/aiService.generateQuestions',
    description: 'Contexte age adapte automatiquement.'
  },
  {
    placeholder: '{{styleInstruction}}',
    frontKey: 'derive backend',
    source: 'backend/services/aiService.generateQuestions',
    description: 'Instruction de ton construite depuis style.'
  }
];

const CONTENT_PROMPT_VARIABLES = [
  {
    placeholder: '{{outputType}}',
    frontKey: 'derive UI admin',
    source: 'PromptAdminLuxe / scenario',
    description: 'Type de sortie cible (chapter_content, introduction, conclusion).'
  },
  {
    placeholder: '{{eventType}}',
    frontKey: 'book.event_type',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Type d evenement.'
  },
  {
    placeholder: '{{style}}',
    frontKey: 'book.style_narratif',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Style narratif.'
  },
  {
    placeholder: '{{bookTitle}}',
    frontKey: 'book.title',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Titre du livre.'
  },
  {
    placeholder: '{{chapterTitle}}',
    frontKey: 'chapter.title',
    source: 'ChapterWorkflowLuxe',
    description: 'Titre du chapitre en cours.'
  },
  {
    placeholder: '{{recipientName}}',
    frontKey: 'book.recipient_name',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Nom de la personne cible.'
  },
  {
    placeholder: '{{recipientAge}}',
    frontKey: 'book.recipient_age',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Age cible.'
  },
  {
    placeholder: '{{recipientGender}}',
    frontKey: 'book.recipient_gender',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Genre cible.'
  },
  {
    placeholder: '{{chapterSummary}}',
    frontKey: 'derive workflow chapitre',
    source: 'resume inter-chapitres (IA)',
    description: 'Resume utile pour la coherence narrative.'
  },
  {
    placeholder: '{{narrativeContext}}',
    frontKey: 'book.cover_config.aiProjectBrief',
    source: 'CreateBookWizardLuxe, BookPageLuxe',
    description: 'Contexte narratif additionnel.'
  },
  {
    placeholder: '{{targetLength}}',
    frontKey: 'derive workflow',
    source: 'regle de longueur',
    description: 'Longueur cible en caracteres.'
  }
];

const PROMPT_TEST_STEPS = [
  'Mode simple: choisir un cas d usage (titre, chapitres, questions, contenu, introduction, conclusion).',
  'Cliquer sur "Charger" pour recuperer la version active du prompt.',
  'Verifier/editer les consignes de role IA et les consignes de production.',
  'Configurer Temperature et Max tokens pour la version a publier.',
  'Remplir les variables de test dans les champs guides (ou en JSON en mode expert).',
  'Cliquer sur "Tester le prompt" pour verifier le compile (system + user).',
  'Activer "Executer aussi le modele" seulement si tu veux un run IA reel.',
  'Publier la version quand le rendu est valide.',
  'Dans "Versions", ajouter une note (contexte, objectif) ou supprimer une version obsolete.'
];

const VARIABLE_LABELS = {
  count: 'Nombre de chapitres',
  eventType: 'Type d evenement',
  style: 'Ton narratif',
  bookTitle: 'Titre du livre',
  chapterTitle: 'Titre du chapitre',
  recipientName: 'Nom de la personne',
  recipientAge: 'Age',
  recipientGender: 'Genre',
  recipientNickname: 'Surnom',
  recipientTrait: 'Trait marquant',
  recipientAnecdote: 'Anecdote centrale',
  additionalContext: 'Contexte additionnel',
  pronoun: 'Pronom objet',
  subjectPronoun: 'Pronom sujet',
  possessive: 'Possessif',
  ageContext: 'Contexte age',
  styleInstruction: 'Instruction de ton',
  outputType: 'Type de sortie',
  chapterSummary: 'Resume precedent',
  narrativeContext: 'Contexte narratif',
  targetLength: 'Longueur cible'
};

const VARIABLE_PLACEHOLDERS = {
  count: 'Ex: 8',
  eventType: 'Ex: anniversaire',
  style: 'Ex: emotion',
  bookTitle: 'Ex: Pour tes 40 ans',
  chapterTitle: 'Ex: Les moments qui marquent',
  recipientName: 'Ex: Juliette',
  recipientAge: 'Ex: 40',
  recipientGender: 'Ex: femme',
  recipientNickname: 'Ex: Ju',
  recipientTrait: 'Ex: Genereuse et solaire',
  recipientAnecdote: 'Ex: Son fameux gateau sale-sucre',
  additionalContext: 'Ex: Ton complice et elegant',
  pronoun: 'Ex: elle',
  subjectPronoun: 'Ex: elle',
  possessive: 'Ex: sa',
  ageContext: 'Ex: adulte de 40 ans',
  styleInstruction: 'Ex: Ton chaleureux et detaille',
  outputType: 'chapter_content | introduction | conclusion',
  chapterSummary: 'Synthese du chapitre precedent',
  narrativeContext: 'Elements a respecter',
  targetLength: 'Ex: 3200'
};

const RECOMMENDED_PROMPT_TEMPLATES = {
  chapter_generation: {
    systemPrompt: [
      'Tu es un architecte de livres de prestige.',
      'Tu produis des propositions courtes, elegantes, emotionnelles et personnalisees.',
      'Tu respectes strictement le format de sortie demande, sans blabla.'
    ].join('\n'),
    userPromptTemplate: [
      'Tu dois produire une proposition de livre complete a partir des donnees fournies.',
      '',
      'Donnees utilisateur:',
      '- eventType: {{eventType}}',
      '- style: {{style}}',
      '- bookTitle (si deja saisi): {{bookTitle}}',
      '- recipientName: {{recipientName}}',
      '- recipientAge: {{recipientAge}}',
      '- recipientGender: {{recipientGender}}',
      '- recipientNickname: {{recipientNickname}}',
      '- recipientTrait: {{recipientTrait}}',
      '- recipientAnecdote: {{recipientAnecdote}}',
      '- additionalContext: {{additionalContext}}',
      '- count (nombre de chapitres): {{count}}',
      '',
      'Regles:',
      '- N interroge jamais l utilisateur.',
      '- Utilise uniquement les donnees ci-dessus.',
      '- Le titre du livre doit etre court, premium, emotionnel et personalise.',
      '- Produis exactement {{count}} titres de chapitres.',
      '- Titres de chapitres courts, memorables, non generiques.',
      '- Aucune description, aucun commentaire hors JSON.',
      '- Pas de markdown.',
      '',
      'Format de sortie JSON strict:',
      '{',
      '  "bookTitle": "Titre du livre",',
      '  "chapters": ["Titre chapitre 1", "Titre chapitre 2", "Titre chapitre 3"]',
      '}'
    ].join('\n'),
    temperature: '0.72',
    maxTokens: '1000'
  },
  question_generation: {
    systemPrompt: [
      'Tu es un biographe narratif premium specialise en collecte de souvenirs.',
      'Tu rediges des questions ouvertes concretes et exploitables.',
      'Tu respectes strictement le format JSON demande.'
    ].join('\n'),
    userPromptTemplate: [
      'Tu dois generer 4 questions ouvertes pour collecter des souvenirs narratifs premium.',
      '',
      'Contexte:',
      '- bookTitle: {{bookTitle}}',
      '- eventType: {{eventType}}',
      '- chapterTitle: {{chapterTitle}}',
      '- style: {{style}}',
      '- recipientName: {{recipientName}}',
      '- recipientAge: {{recipientAge}}',
      '- recipientGender: {{recipientGender}}',
      '- pronoun: {{pronoun}}',
      '- subjectPronoun: {{subjectPronoun}}',
      '- possessive: {{possessive}}',
      '- ageContext: {{ageContext}}',
      '- styleInstruction: {{styleInstruction}}',
      '',
      'Regles:',
      '- Les questions sont adressees a l organisateur et aux contributeurs.',
      '- Ne jamais adresser la question directement a {{recipientName}}.',
      '- Ne jamais commencer une question par "{{recipientName}},".',
      '- Utiliser la 3e personne pour parler de {{recipientName}}.',
      '- Interdire les questions oui/non.',
      '- Forcer des reponses concretes (decor, sons, odeurs, dialogues, emotions).',
      '- Ton adapte au style {{style}}.',
      '- Aucune phrase hors JSON, pas de markdown.',
      '',
      'Format de sortie JSON strict:',
      '[',
      '  "Question 1",',
      '  "Question 2",',
      '  "Question 3",',
      '  "Question 4"',
      ']'
    ].join('\n'),
    temperature: '0.68',
    maxTokens: '700'
  },
  content_generation: {
    systemPrompt: [
      'Tu es un biographe haut de gamme.',
      'Tu rediges un texte elegant, coherent, sensoriel et humain.',
      'Tu respectes strictement les contraintes de sortie.'
    ].join('\n'),
    userPromptTemplate: [
      'Tu dois rediger un texte final pour un livre souvenir.',
      '',
      'Contexte:',
      '- outputType: {{outputType}} (valeurs: introduction | chapter_content | conclusion)',
      '- eventType: {{eventType}}',
      '- style: {{style}}',
      '- bookTitle: {{bookTitle}}',
      '- chapterTitle: {{chapterTitle}}',
      '- recipientName: {{recipientName}}',
      '- recipientAge: {{recipientAge}}',
      '- recipientGender: {{recipientGender}}',
      '- chapterSummary: {{chapterSummary}}',
      '- narrativeContext: {{narrativeContext}}',
      '- targetLength: {{targetLength}}',
      '',
      'Regles communes:',
      '- N interroge jamais l utilisateur.',
      '- Utilise uniquement les donnees fournies.',
      '- Texte en francais uniquement.',
      '- Pas de markdown, pas de JSON, pas de balises HTML.',
      '- Respecte une longueur proche de {{targetLength}} caracteres (+/- 15%).',
      '',
      'Regles selon outputType:',
      '- introduction: ouvrir le livre avec elegance, chaleur et promesse narrative.',
      '- chapter_content: produire une narration riche, concrete, sensorielle et coherente.',
      '- conclusion: cloturer avec emotion, gratitude et unite.',
      '',
      'Sortie attendue:',
      '- Retourne uniquement le texte final.'
    ].join('\n'),
    temperature: '0.74',
    maxTokens: '1800'
  }
};

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('fr-FR');
};

const extractTemplateVariables = (templateText = '') => {
  const variableNames = new Set();
  const variablePattern = /{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;
  let match = variablePattern.exec(templateText);

  while (match) {
    variableNames.add(match[1]);
    match = variablePattern.exec(templateText);
  }

  return [...variableNames];
};

const buildDefaultVariables = (promptKey, rawEventType) => {
  const eventType = (rawEventType || '*').trim() || '*';

  if (promptKey === 'question_generation') {
    return {
      bookTitle: 'Livre hommage de Juliette',
      eventType,
      chapterTitle: 'Les moments qui marquent',
      style: 'emotion',
      recipientName: 'Juliette',
      recipientAge: 40,
      recipientGender: 'femme',
      pronoun: 'elle',
      subjectPronoun: 'elle',
      possessive: 'sa',
      styleInstruction: 'Ton sensible, detaille, vivant'
    };
  }

  if (promptKey === 'content_generation') {
    return {
      eventType,
      style: 'emotion',
      bookTitle: 'Pour tes 40 ans',
      chapterTitle: 'Les moments qui marquent',
      recipientName: 'Juliette',
      recipientAge: 40,
      recipientGender: 'femme',
      outputType: 'chapter_content',
      chapterSummary: 'Juliette rassemble tout le monde avec son energie et sa generosite.',
      narrativeContext: 'Conserver une voix elegante, concrete et chaleureuse.',
      targetLength: 3200
    };
  }

  return {
    eventType,
    style: 'emotion',
    bookTitle: 'Pour tes 40 ans',
    recipientName: 'Juliette',
    recipientAge: 40,
    recipientGender: 'femme',
    recipientNickname: 'Ju',
    recipientTrait: 'Genereuse et toujours pleine d energie',
    recipientAnecdote: "Elle a confondu le sel et le sucre dans son gateau d anniversaire",
    additionalContext: 'Ton chaleureux, complice, avec elegance',
    count: 8
  };
};

const buildScenarioVariables = ({ promptKey, scenarioValue, rawEventType }) => {
  const base = buildDefaultVariables(promptKey, rawEventType);

  if (scenarioValue === 'book_title') {
    return {
      ...base,
      additionalContext: 'Priorite au titre du livre, luxe et emotion.'
    };
  }

  if (scenarioValue === 'chapter_titles') {
    return {
      ...base,
      additionalContext: 'Priorite au sommaire des chapitres, titres courts et memorables.'
    };
  }

  if (scenarioValue === 'introduction') {
    return {
      ...base,
      outputType: 'introduction',
      chapterTitle: 'Ouverture',
      targetLength: 1800
    };
  }

  if (scenarioValue === 'conclusion') {
    return {
      ...base,
      outputType: 'conclusion',
      chapterTitle: 'Epilogue',
      targetLength: 1600
    };
  }

  if (scenarioValue === 'chapter_content') {
    return {
      ...base,
      outputType: 'chapter_content',
      targetLength: 3200
    };
  }

  return base;
};

const parseVariablesObject = (rawText) => {
  try {
    const parsed = JSON.parse(rawText || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
};

const PromptAdminLuxe = () => {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [uiMode, setUiMode] = useState('simple');
  const [simpleScenario, setSimpleScenario] = useState('chapter_titles');
  const [showVariablesJson, setShowVariablesJson] = useState(false);
  const [promptKey, setPromptKey] = useState('chapter_generation');
  const [eventType, setEventType] = useState('*');
  const [locale, setLocale] = useState('fr');

  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [activePrompt, setActivePrompt] = useState(null);
  const [templateVersions, setTemplateVersions] = useState(null);

  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPromptTemplate, setUserPromptTemplate] = useState('');
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [newVersionNote, setNewVersionNote] = useState('');

  const [runModel, setRunModel] = useState(false);
  const [modelName, setModelName] = useState(DEFAULT_MODEL);
  const [testTemperature, setTestTemperature] = useState('');
  const [testMaxTokens, setTestMaxTokens] = useState('');
  const [testVariablesText, setTestVariablesText] = useState(() =>
    JSON.stringify(buildDefaultVariables('chapter_generation', '*'), null, 2)
  );
  const [testResult, setTestResult] = useState(null);
  const [versionNotesById, setVersionNotesById] = useState({});
  const [savingVersionNoteKey, setSavingVersionNoteKey] = useState('');
  const [deletingVersionKey, setDeletingVersionKey] = useState('');

  const buildEndpoint = (path) => `${buildApiBaseUrl()}/ai${path}`;

  const apiRequest = async (path, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(buildEndpoint(path), {
      ...options,
      headers
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Erreur API (${response.status})`);
    }
    return payload;
  };

  const updateFormFromPrompt = (prompt) => {
    const recommended = RECOMMENDED_PROMPT_TEMPLATES[promptKey] || null;
    const hasPrompt = Boolean(prompt);

    setSystemPrompt(
      hasPrompt
        ? (prompt.systemPrompt || recommended?.systemPrompt || '')
        : (recommended?.systemPrompt || '')
    );
    setUserPromptTemplate(
      hasPrompt
        ? (prompt.userPromptTemplate || recommended?.userPromptTemplate || '')
        : (recommended?.userPromptTemplate || '')
    );
    setTemperature(
      Number.isFinite(Number(prompt?.temperature))
        ? String(prompt.temperature)
        : (recommended?.temperature || '')
    );
    setMaxTokens(
      Number.isFinite(Number(prompt?.maxTokens))
        ? String(prompt.maxTokens)
        : (recommended?.maxTokens || '')
    );
  };

  const getVersionRowKey = (versionRow) => String(versionRow?.id || versionRow?.version || '');
  const selectedScenario = SIMPLE_SCENARIOS.find((scenario) => scenario.value === simpleScenario)
    || SIMPLE_SCENARIOS[0];

  const handlePromptKeyChange = (nextPromptKey) => {
    setPromptKey(nextPromptKey);
    const matchingScenario = SIMPLE_SCENARIOS.find((scenario) => scenario.promptKey === nextPromptKey);
    if (matchingScenario) {
      setSimpleScenario(matchingScenario.value);
    }
  };

  const handleSimpleScenarioChange = (nextScenarioValue) => {
    setSimpleScenario(nextScenarioValue);
    const matchingScenario = SIMPLE_SCENARIOS.find((scenario) => scenario.value === nextScenarioValue);
    if (matchingScenario && matchingScenario.promptKey !== promptKey) {
      setPromptKey(matchingScenario.promptKey);
    }
  };

  const loadTemplate = async () => {
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    setTestResult(null);

    try {
      const response = await apiRequest(
        `/prompt-templates/${encodeURIComponent(promptKey)}?eventType=${encodeURIComponent(eventType || '*')}&locale=${encodeURIComponent(locale || 'fr')}`
      );

      setActivePrompt(response.activePrompt || null);
      setTemplateVersions(response.templateVersions || null);
      updateFormFromPrompt(response.activePrompt || null);
    } catch (error) {
      setActivePrompt(null);
      setTemplateVersions(null);
      setErrorMessage(error.message || 'Impossible de charger le prompt.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTestVariablesText(
      JSON.stringify(
        buildScenarioVariables({
          promptKey,
          scenarioValue: simpleScenario,
          rawEventType: eventType
        }),
        null,
        2
      )
    );
  }, [promptKey, eventType, simpleScenario]);

  useEffect(() => {
    const rows = templateVersions?.versions || [];
    const nextNotes = {};
    rows.forEach((versionRow) => {
      const rowKey = String(versionRow?.id || versionRow?.version || '');
      nextNotes[rowKey] = versionRow?.note || '';
    });
    setVersionNotesById(nextNotes);
  }, [templateVersions]);

  useEffect(() => {
    let parsedVariables = null;
    try {
      parsedVariables = JSON.parse(testVariablesText || '{}');
    } catch (_error) {
      return;
    }

    if (!parsedVariables || Array.isArray(parsedVariables) || typeof parsedVariables !== 'object') {
      return;
    }

    const expectedKeys = Array.from(new Set([
      ...extractTemplateVariables(systemPrompt),
      ...extractTemplateVariables(userPromptTemplate)
    ]));
    const currentKeys = Object.keys(parsedVariables);
    const hasStructureChanged = (
      currentKeys.length !== expectedKeys.length
      || currentKeys.some((key) => !expectedKeys.includes(key))
      || expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(parsedVariables, key))
    );

    if (!hasStructureChanged) {
      return;
    }

    const fallbackVariables = buildScenarioVariables({
      promptKey,
      scenarioValue: simpleScenario,
      rawEventType: eventType
    });
    const nextVariables = {};
    expectedKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(parsedVariables, key)) {
        nextVariables[key] = parsedVariables[key];
        return;
      }
      if (Object.prototype.hasOwnProperty.call(fallbackVariables, key)) {
        nextVariables[key] = fallbackVariables[key];
        return;
      }
      nextVariables[key] = '';
    });

    const nextVariablesText = JSON.stringify(nextVariables, null, 2);
    if (nextVariablesText !== testVariablesText) {
      setTestVariablesText(nextVariablesText);
    }
  }, [systemPrompt, userPromptTemplate, promptKey, eventType, simpleScenario, testVariablesText]); // sync when prompt template changes

  useEffect(() => {
    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseOptionalNumber = (rawValue, fieldLabel) => {
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      return undefined;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${fieldLabel} doit etre un nombre valide.`);
    }
    return parsed;
  };

  const handlePublish = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!systemPrompt.trim() || !userPromptTemplate.trim()) {
      setErrorMessage('System prompt et user prompt sont obligatoires.');
      return;
    }

    setPublishing(true);

    try {
      const payload = {
        eventType: (eventType || '*').trim() || '*',
        locale: (locale || 'fr').trim() || 'fr',
        systemPrompt: systemPrompt.trim(),
        userPromptTemplate: userPromptTemplate.trim(),
        note: (newVersionNote || '').trim(),
        temperature: parseOptionalNumber(temperature, 'Temperature'),
        maxTokens: parseOptionalNumber(maxTokens, 'Max tokens'),
        status: 'published',
        publish: true
      };

      const response = await apiRequest(
        `/prompt-templates/${encodeURIComponent(promptKey)}/versions`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setSuccessMessage(
        `Version ${response?.insertedVersion?.version || '?'} publiee avec succes.`
      );
      setNewVersionNote('');
      await loadTemplate();
    } catch (error) {
      setErrorMessage(error.message || 'Publication impossible.');
    } finally {
      setPublishing(false);
    }
  };

  const handleApplyRecommendedTemplate = () => {
    const recommended = RECOMMENDED_PROMPT_TEMPLATES[promptKey];
    if (!recommended) {
      setErrorMessage(`Aucun template recommande pour ${promptKey}.`);
      setSuccessMessage('');
      return;
    }
    setSystemPrompt(recommended.systemPrompt);
    setUserPromptTemplate(recommended.userPromptTemplate);
    setTemperature(recommended.temperature);
    setMaxTokens(recommended.maxTokens);
    setErrorMessage('');
    setSuccessMessage('Template recommande pre-rempli. Vous pouvez le modifier avant test/publication.');
  };

  const handleClearCache = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setClearingCache(true);

    try {
      await apiRequest('/prompt-templates/cache/clear', { method: 'POST' });
      setSuccessMessage('Cache prompt vide.');
    } catch (error) {
      setErrorMessage(error.message || 'Impossible de vider le cache.');
    } finally {
      setClearingCache(false);
    }
  };

  const handleTest = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setTesting(true);
    setTestResult(null);

    try {
      const parsedVariables = parseVariablesObject(testVariablesText);
      if (!parsedVariables) {
        throw new Error('Variables de test: JSON objet attendu.');
      }

      const payload = {
        eventType: (eventType || '*').trim() || '*',
        locale: (locale || 'fr').trim() || 'fr',
        variables: parsedVariables,
        runModel,
        model: (modelName || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
        systemPrompt: systemPrompt.trim(),
        userPromptTemplate: userPromptTemplate.trim(),
        temperature: parseOptionalNumber(testTemperature, 'Temperature test'),
        maxTokens: parseOptionalNumber(testMaxTokens, 'Max tokens test')
      };

      const response = await apiRequest(
        `/prompt-templates/${encodeURIComponent(promptKey)}/test`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setTestResult(response);
      setSuccessMessage('Test execute.');
    } catch (error) {
      setErrorMessage(error.message || 'Test impossible.');
    } finally {
      setTesting(false);
    }
  };

  const handleSimpleVariableChange = (variableName, value) => {
    const parsed = parseVariablesObject(testVariablesText) || {};
    parsed[variableName] = value;
    setTestVariablesText(JSON.stringify(parsed, null, 2));
  };

  const handleVersionNoteChange = (versionRow, value) => {
    const rowKey = getVersionRowKey(versionRow);
    setVersionNotesById((previous) => ({
      ...previous,
      [rowKey]: value
    }));
  };

  const handleSaveVersionNote = async (versionRow) => {
    const rowKey = getVersionRowKey(versionRow);
    setErrorMessage('');
    setSuccessMessage('');
    setSavingVersionNoteKey(rowKey);

    try {
      await apiRequest(
        `/prompt-templates/${encodeURIComponent(promptKey)}/versions/${encodeURIComponent(versionRow.version)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            eventType: (eventType || '*').trim() || '*',
            locale: (locale || 'fr').trim() || 'fr',
            note: (versionNotesById[rowKey] || '').trim()
          })
        }
      );
      setSuccessMessage(`Note enregistree pour la version ${versionRow.version}.`);
      await loadTemplate();
    } catch (error) {
      setErrorMessage(error.message || 'Impossible de mettre a jour la note.');
    } finally {
      setSavingVersionNoteKey('');
    }
  };

  const handleDeleteVersion = async (versionRow) => {
    const rowKey = getVersionRowKey(versionRow);
    const isActive = Number(versionRow.version) === Number(activeVersion);
    const confirmMessage = isActive
      ? `Supprimer la version active v${versionRow.version} ? La version active sera reajustee automatiquement.`
      : `Supprimer la version v${versionRow.version} ?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setDeletingVersionKey(rowKey);

    try {
      const query = `eventType=${encodeURIComponent((eventType || '*').trim() || '*')}&locale=${encodeURIComponent((locale || 'fr').trim() || 'fr')}`;
      await apiRequest(
        `/prompt-templates/${encodeURIComponent(promptKey)}/versions/${encodeURIComponent(versionRow.version)}?${query}`,
        {
          method: 'DELETE'
        }
      );
      setSuccessMessage(`Version ${versionRow.version} supprimee.`);
      await loadTemplate();
    } catch (error) {
      setErrorMessage(error.message || 'Impossible de supprimer cette version.');
    } finally {
      setDeletingVersionKey('');
    }
  };

  const activeVersion = templateVersions?.active_version || activePrompt?.version || null;
  const expectedVariableNames = Array.from(new Set([
    ...extractTemplateVariables(systemPrompt),
    ...extractTemplateVariables(userPromptTemplate)
  ]));
  const parsedTestVariables = parseVariablesObject(testVariablesText) || {};
  const testAnalysis = testResult?.analysis || null;
  const analysisMissingVariables = Array.isArray(testAnalysis?.missingVariables)
    ? testAnalysis.missingVariables
    : [];
  const analysisWarnings = Array.isArray(testAnalysis?.warnings)
    ? testAnalysis.warnings
    : [];
  const parsedOutputPreview = testAnalysis?.parsedOutput
    ? JSON.stringify(testAnalysis.parsedOutput, null, 2)
    : '';
  const compiledPromptPreview = testResult
    ? (
        testResult.compiledPrompt
        || [
          '[SYSTEM PROMPT]',
          testResult.systemPrompt || '',
          '',
          '[USER TEMPLATE COMPILE]',
          testResult.userPrompt || ''
        ].join('\n')
      )
    : '';

  return (
    <div className="prompt-admin-page">
      <div className="prompt-admin-shell">
        <div className="prompt-admin-head">
          <div>
            <span className="label-gold">Prompt lab</span>
            <h1 className="prompt-admin-title">Administration des prompts IA</h1>
            <p className="prompt-admin-subtitle">
              Mode simple pour configurer rapidement les cas metier, mode expert pour le controle technique complet.
            </p>
          </div>
          <div className="prompt-admin-head-links">
            <Link to="/admin/prompts/journey" className="btn btn-outline prompt-admin-back-link">
              Parcours prompts
            </Link>
            <Link to="/dashboard" className="btn btn-outline prompt-admin-back-link">
              Retour dashboard
            </Link>
          </div>
        </div>

        <section className={`prompt-admin-guide ${isGuideOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="prompt-admin-guide-toggle"
            onClick={() => setIsGuideOpen((previous) => !previous)}
            aria-expanded={isGuideOpen}
            aria-controls="prompt-admin-guide-content"
          >
            <span>Mini guide des variables</span>
            <span className="prompt-admin-guide-toggle-icon">{isGuideOpen ? '−' : '+'}</span>
          </button>

          {isGuideOpen ? (
            <div id="prompt-admin-guide-content" className="prompt-admin-guide-content">
              <p>
                <strong>promptKey</strong>: type de prompt gere (<code>chapter_generation</code>,
                <code>question_generation</code>, <code>content_generation</code>).
                <strong> eventType</strong>: contexte metier du prompt
                (<code>anniversaire</code>, <code>projet</code>, etc.).
                <strong> locale</strong>: langue cible (<code>fr</code>, <code>en</code>...).
              </p>
              <p>
                <strong>temperature</strong>: creativite de sortie. <strong>maxTokens</strong>: longueur maximale
                de sortie. <strong>Variables (JSON)</strong>: donnees injectees dans les placeholders
                <code>{'{{...}}'}</code>.
              </p>
              <div className="prompt-admin-guide-grid">
                <div className="prompt-admin-guide-card">
                  <h3>Variables chapter_generation</h3>
                  <ul className="prompt-admin-guide-list">
                    {CHAPTER_PROMPT_VARIABLES.map((item) => (
                      <li key={item.placeholder} className="prompt-admin-guide-list-item">
                        <code>{item.placeholder}</code>
                        <span><strong>Front:</strong> {item.frontKey}</span>
                        <span><strong>Source:</strong> {item.source}</span>
                        <span>{item.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="prompt-admin-guide-card">
                  <h3>Variables question_generation</h3>
                  <ul className="prompt-admin-guide-list">
                    {QUESTION_PROMPT_VARIABLES.map((item) => (
                      <li key={item.placeholder} className="prompt-admin-guide-list-item">
                        <code>{item.placeholder}</code>
                        <span><strong>Front:</strong> {item.frontKey}</span>
                        <span><strong>Source:</strong> {item.source}</span>
                        <span>{item.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="prompt-admin-guide-card">
                  <h3>Variables content_generation</h3>
                  <ul className="prompt-admin-guide-list">
                    {CONTENT_PROMPT_VARIABLES.map((item) => (
                      <li key={item.placeholder} className="prompt-admin-guide-list-item">
                        <code>{item.placeholder}</code>
                        <span><strong>Front:</strong> {item.frontKey}</span>
                        <span><strong>Source:</strong> {item.source}</span>
                        <span>{item.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="prompt-admin-guide-card">
                <h3>Guide rapide de test (pas a pas)</h3>
                <ol className="prompt-admin-guide-steps">
                  {PROMPT_TEST_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </section>

        {errorMessage ? (
          <div className="prompt-admin-feedback is-error">
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="prompt-admin-feedback is-success">
            <span>{successMessage}</span>
          </div>
        ) : null}

        <section className="prompt-admin-filters">
          <div className="prompt-admin-field">
            <label>Mode</label>
            <div className="prompt-admin-mode-toggle">
              <button
                type="button"
                className={`btn btn-outline ${uiMode === 'simple' ? 'is-active' : ''}`}
                onClick={() => {
                  setUiMode('simple');
                  setShowVariablesJson(false);
                }}
              >
                Simple
              </button>
              <button
                type="button"
                className={`btn btn-outline ${uiMode === 'expert' ? 'is-active' : ''}`}
                onClick={() => {
                  setUiMode('expert');
                  setShowVariablesJson(true);
                }}
              >
                Expert
              </button>
            </div>
          </div>

          {uiMode === 'simple' ? (
            <div className="prompt-admin-field">
              <label htmlFor="simple-scenario">Resultat a configurer</label>
              <select
                id="simple-scenario"
                className="input-luxe"
                value={simpleScenario}
                onChange={(event) => handleSimpleScenarioChange(event.target.value)}
              >
                {SIMPLE_SCENARIOS.map((scenario) => (
                  <option key={scenario.value} value={scenario.value}>
                    {scenario.label}
                  </option>
                ))}
              </select>
              <span className="prompt-admin-field-help">
                {selectedScenario?.objective || ''}
              </span>
            </div>
          ) : (
            <div className="prompt-admin-field">
              <label htmlFor="prompt-key">Prompt key</label>
              <select
                id="prompt-key"
                className="input-luxe"
                value={promptKey}
                onChange={(event) => handlePromptKeyChange(event.target.value)}
              >
                {PROMPT_KEY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="prompt-admin-field">
            <label htmlFor="prompt-event-type">Event type</label>
            <input
              id="prompt-event-type"
              className="input-luxe"
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              list="prompt-event-types"
              placeholder="*"
            />
            <datalist id="prompt-event-types">
              {EVENT_PRESETS.map((eventOption) => (
                <option key={eventOption} value={eventOption} />
              ))}
            </datalist>
          </div>

          <div className="prompt-admin-field">
            <label htmlFor="prompt-locale">Locale</label>
            <input
              id="prompt-locale"
              className="input-luxe"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              placeholder="fr"
            />
          </div>

          <div className="prompt-admin-filter-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={loadTemplate}
              disabled={loading}
            >
              {loading ? 'Chargement...' : 'Charger'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleClearCache}
              disabled={clearingCache}
            >
              {clearingCache ? 'Cache...' : 'Vider cache'}
            </button>
          </div>
        </section>

        {uiMode === 'simple' ? (
          <section className="prompt-admin-simple-summary">
            <div className="prompt-admin-simple-summary-main">
              <strong>{selectedScenario?.label || 'Scenario'}</strong>
              <span>{selectedScenario?.objective || ''}</span>
            </div>
            <span className="prompt-admin-active-pill">
              Prompt technique: {selectedScenario?.promptKey || promptKey}
            </span>
          </section>
        ) : null}

        <section className="prompt-admin-grid">
          <article className="prompt-admin-editor">
            <div className="prompt-admin-panel-head">
              <h2>{uiMode === 'simple' ? 'Configuration' : 'Edition'}</h2>
              <span className="prompt-admin-active-pill">
                Source: {activePrompt?.source || '-'} | Active: {activeVersion || '-'}
              </span>
            </div>

            <div className="prompt-admin-field">
              <label htmlFor="system-prompt">
                {uiMode === 'simple' ? 'Role IA' : 'System prompt'}
              </label>
              {uiMode === 'simple' ? (
                <span className="prompt-admin-field-help">
                  Definis le role de l IA: posture, niveau de style, intention globale.
                </span>
              ) : null}
              <textarea
                id="system-prompt"
                className="input-luxe prompt-admin-textarea prompt-admin-textarea-system"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder="Role system..."
              />
            </div>

            <div className="prompt-admin-field">
              <label htmlFor="user-prompt-template">
                {uiMode === 'simple' ? 'Consignes de production' : 'User prompt template'}
              </label>
              {uiMode === 'simple' ? (
                <span className="prompt-admin-field-help">
                  Precise le resultat attendu, les contraintes et le format de sortie final.
                </span>
              ) : null}
              <textarea
                id="user-prompt-template"
                className="input-luxe prompt-admin-textarea prompt-admin-textarea-user"
                value={userPromptTemplate}
                onChange={(event) => setUserPromptTemplate(event.target.value)}
                placeholder="Template avec {{variables}}..."
              />
            </div>

            <div className="prompt-admin-inline-fields">
              <div className="prompt-admin-field">
                <label htmlFor="temperature">Temperature</label>
                <input
                  id="temperature"
                  className="input-luxe"
                  value={temperature}
                  onChange={(event) => setTemperature(event.target.value)}
                  placeholder="0.7"
                />
              </div>

              <div className="prompt-admin-field">
                <label htmlFor="max-tokens">Max tokens</label>
                <input
                  id="max-tokens"
                  className="input-luxe"
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(event.target.value)}
                  placeholder="900"
                />
              </div>
            </div>

            <div className="prompt-admin-field">
              <label htmlFor="version-note">Note de version (optionnel)</label>
              <input
                id="version-note"
                className="input-luxe"
                value={newVersionNote}
                onChange={(event) => setNewVersionNote(event.target.value)}
                placeholder="Ex: Variante anniversaire plus premium"
              />
            </div>

            <div className="prompt-admin-editor-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleApplyRecommendedTemplate}
              >
                Pre-remplir recommande
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? 'Publication...' : 'Publier nouvelle version'}
              </button>
            </div>
          </article>

          <article className="prompt-admin-test">
            <div className="prompt-admin-panel-head">
              <h2>Test</h2>
            </div>

            {uiMode === 'simple' ? (
              <div className="prompt-admin-simple-vars">
                {expectedVariableNames.length === 0 ? (
                  <p className="prompt-admin-empty">
                    Ajoute des variables <code>{'{{variable}}'}</code> dans les prompts pour obtenir des champs guides.
                  </p>
                ) : (
                  expectedVariableNames.map((variableName) => (
                    <div key={variableName} className="prompt-admin-field">
                      <label htmlFor={`var-${variableName}`}>
                        {VARIABLE_LABELS[variableName] || variableName}
                      </label>
                      <input
                        id={`var-${variableName}`}
                        className="input-luxe"
                        value={String(parsedTestVariables[variableName] ?? '')}
                        onChange={(event) => handleSimpleVariableChange(variableName, event.target.value)}
                        placeholder={VARIABLE_PLACEHOLDERS[variableName] || `Valeur de ${variableName}`}
                      />
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="prompt-admin-field">
                <label htmlFor="test-vars">Variables (JSON)</label>
                <textarea
                  id="test-vars"
                  className="input-luxe prompt-admin-textarea prompt-admin-textarea-test-vars"
                  value={testVariablesText}
                  onChange={(event) => setTestVariablesText(event.target.value)}
                />
              </div>
            )}

            <div className="prompt-admin-check-row">
              <input
                id="test-run-model"
                type="checkbox"
                checked={runModel}
                onChange={(event) => setRunModel(event.target.checked)}
              />
              <label htmlFor="test-run-model">Executer aussi le modele</label>
            </div>

            <div className="prompt-admin-inline-fields">
              <div className="prompt-admin-field">
                <label htmlFor="test-model">Modele</label>
                <input
                  id="test-model"
                  className="input-luxe"
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  placeholder={DEFAULT_MODEL}
                />
              </div>

              <div className="prompt-admin-field">
                <label htmlFor="test-temperature">Temp test</label>
                <input
                  id="test-temperature"
                  className="input-luxe"
                  value={testTemperature}
                  onChange={(event) => setTestTemperature(event.target.value)}
                  placeholder="0.7"
                />
              </div>

              <div className="prompt-admin-field">
                <label htmlFor="test-max-tokens">Max tokens test</label>
                <input
                  id="test-max-tokens"
                  className="input-luxe"
                  value={testMaxTokens}
                  onChange={(event) => setTestMaxTokens(event.target.value)}
                  placeholder="900"
                />
              </div>
            </div>

            {uiMode === 'simple' ? (
              <div className="prompt-admin-json-block">
                <button
                  type="button"
                  className="btn btn-outline prompt-admin-json-toggle"
                  onClick={() => setShowVariablesJson((previous) => !previous)}
                >
                  {showVariablesJson ? 'Masquer JSON technique' : 'Afficher JSON technique'}
                </button>
                {showVariablesJson ? (
                  <div className="prompt-admin-field">
                    <label htmlFor="test-vars">Variables (JSON)</label>
                    <textarea
                      id="test-vars"
                      className="input-luxe prompt-admin-textarea prompt-admin-textarea-test-vars"
                      value={testVariablesText}
                      onChange={(event) => setTestVariablesText(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="prompt-admin-editor-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? 'Test...' : 'Tester le prompt'}
              </button>
            </div>

            {testResult ? (
              <div className="prompt-admin-test-result">
                <div className="prompt-admin-result-meta">
                  <span>Source: {testResult.source || '-'}</span>
                  <span>Version: {testResult.version || '-'}</span>
                </div>

                {testAnalysis ? (
                  <div className="prompt-admin-analysis-grid">
                    <div className={`prompt-admin-analysis-card ${analysisMissingVariables.length > 0 ? 'is-warning' : 'is-ok'}`}>
                      <label>Variables attendues</label>
                      <p>{(testAnalysis.expectedVariables || expectedVariableNames).join(', ') || '-'}</p>
                    </div>
                    <div className={`prompt-admin-analysis-card ${analysisMissingVariables.length > 0 ? 'is-warning' : 'is-ok'}`}>
                      <label>Variables manquantes</label>
                      <p>{analysisMissingVariables.join(', ') || 'Aucune'}</p>
                    </div>
                  </div>
                ) : null}

                {analysisWarnings.length > 0 ? (
                  <div className="prompt-admin-analysis-warnings">
                    {analysisWarnings.map((warningText) => (
                      <div key={warningText} className="prompt-admin-analysis-warning-item">
                        {warningText}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="prompt-admin-field">
                  <label>Prompt compile (system + user)</label>
                  <textarea
                    className="input-luxe prompt-admin-textarea prompt-admin-textarea-result"
                    value={compiledPromptPreview}
                    readOnly
                  />
                </div>

                {testResult?.modelCall?.output ? (
                  <div className="prompt-admin-model-output-grid">
                    <div className="prompt-admin-field">
                      <label>Sortie modele</label>
                      <textarea
                        className="input-luxe prompt-admin-textarea prompt-admin-textarea-result"
                        value={testResult.modelCall.output}
                        readOnly
                      />
                    </div>
                    {parsedOutputPreview ? (
                      <div className="prompt-admin-field">
                        <label>Sortie interpretee</label>
                        <textarea
                          className="input-luxe prompt-admin-textarea prompt-admin-textarea-result"
                          value={parsedOutputPreview}
                          readOnly
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>

          <article className="prompt-admin-versions">
            <div className="prompt-admin-panel-head">
              <h2>Versions</h2>
              <span>{templateVersions?.versions?.length || 0} version(s)</span>
            </div>

            <div className="prompt-admin-version-list">
              {(templateVersions?.versions || []).length === 0 ? (
                <p className="prompt-admin-empty">Aucune version stockee.</p>
              ) : (
                (templateVersions?.versions || []).map((versionRow) => {
                  const rowKey = getVersionRowKey(versionRow);
                  const rowNote = versionNotesById[rowKey] ?? versionRow?.note ?? '';
                  const isRowActive = Number(versionRow.version) === Number(activeVersion);
                  const isSavingNote = savingVersionNoteKey === rowKey;
                  const isDeleting = deletingVersionKey === rowKey;

                  return (
                    <div
                      key={rowKey}
                      className={`prompt-admin-version-row ${isRowActive ? 'is-active' : ''}`}
                    >
                      <div className="prompt-admin-version-main">
                        <div className="prompt-admin-version-title">
                          {versionRow?.note ? (
                            <span className="prompt-admin-version-note-pill">{versionRow.note}</span>
                          ) : null}
                          <strong>v{versionRow.version}</strong>
                          {isRowActive ? (
                            <span className="prompt-admin-version-active-badge">active</span>
                          ) : null}
                          <span>{versionRow.status || '-'}</span>
                        </div>
                        <div className="prompt-admin-version-meta">
                          <span>{formatDateTime(versionRow.created_at)}</span>
                          <span>{versionRow.created_by || '-'}</span>
                        </div>
                      </div>

                      <div className="prompt-admin-version-actions">
                        <input
                          className="input-luxe prompt-admin-version-note-input"
                          value={rowNote}
                          onChange={(event) => handleVersionNoteChange(versionRow, event.target.value)}
                          placeholder="Note courte pour cette version"
                          disabled={isDeleting}
                        />
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleSaveVersionNote(versionRow)}
                          disabled={isSavingNote || isDeleting}
                        >
                          {isSavingNote ? 'Note...' : 'Enregistrer note'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline prompt-admin-version-delete-btn"
                          onClick={() => handleDeleteVersion(versionRow)}
                          disabled={isDeleting || isSavingNote}
                        >
                          {isDeleting ? 'Suppression...' : 'Supprimer'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
};

export default PromptAdminLuxe;
