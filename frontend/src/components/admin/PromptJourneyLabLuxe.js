import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';
import './PromptJourneyLabLuxe.css';

const DEFAULT_MODEL = 'mistral-small-latest';

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

const PROMPT_SCENARIOS = [
  {
    id: 'book_title',
    label: 'Titre du livre',
    promptKey: 'chapter_generation',
    hint: 'Produit un titre premium a partir des infos projet.',
    sharedHint: 'Partage la meme configuration que "Titres de chapitres".',
    variableKeys: [
      'eventType',
      'style',
      'bookTitle',
      'recipientName',
      'recipientAge',
      'recipientGender',
      'recipientNickname',
      'recipientTrait',
      'recipientAnecdote',
      'additionalContext',
      'count'
    ]
  },
  {
    id: 'chapter_titles',
    label: 'Titres de chapitres',
    promptKey: 'chapter_generation',
    hint: 'Produit la structure chapitre par chapitre.',
    sharedHint: 'Partage la meme configuration que "Titre du livre".',
    variableKeys: [
      'eventType',
      'style',
      'bookTitle',
      'recipientName',
      'recipientAge',
      'recipientGender',
      'recipientNickname',
      'recipientTrait',
      'recipientAnecdote',
      'additionalContext',
      'count'
    ]
  },
  {
    id: 'questions',
    label: 'Questions contributeurs',
    promptKey: 'question_generation',
    hint: 'Genere les questions de collecte des souvenirs.',
    sharedHint: '',
    variableKeys: [
      'bookTitle',
      'eventType',
      'chapterTitle',
      'style',
      'recipientName',
      'recipientAge',
      'recipientGender',
      'pronoun',
      'subjectPronoun',
      'possessive',
      'ageContext',
      'styleInstruction'
    ]
  },
  {
    id: 'chapter_content',
    label: 'Contenu chapitres',
    promptKey: 'content_generation',
    hint: 'Redaction des contenus (chapitre, intro, conclusion via outputType).',
    sharedHint: '',
    variableKeys: [
      'outputType',
      'eventType',
      'style',
      'bookTitle',
      'chapterTitle',
      'recipientName',
      'recipientAge',
      'recipientGender',
      'chapterSummary',
      'narrativeContext',
      'targetLength'
    ]
  }
];

const VARIABLE_CATALOG = {
  eventType: 'Type d evenement du livre',
  style: 'Style narratif choisi',
  bookTitle: 'Titre du livre',
  recipientName: 'Nom du destinataire',
  recipientAge: 'Age du destinataire',
  recipientGender: 'Genre du destinataire',
  recipientNickname: 'Surnom du destinataire',
  recipientTrait: 'Trait marquant',
  recipientAnecdote: 'Anecdote principale',
  additionalContext: 'Contexte libre / contraintes',
  count: 'Nombre de chapitres a produire',
  chapterTitle: 'Titre du chapitre cible',
  pronoun: 'Pronom contexte long',
  subjectPronoun: 'Pronom sujet',
  possessive: 'Adjectif possessif',
  ageContext: 'Contexte age redactionnel',
  styleInstruction: 'Consigne de ton derivee du style',
  outputType: 'Type de sortie: introduction | chapter_content | conclusion',
  chapterSummary: 'Resume du chapitre precedent',
  narrativeContext: 'Contexte narratif de continuite',
  targetLength: 'Longueur cible en caracteres'
};

const initialProjectForm = {
  eventType: 'anniversaire',
  locale: 'fr',
  style: 'intime',
  bookTitle: 'Pour tes 40 ans',
  recipientName: 'la personne celebree',
  recipientAge: '40',
  recipientGender: 'femme',
  recipientNickname: 'Ju',
  recipientTrait: 'Genereuse, solaire et toujours presente',
  recipientAnecdote: 'Le fameux gateau anniversaire sucre-sale',
  additionalContext: 'Ton premium, elegant et complice',
  chapterTitle: 'Les moments qui marquent',
  chaptersCount: '8',
  chapterSummary: 'Chapitre precedent: energie collective et souvenirs joyeux.',
  narrativeContext: 'Conserver un fil narratif coherent et une voix chaleureuse.',
  targetLength: '3200',
  outputType: 'chapter_content'
};

const PROJECT_FORM_STORAGE_KEY = 'prompt_journey_project_form_v1';
const MODEL_STORAGE_KEY = 'prompt_journey_model_v1';
const INTERNAL_SYSTEM_PROMPT = 'Tu suis strictement les instructions du prompt utilisateur.';

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const buildEndpoint = (path) => `${buildApiBaseUrl()}/ai${path}`;

const compileTemplate = (template, variables = {}) => (
  String(template || '')
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, variableName) => {
      const rawValue = variables[variableName];
      if (rawValue === null || rawValue === undefined) return '';
      if (Array.isArray(rawValue)) return rawValue.join(', ');
      if (typeof rawValue === 'object') return JSON.stringify(rawValue);
      return String(rawValue);
    })
    .replace(/\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g, (fullMatch, variableName) => {
      if (!Object.prototype.hasOwnProperty.call(variables || {}, variableName)) {
        return fullMatch;
      }
      const rawValue = variables[variableName];
      if (rawValue === null || rawValue === undefined) return '';
      if (Array.isArray(rawValue)) return rawValue.join(', ');
      if (typeof rawValue === 'object') return JSON.stringify(rawValue);
      return String(rawValue);
    })
);

const parseOptionalNumber = (rawValue, label) => {
  if (rawValue === '' || rawValue === null || rawValue === undefined) return undefined;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} doit etre un nombre valide.`);
  }
  return parsed;
};

const getStyleInstruction = (style) => {
  const mapping = {
    poetique: 'Langage image, sensible et lyrique.',
    factuel: 'Style direct, concret et actionnable.',
    intime: 'Style chaleureux, personnel et confidentiel.',
    emotion: 'Style profond, empathique et detaille.'
  };
  return mapping[style] || mapping.intime;
};

const getPronouns = (gender) => {
  if (gender === 'homme') {
    return {
      pronoun: 'cet homme',
      subjectPronoun: 'il',
      possessive: 'son'
    };
  }
  if (gender === 'femme') {
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
};

const getAgeContext = (age, gender) => {
  const ageNumber = Number(age);
  if (!Number.isFinite(ageNumber)) return '';
  if (ageNumber < 18) return gender === 'homme' ? 'jeune garcon' : 'jeune fille';
  if (ageNumber < 30) return gender === 'homme' ? 'jeune homme' : 'jeune femme';
  if (ageNumber < 50) return 'adulte';
  if (ageNumber < 70) return 'senior';
  return gender === 'homme' ? 'veteran' : 'veterane';
};

const buildScenarioVariables = (scenarioId, projectForm) => {
  const common = {
    eventType: projectForm.eventType || 'generique',
    style: projectForm.style || 'intime',
    bookTitle: projectForm.bookTitle || 'Livre souvenir',
    recipientName: projectForm.recipientName || 'la personne',
    recipientAge: projectForm.recipientAge || 'non specifie',
    recipientGender: projectForm.recipientGender || 'non specifie',
    recipientNickname: projectForm.recipientNickname || '',
    recipientTrait: projectForm.recipientTrait || '',
    recipientAnecdote: projectForm.recipientAnecdote || '',
    additionalContext: projectForm.additionalContext || ''
  };

  if (scenarioId === 'book_title') {
    return {
      ...common,
      count: 1,
      additionalContext: [common.additionalContext, 'Objectif strict: proposer uniquement le titre du livre.']
        .filter(Boolean)
        .join(' ')
    };
  }

  if (scenarioId === 'chapter_titles') {
    return {
      ...common,
      count: Number(projectForm.chaptersCount) || 8,
      additionalContext: [common.additionalContext, 'Objectif strict: produire uniquement les titres de chapitres.']
        .filter(Boolean)
        .join(' ')
    };
  }

  if (scenarioId === 'questions') {
    const pronouns = getPronouns(common.recipientGender);
    const ageContextLabel = getAgeContext(common.recipientAge, common.recipientGender);
    return {
      ...common,
      chapterTitle: projectForm.chapterTitle || 'Chapitre',
      ...pronouns,
      ageContext: ageContextLabel
        ? `${pronouns.pronoun} est ${ageContextLabel} de ${common.recipientAge} ans`
        : '',
      styleInstruction: getStyleInstruction(common.style)
    };
  }

  return {
    ...common,
    chapterTitle: projectForm.chapterTitle || 'Chapitre',
    outputType: projectForm.outputType || 'chapter_content',
    chapterSummary: projectForm.chapterSummary || '',
    narrativeContext: projectForm.narrativeContext || common.additionalContext || '',
    targetLength: Number(projectForm.targetLength) || 3200
  };
};

const getInitialScenarioState = () => ({
  source: '-',
  version: '-',
  systemPrompt: '',
  userPromptTemplate: '',
  temperature: '',
  maxTokens: '',
  runModel: false,
  isTesting: false,
  isPublishing: false,
  isActivating: false,
  lastCompiledPrompt: '',
  lastModelOutput: '',
  lastRunAt: ''
});

const loadPersistedProjectForm = () => {
  if (typeof window === 'undefined') return initialProjectForm;
  try {
    const raw = window.localStorage.getItem(PROJECT_FORM_STORAGE_KEY);
    if (!raw) return initialProjectForm;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return initialProjectForm;
    return {
      ...initialProjectForm,
      ...parsed
    };
  } catch (_error) {
    return initialProjectForm;
  }
};

const loadPersistedModelName = () => {
  if (typeof window === 'undefined') return DEFAULT_MODEL;
  const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
  return (stored || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
};

const PromptJourneyLabLuxe = () => {
  const [projectForm, setProjectForm] = useState(() => loadPersistedProjectForm());
  const [modelName, setModelName] = useState(() => loadPersistedModelName());
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [scenarioState, setScenarioState] = useState(() => (
    PROMPT_SCENARIOS.reduce((accumulator, scenario) => {
      accumulator[scenario.id] = getInitialScenarioState();
      return accumulator;
    }, {})
  ));

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

  const updateScenarioState = (scenarioId, patch) => {
    setScenarioState((previous) => ({
      ...previous,
      [scenarioId]: {
        ...(previous[scenarioId] || getInitialScenarioState()),
        ...patch
      }
    }));
  };

  const updateSharedPromptState = (promptKey, patch) => {
    setScenarioState((previous) => {
      const next = { ...previous };
      PROMPT_SCENARIOS.forEach((scenario) => {
        if (scenario.promptKey !== promptKey) return;
        next[scenario.id] = {
          ...(previous[scenario.id] || getInitialScenarioState()),
          ...patch
        };
      });
      return next;
    });
  };

const buildCompiledPromptPreview = (scenarioId) => {
    const current = scenarioState[scenarioId] || getInitialScenarioState();
    const variables = buildScenarioVariables(scenarioId, projectForm);
    return [
      '[PROMPT UTILISATEUR COMPILE]',
      compileTemplate(current.userPromptTemplate || '', variables)
    ].join('\n');
  };

  const loadPromptTemplates = async () => {
    setLoadingTemplates(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const uniquePromptKeys = [...new Set(PROMPT_SCENARIOS.map((scenario) => scenario.promptKey))];
      const responses = await Promise.all(
        uniquePromptKeys.map(async (promptKey) => {
          const payload = await apiRequest(
            `/prompt-templates/${encodeURIComponent(promptKey)}?eventType=${encodeURIComponent(projectForm.eventType || '*')}&locale=${encodeURIComponent(projectForm.locale || 'fr')}`
          );
          return {
            promptKey,
            activePrompt: payload.activePrompt || null
          };
        })
      );

      const activePromptByKey = responses.reduce((accumulator, row) => {
        accumulator[row.promptKey] = row.activePrompt;
        return accumulator;
      }, {});

      setScenarioState((previous) => {
        const next = { ...previous };
        PROMPT_SCENARIOS.forEach((scenario) => {
          const activePrompt = activePromptByKey[scenario.promptKey] || null;
          const current = previous[scenario.id] || getInitialScenarioState();
          next[scenario.id] = {
            ...current,
            source: activePrompt?.source || '-',
            version: activePrompt?.version || '-',
            systemPrompt: activePrompt?.systemPrompt || current.systemPrompt || '',
            userPromptTemplate: activePrompt?.userPromptTemplate || current.userPromptTemplate || '',
            temperature: Number.isFinite(Number(activePrompt?.temperature))
              ? String(activePrompt.temperature)
              : (current.temperature || ''),
            maxTokens: Number.isFinite(Number(activePrompt?.maxTokens))
              ? String(activePrompt.maxTokens)
              : (current.maxTokens || ''),
            isTesting: false,
            isPublishing: false
          };
        });
        return next;
      });

      setSuccessMessage('Prompts actifs charges.');
    } catch (error) {
      setErrorMessage(error.message || 'Impossible de charger les prompts.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadPromptTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROJECT_FORM_STORAGE_KEY, JSON.stringify(projectForm));
  }, [projectForm]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MODEL_STORAGE_KEY, modelName || DEFAULT_MODEL);
  }, [modelName]);

  const handlePromptFieldChange = (scenario, field, value) => {
    if (scenario.promptKey === 'chapter_generation' || scenario.promptKey === 'content_generation') {
      updateSharedPromptState(scenario.promptKey, { [field]: value });
      return;
    }
    updateScenarioState(scenario.id, { [field]: value });
  };

  const handleTestScenario = async (scenario) => {
    const current = scenarioState[scenario.id] || getInitialScenarioState();
    if (!current.userPromptTemplate.trim()) {
      setErrorMessage(`Le prompt "${scenario.label}" est vide.`);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    updateScenarioState(scenario.id, { isTesting: true });

    try {
      const payload = {
        eventType: (projectForm.eventType || '*').trim() || '*',
        locale: (projectForm.locale || 'fr').trim() || 'fr',
        variables: buildScenarioVariables(scenario.id, projectForm),
        useDefaultVariables: false,
        runModel: Boolean(current.runModel),
        model: (modelName || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
        systemPrompt: INTERNAL_SYSTEM_PROMPT,
        userPromptTemplate: current.userPromptTemplate,
        temperature: parseOptionalNumber(current.temperature, `Temperature (${scenario.label})`),
        maxTokens: parseOptionalNumber(current.maxTokens, `Max tokens (${scenario.label})`)
      };

      const response = await apiRequest(
        `/prompt-templates/${encodeURIComponent(scenario.promptKey)}/test`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      updateScenarioState(scenario.id, {
        lastCompiledPrompt: response.compiledPrompt || buildCompiledPromptPreview(scenario.id),
        lastModelOutput: response?.modelCall?.output || '',
        lastRunAt: new Date().toISOString()
      });
      setSuccessMessage(`Test execute pour "${scenario.label}".`);
    } catch (error) {
      setErrorMessage(error.message || `Impossible de tester "${scenario.label}".`);
    } finally {
      updateScenarioState(scenario.id, { isTesting: false });
    }
  };

  const handleValidateScenario = async (scenario) => {
    const current = scenarioState[scenario.id] || getInitialScenarioState();
    if (!current.userPromptTemplate.trim()) {
      setErrorMessage(`Le prompt "${scenario.label}" est vide.`);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    updateScenarioState(scenario.id, { isPublishing: true });

    try {
      const payload = {
        eventType: (projectForm.eventType || '*').trim() || '*',
        locale: (projectForm.locale || 'fr').trim() || 'fr',
        systemPrompt: INTERNAL_SYSTEM_PROMPT,
        userPromptTemplate: current.userPromptTemplate.trim(),
        temperature: parseOptionalNumber(current.temperature, `Temperature (${scenario.label})`),
        maxTokens: parseOptionalNumber(current.maxTokens, `Max tokens (${scenario.label})`),
        note: `Validation: ${scenario.label}`,
        status: 'published',
        publish: true
      };

      const versionResult = await apiRequest(
        `/prompt-templates/${encodeURIComponent(scenario.promptKey)}/versions`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      const versionLabel = Number.isFinite(Number(versionResult?.activeVersion))
        ? ` (v${versionResult.activeVersion})`
        : '';
      setSuccessMessage(`Prompt valide et versionne pour "${scenario.label}"${versionLabel}.`);
      await loadPromptTemplates();
    } catch (error) {
      setErrorMessage(error.message || `Impossible de valider "${scenario.label}".`);
    } finally {
      updateScenarioState(scenario.id, { isPublishing: false });
    }
  };

  const handleUseForCreation = async (scenario) => {
    const current = scenarioState[scenario.id] || getInitialScenarioState();
    const versionToActivate = Number(current.version);
    if (!Number.isInteger(versionToActivate) || versionToActivate <= 0) {
      setErrorMessage(`Aucune version valide a activer pour "${scenario.label}".`);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    if (scenario.promptKey === 'chapter_generation' || scenario.promptKey === 'content_generation') {
      updateSharedPromptState(scenario.promptKey, { isActivating: true });
    } else {
      updateScenarioState(scenario.id, { isActivating: true });
    }

    try {
      const result = await apiRequest(
        `/prompt-templates/${encodeURIComponent(scenario.promptKey)}/activate`,
        {
          method: 'POST',
          body: JSON.stringify({
            eventType: (projectForm.eventType || '*').trim() || '*',
            locale: (projectForm.locale || 'fr').trim() || 'fr',
            version: versionToActivate
          })
        }
      );

      setSuccessMessage(`Version v${result?.activeVersion || versionToActivate} active pour la creation.`);
      await loadPromptTemplates();
    } catch (error) {
      setErrorMessage(error.message || `Impossible d activer la version pour "${scenario.label}".`);
    } finally {
      if (scenario.promptKey === 'chapter_generation' || scenario.promptKey === 'content_generation') {
        updateSharedPromptState(scenario.promptKey, { isActivating: false });
      } else {
        updateScenarioState(scenario.id, { isActivating: false });
      }
    }
  };

  const scenarioVariableGuides = useMemo(() => (
    PROMPT_SCENARIOS.reduce((accumulator, scenario) => {
      accumulator[scenario.id] = scenario.variableKeys.map((name) => ({
        name,
        description: VARIABLE_CATALOG[name] || 'Variable de contexte'
      }));
      return accumulator;
    }, {})
  ), []);

  return (
    <div className="prompt-journey-page">
      <div className="prompt-journey-shell">
        <header className="prompt-journey-head">
          <div>
            <span className="label-gold">Parametrage prompts</span>
            <h1>Configuration et tests des prompts IA</h1>
            <p>
              Une seule page pour regler les prompts, tester chaque scenario, puis valider les versions.
              Les modifications restent en brouillon tant que vous ne cliquez pas sur "Valider et versionner".
            </p>
          </div>
          <div className="prompt-journey-head-actions">
            <Link to="/dashboard" className="btn btn-outline">Dashboard</Link>
          </div>
        </header>

        {errorMessage ? <div className="prompt-journey-feedback is-error">{errorMessage}</div> : null}
        {successMessage ? <div className="prompt-journey-feedback is-success">{successMessage}</div> : null}

        <section className="prompt-journey-toolbar">
          <div className="prompt-journey-field">
            <label htmlFor="journey-event">Event type</label>
            <input
              id="journey-event"
              className="input-luxe"
              value={projectForm.eventType}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, eventType: event.target.value }))}
              list="journey-event-types"
            />
            <datalist id="journey-event-types">
              {EVENT_PRESETS.map((eventOption) => (
                <option key={eventOption} value={eventOption} />
              ))}
            </datalist>
          </div>

          <div className="prompt-journey-field">
            <label htmlFor="journey-locale">Locale</label>
            <input
              id="journey-locale"
              className="input-luxe"
              value={projectForm.locale}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, locale: event.target.value }))}
            />
          </div>

          <div className="prompt-journey-field">
            <label htmlFor="journey-model">Modele</label>
            <input
              id="journey-model"
              className="input-luxe"
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
            />
          </div>

          <div className="prompt-journey-toolbar-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={loadPromptTemplates}
              disabled={loadingTemplates}
            >
              {loadingTemplates ? 'Chargement...' : 'Recharger les prompts actifs'}
            </button>
          </div>
        </section>

        <section className="prompt-journey-form">
          <h2>Donnees de test (variables)</h2>
          <div className="prompt-journey-form-grid">
            <div className="prompt-journey-field">
              <label>Titre du livre</label>
              <input
                className="input-luxe"
                value={projectForm.bookTitle}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, bookTitle: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Nom destinataire</label>
              <input
                className="input-luxe"
                value={projectForm.recipientName}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, recipientName: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Age</label>
              <input
                className="input-luxe"
                value={projectForm.recipientAge}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, recipientAge: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Genre</label>
              <input
                className="input-luxe"
                value={projectForm.recipientGender}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, recipientGender: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Surnom</label>
              <input
                className="input-luxe"
                value={projectForm.recipientNickname}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, recipientNickname: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Style narratif</label>
              <input
                className="input-luxe"
                value={projectForm.style}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, style: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Nombre de chapitres</label>
              <input
                className="input-luxe"
                value={projectForm.chaptersCount}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, chaptersCount: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Titre chapitre test</label>
              <input
                className="input-luxe"
                value={projectForm.chapterTitle}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, chapterTitle: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>outputType (contenu)</label>
              <input
                className="input-luxe"
                value={projectForm.outputType}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, outputType: event.target.value }))}
              />
            </div>
          </div>

          <div className="prompt-journey-form-textareas">
            <div className="prompt-journey-field">
              <label>Trait marquant</label>
              <textarea
                className="input-luxe"
                value={projectForm.recipientTrait}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, recipientTrait: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Anecdote</label>
              <textarea
                className="input-luxe"
                value={projectForm.recipientAnecdote}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, recipientAnecdote: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Contexte additionnel</label>
              <textarea
                className="input-luxe"
                value={projectForm.additionalContext}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, additionalContext: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Resume precedent (chapitre)</label>
              <textarea
                className="input-luxe"
                value={projectForm.chapterSummary}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, chapterSummary: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Contexte narratif</label>
              <textarea
                className="input-luxe"
                value={projectForm.narrativeContext}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, narrativeContext: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Longueur cible (caracteres)</label>
              <input
                className="input-luxe"
                value={projectForm.targetLength}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, targetLength: event.target.value }))}
              />
            </div>
          </div>
        </section>

        <section className="prompt-journey-stages">
          {PROMPT_SCENARIOS.map((scenario) => {
            const current = scenarioState[scenario.id] || getInitialScenarioState();
            const stageVariables = buildScenarioVariables(scenario.id, projectForm);
            const compiledPreview = buildCompiledPromptPreview(scenario.id);
            const variableGuide = scenarioVariableGuides[scenario.id] || [];

            return (
              <details key={scenario.id} className="prompt-journey-card prompt-journey-card-collapsible">
                <summary className="prompt-journey-card-summary">
                  <div className="prompt-journey-card-summary-inner">
                    <div>
                      <h3>{scenario.label}</h3>
                      <p>{scenario.hint}</p>
                      {scenario.sharedHint ? <p className="prompt-journey-shared-hint">{scenario.sharedHint}</p> : null}
                    </div>
                    <div className="prompt-journey-card-summary-right">
                      <div className="prompt-journey-badges">
                        <span className="prompt-journey-badge">{scenario.promptKey}</span>
                        <span className="prompt-journey-badge">source: {current.source}</span>
                        <span className="prompt-journey-badge">v{current.version}</span>
                      </div>
                      <span className="prompt-journey-toggle-indicator" aria-hidden="true" />
                    </div>
                  </div>
                </summary>

                <div className="prompt-journey-card-body">
                  <div className="prompt-journey-field">
                    <label>Prompt a tester (user template)</label>
                    <textarea
                      className="input-luxe prompt-journey-textarea-prompt"
                      value={current.userPromptTemplate}
                      onChange={(event) => handlePromptFieldChange(scenario, 'userPromptTemplate', event.target.value)}
                    />
                    <p className="prompt-journey-helper">
                      Utilisez des variables au format <code>{'{{variable}}'}</code> ou <code>[variable]</code>.
                      Le texte fixe (ex: un prenom ecrit en dur) n est jamais remplace automatiquement. Le system prompt est interne et fixe.
                    </p>
                  </div>

                  <div className="prompt-journey-inline-fields">
                    <div className="prompt-journey-field">
                      <label>Temperature</label>
                      <input
                        className="input-luxe"
                        value={current.temperature}
                        onChange={(event) => handlePromptFieldChange(scenario, 'temperature', event.target.value)}
                      />
                    </div>
                    <div className="prompt-journey-field">
                      <label>Max tokens</label>
                      <input
                        className="input-luxe"
                        value={current.maxTokens}
                        onChange={(event) => handlePromptFieldChange(scenario, 'maxTokens', event.target.value)}
                      />
                    </div>
                    <label className="prompt-journey-check prompt-journey-run-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(current.runModel)}
                        onChange={(event) => updateScenarioState(scenario.id, { runModel: event.target.checked })}
                      />
                      <span>Executer aussi le modele</span>
                    </label>
                  </div>

                  <details className="prompt-journey-variable-details">
                    <summary>
                      Afficher les variables possibles ({variableGuide.length})
                    </summary>
                    <div className="prompt-journey-variable-list">
                      {variableGuide.map((item) => (
                        <div key={`${scenario.id}-${item.name}`} className="prompt-journey-variable-chip">
                          <code>{`{{${item.name}}}`}</code>
                          <span>{item.description}</span>
                        </div>
                      ))}
                    </div>
                  </details>

                  <div className="prompt-journey-preview-grid">
                    <div className="prompt-journey-field">
                      <label>Variables envoyees</label>
                      <textarea
                        className="input-luxe prompt-journey-textarea-preview"
                        value={JSON.stringify(stageVariables, null, 2)}
                        readOnly
                      />
                    </div>
                    <div className="prompt-journey-field">
                      <label>Prompt compile envoye a l IA</label>
                      <textarea
                        className="input-luxe prompt-journey-textarea-preview"
                        value={compiledPreview}
                        readOnly
                      />
                    </div>
                  </div>

                  <div className="prompt-journey-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleTestScenario(scenario)}
                      disabled={current.isTesting}
                    >
                      {current.isTesting ? 'Test...' : 'Tester le prompt'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleValidateScenario(scenario)}
                      disabled={current.isPublishing}
                    >
                      {current.isPublishing ? 'Validation...' : 'Valider et versionner'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => handleUseForCreation(scenario)}
                      disabled={current.isActivating || Number(current.version) <= 0 || Number.isNaN(Number(current.version))}
                    >
                      {current.isActivating ? 'Activation...' : 'Utiliser pour la creation'}
                    </button>
                  </div>

                  <div className="prompt-journey-field">
                    <label>Sortie IA</label>
                    <textarea
                      className="input-luxe prompt-journey-textarea-result"
                      value={current.lastModelOutput || ''}
                      readOnly
                      placeholder="Cochez 'Executer aussi le modele' puis testez le prompt."
                    />
                    {current.lastRunAt ? (
                      <span className="prompt-journey-last-run">
                        Dernier test: {new Date(current.lastRunAt).toLocaleString('fr-FR')}
                      </span>
                    ) : null}
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      </div>
    </div>
  );
};

export default PromptJourneyLabLuxe;
