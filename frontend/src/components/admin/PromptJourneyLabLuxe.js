import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';
import './PromptJourneyLabLuxe.css';

const DEFAULT_MODEL = 'mistral-small-latest';
const PROJECT_FORM_STORAGE_KEY = 'prompt_journey_project_form_v2';
const MODEL_STORAGE_KEY = 'prompt_journey_model_v2';
const FIELD_LABELS = {
  label: 'Nom de la version',
  system_prompt: 'System prompt',
  context_block: 'Context block',
  data_block: 'Data block',
  output_format: 'Output format',
  forbidden_phrases: 'Phrases interdites',
  min_words: 'Minimum de mots',
  max_words: 'Maximum de mots',
  variables: 'Variables envoyées',
  compiled: 'Prompt compilé',
  modelOutput: 'Sortie du modèle'
};

const PROMPT_SCENARIOS = [
  { id: 'book_title', label: 'Titre du livre', hint: 'Le titre principal proposé dans le parcours de création.' },
  { id: 'chapter_titles', label: 'Titres des chapitres', hint: 'Le sommaire et les titres de chapitres du livre.' },
  { id: 'chapter_amorce', label: 'Amorce du chapitre', hint: 'La phrase d accroche et les mots-déclencheurs proposés aux contributeurs.' },
  { id: 'chapter_body', label: 'Texte du chapitre', hint: 'La génération du texte long structuré du chapitre.' }
];

const VARIABLE_GUIDE = {
  book_title: ['eventType', 'style', 'bookTitle', 'recipientName', 'recipientAge', 'recipientGender', 'recipientNickname', 'recipientTrait', 'recipientAnecdote', 'additionalContext'],
  chapter_titles: ['eventType', 'style', 'bookTitle', 'recipientName', 'recipientAge', 'recipientGender', 'recipientNickname', 'recipientTrait', 'recipientAnecdote', 'additionalContext', 'count'],
  chapter_amorce: ['book_title', 'event_type', 'event_subtype', 'narrative_person', 'recipient_name', 'recipient_nickname', 'character_trait', 'signature_anecdote', 'signature_phrase', 'future_wish', 'chapter_index', 'chapter_total', 'chapter_title', 'chapter_theme', 'chapter_arc', 'prev_chapter_title', 'next_chapter_title', 'chapter_role', 'chapter_focus_hint', 'marker_policy', 'generation_mode', 'fallback_formulations'],
  chapter_body: ['book_title', 'book_occasion', 'recipient_name', 'recipient_age', 'book_tone', 'book_location', 'book_year', 'chapter_total', 'chapter_index', 'chapter_title', 'chapter_theme', 'chapter_arc', 'chapter_emotion', 'prev_chapter_title', 'next_chapter_title', 'contributions_count', 'contributions_richness', 'contributions', 'photos', 'narrative_context']
};

const initialProjectForm = {
  eventType: 'anniversaire',
  locale: 'fr',
  style: 'intime',
  bookTitle: 'Pour les 40 ans d Omar',
  recipientName: 'Omar',
  recipientAge: '40',
  recipientGender: 'homme',
  recipientNickname: 'O',
  recipientTrait: 'Genereux, rassembleur',
  recipientAnecdote: 'Le barbecue improvise sous la pluie',
  additionalContext: 'Ton premium, chaleureux.',
  chapterTitle: 'Les moments qui marquent',
  chaptersCount: '6',
  chapterSummary: 'Le chapitre precedent pose l ambiance.',
  narrativeContext: 'Conserver une coherence narrative forte.',
  targetLength: '3400',
  outputType: 'introduction',
  bookOccasion: 'Anniversaire 40 ans',
  bookLocation: 'Paris',
  bookYear: '2026',
  chapterTheme: 'Moments marquants',
  chapterArc: 'Montee emotionnelle',
  chapterEmotion: 'joie',
  prevChapterTitle: 'Ouverture',
  nextChapterTitle: 'Les proches en scene',
  contributionsJson: '[{"name":"Nadia","role":"amie","response_text":"Ce soir-la Omar a transforme une panne en fete."}]',
  photosJson: '[{"caption":"Table de fete","date":"2026-01-20"}]'
};

const getInitialScenarioState = (defaultLabel = '') => ({
  templateId: null,
  source: '-',
  version: '-',
  status: 'draft',
  label: defaultLabel,
  system_prompt: '',
  context_block: '',
  data_block: '',
  output_format: '',
  forbidden_phrases: '[]',
  min_words: '',
  max_words: '',
  runModel: false,
  isTesting: false,
  isPublishing: false,
  isActivating: false,
  isArchiving: false,
  isLoadingLogs: false,
  versions: [],
  logs: [],
  lastCompiledPrompt: '',
  lastModelOutput: '',
  lastValidation: null,
  lastRunAt: ''
});

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};
const buildEndpoint = (path) => `${buildApiBaseUrl()}/ai${path}`;

const normalizeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
};

const parseJsonSafe = (value, fallback) => {
  try {
    return JSON.parse(String(value || ''));
  } catch (_error) {
    return fallback;
  }
};

const PromptJourneyLabLuxe = () => {
  const [projectForm, setProjectForm] = useState(() => {
    if (typeof window === 'undefined') return initialProjectForm;
    try {
      const raw = window.localStorage.getItem(PROJECT_FORM_STORAGE_KEY);
      return raw ? { ...initialProjectForm, ...JSON.parse(raw) } : initialProjectForm;
    } catch (_error) {
      return initialProjectForm;
    }
  });
  const [modelName, setModelName] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_MODEL;
    return normalizeText(window.localStorage.getItem(MODEL_STORAGE_KEY), DEFAULT_MODEL);
  });
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [scenarioState, setScenarioState] = useState(() => (
    PROMPT_SCENARIOS.reduce((acc, scenario) => {
      acc[scenario.id] = getInitialScenarioState(scenario.label);
      return acc;
    }, {})
  ));

  const apiRequest = async (path, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(buildEndpoint(path), { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Erreur API (${response.status})`);
    return payload;
  };

  const updateScenarioState = (scenarioId, patch) => {
    setScenarioState((prev) => ({
      ...prev,
      [scenarioId]: { ...(prev[scenarioId] || getInitialScenarioState()), ...patch }
    }));
  };

  const buildScenarioVariables = (scenarioId) => {
    const common = {
      eventType: normalizeText(projectForm.eventType, 'generique'),
      style: normalizeText(projectForm.style, 'intime'),
      bookTitle: normalizeText(projectForm.bookTitle, 'Livre souvenir'),
      recipientName: normalizeText(projectForm.recipientName, 'la personne celebree'),
      recipientAge: normalizeText(projectForm.recipientAge, 'non specifie'),
      recipientGender: normalizeText(projectForm.recipientGender, 'non specifie'),
      recipientNickname: normalizeText(projectForm.recipientNickname),
      recipientTrait: normalizeText(projectForm.recipientTrait),
      recipientAnecdote: normalizeText(projectForm.recipientAnecdote),
      additionalContext: normalizeText(projectForm.additionalContext)
    };
    if (scenarioId === 'book_title') return common;
    if (scenarioId === 'chapter_titles') {
      return { ...common, count: Number(projectForm.chaptersCount) || 8 };
    }
    if (scenarioId === 'chapter_amorce') {
      const hasPersonalMarkers = [
        normalizeText(projectForm.recipientTrait),
        normalizeText(projectForm.recipientAnecdote),
        normalizeText(projectForm.additionalContext)
      ].some(Boolean);
      const recipientDisplayName = normalizeText(projectForm.recipientNickname || projectForm.recipientName, 'la personne celebree');
      return {
        book_title: common.bookTitle,
        event_type: common.eventType,
        event_subtype: normalizeText(projectForm.eventType, 'anniversaire'),
        narrative_person: 'third_person',
        recipient_name: common.recipientName,
        recipient_nickname: common.recipientNickname,
        character_trait: common.recipientTrait,
        signature_anecdote: common.recipientAnecdote,
        signature_phrase: normalizeText(projectForm.additionalContext),
        chapter_index: 1,
        chapter_total: Number(projectForm.chaptersCount) || 8,
        chapter_title: normalizeText(projectForm.chapterTitle, 'Chapitre'),
        chapter_theme: normalizeText(projectForm.chapterTheme, projectForm.chapterTitle),
        chapter_arc: normalizeText(projectForm.chapterArc, projectForm.chapterSummary),
        future_wish: normalizeText(projectForm.additionalContext),
        prev_chapter_title: normalizeText(projectForm.prevChapterTitle),
        next_chapter_title: normalizeText(projectForm.nextChapterTitle),
        chapter_role: 'general',
        chapter_focus_hint: 'Rester au plus pres du titre du chapitre et des donnees fournies.',
        marker_policy: hasPersonalMarkers ? 'balanced' : 'fallback_only',
        generation_mode: hasPersonalMarkers ? 'A' : 'B',
        ...(hasPersonalMarkers
          ? {}
          : {
              fallback_formulations: [
                `Ce qu'on remarque d'abord chez ${recipientDisplayName}, c'est...`,
                `Il y a chez ${recipientDisplayName} une facon d'etre qui revient toujours, c'est...`,
                `Quand je repense a ${recipientDisplayName} dans ce chapitre, l'image qui revient d'abord, c'est...`,
                `S'il fallait garder un seul detail pour raconter ${recipientDisplayName} ici, ce serait...`,
                `Dans ce moment-la, ${recipientDisplayName} avait deja une maniere bien a lui de faire basculer l'atmosphere, c'etait...`
              ]
            })
      };
    }
    if (scenarioId === 'chapter_body') {
      const contributions = parseJsonSafe(projectForm.contributionsJson, []);
      const photos = parseJsonSafe(projectForm.photosJson, []);
      return {
        book_title: common.bookTitle,
        book_occasion: normalizeText(projectForm.bookOccasion, common.eventType),
        recipient_name: common.recipientName,
        recipient_age: common.recipientAge,
        book_tone: common.style,
        book_location: normalizeText(projectForm.bookLocation),
        book_year: normalizeText(projectForm.bookYear),
        chapter_total: Number(projectForm.chaptersCount) || 8,
        chapter_index: 1,
        chapter_title: normalizeText(projectForm.chapterTitle, 'Chapitre'),
        chapter_theme: normalizeText(projectForm.chapterTheme, projectForm.chapterTitle),
        chapter_arc: normalizeText(projectForm.chapterArc, projectForm.chapterSummary),
        chapter_emotion: normalizeText(projectForm.chapterEmotion, 'joie'),
        prev_chapter_title: normalizeText(projectForm.prevChapterTitle),
        next_chapter_title: normalizeText(projectForm.nextChapterTitle),
        contributions_count: Array.isArray(contributions) ? contributions.length : 0,
        contributions_richness: 'moyenne',
        contributions: Array.isArray(contributions) ? contributions : [],
        photos: Array.isArray(photos) ? photos : [],
        narrative_context: normalizeText(projectForm.narrativeContext)
      };
    }
    return common;
  };

  const buildTemplatePayload = (scenarioId) => {
    const scenario = PROMPT_SCENARIOS.find((item) => item.id === scenarioId);
    const current = scenarioState[scenarioId] || getInitialScenarioState();
    return {
      type: scenarioId,
      label: normalizeText(current.label, scenario?.label || `${scenarioId} v${current.version || 'new'}`),
      status: 'draft',
      system_prompt: current.system_prompt,
      context_block: current.context_block,
      data_block: current.data_block,
      output_format: current.output_format,
      forbidden_phrases: parseJsonSafe(current.forbidden_phrases, []),
      min_words: Number(current.min_words) || 0,
      max_words: Number(current.max_words) || 0
    };
  };

  const loadPromptTemplates = async () => {
    setLoadingTemplates(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await apiRequest('/prompt-templates');
      const templates = Array.isArray(response.templates) ? response.templates : [];
      setScenarioState((prev) => {
        const next = { ...prev };
        PROMPT_SCENARIOS.forEach((scenario) => {
          const rows = templates
            .filter((row) => row.type === scenario.id)
            .sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
          const current = prev[scenario.id] || getInitialScenarioState(scenario.label);
          const active = rows.find((row) => row.status === 'active') || rows[0] || null;
          const selected = rows.find((row) => row.id === current.templateId) || active || rows[0] || null;
          next[scenario.id] = {
            ...current,
            templateId: selected?.id || null,
            source: selected ? 'database' : '-',
            version: selected?.version || '-',
            status: selected?.status || 'draft',
            label: selected?.label || current.label || scenario.label,
            system_prompt: selected?.system_prompt || current.system_prompt,
            context_block: selected?.context_block || current.context_block,
            data_block: selected?.data_block || current.data_block,
            output_format: selected?.output_format || current.output_format,
            forbidden_phrases: JSON.stringify(selected?.forbidden_phrases || [], null, 2),
            min_words: Number.isFinite(Number(selected?.min_words)) ? String(selected.min_words) : current.min_words,
            max_words: Number.isFinite(Number(selected?.max_words)) ? String(selected.max_words) : current.max_words,
            versions: rows
          };
        });
        return next;
      });
      setSuccessMessage('Prompts charges.');
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
    window.localStorage.setItem(MODEL_STORAGE_KEY, modelName);
  }, [modelName]);
  const handlePromptFieldChange = (scenarioId, field, value) => {
    updateScenarioState(scenarioId, { [field]: value });
  };

  const handleTestScenario = async (scenario) => {
    const current = scenarioState[scenario.id] || getInitialScenarioState();
    updateScenarioState(scenario.id, { isTesting: true });
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const payload = {
        ...buildTemplatePayload(scenario.id),
        variables: buildScenarioVariables(scenario.id),
        runModel: Boolean(current.runModel),
        model: normalizeText(modelName, DEFAULT_MODEL)
      };
      const response = await apiRequest('/prompt-templates/test', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const result = response.result || {};
      updateScenarioState(scenario.id, {
        lastCompiledPrompt: result.compiledPrompt || '',
        lastModelOutput: result.output || '',
        lastValidation: result.validation || null,
        lastRunAt: new Date().toISOString()
      });
      setSuccessMessage(`Test execute pour "${scenario.label}".`);
    } catch (error) {
      setErrorMessage(error.message || `Erreur test "${scenario.label}".`);
    } finally {
      updateScenarioState(scenario.id, { isTesting: false });
    }
  };

  const handleValidateScenario = async (scenario) => {
    updateScenarioState(scenario.id, { isPublishing: true });
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await apiRequest('/prompt-templates', {
        method: 'POST',
        body: JSON.stringify(buildTemplatePayload(scenario.id))
      });
      const createdTemplate = response?.template || null;
      if (createdTemplate) {
        updateScenarioState(scenario.id, {
          templateId: createdTemplate.id || null,
          source: 'database',
          version: createdTemplate.version || '-',
          status: createdTemplate.status || 'draft',
          label: createdTemplate.label || '',
          system_prompt: createdTemplate.system_prompt || '',
          context_block: createdTemplate.context_block || '',
          data_block: createdTemplate.data_block || '',
          output_format: createdTemplate.output_format || '',
          forbidden_phrases: JSON.stringify(createdTemplate.forbidden_phrases || [], null, 2),
          min_words: Number.isFinite(Number(createdTemplate.min_words)) ? String(createdTemplate.min_words) : '',
          max_words: Number.isFinite(Number(createdTemplate.max_words)) ? String(createdTemplate.max_words) : ''
        });
      }
      const version = response?.template?.version;
      setSuccessMessage(version ? `Version v${version} creee pour "${scenario.label}".` : 'Version creee.');
      await loadPromptTemplates();
    } catch (error) {
      setErrorMessage(error.message || `Erreur versionnement "${scenario.label}".`);
    } finally {
      updateScenarioState(scenario.id, { isPublishing: false });
    }
  };

  const handleActivateScenario = async (scenario) => {
    const current = scenarioState[scenario.id] || getInitialScenarioState();
    if (!current.templateId) return;
    updateScenarioState(scenario.id, { isActivating: true });
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiRequest(`/prompt-templates/${encodeURIComponent(current.templateId)}/activate`, {
        method: 'POST'
      });
      setSuccessMessage(`Version active pour "${scenario.label}".`);
      await loadPromptTemplates();
    } catch (error) {
      setErrorMessage(error.message || `Erreur activation "${scenario.label}".`);
    } finally {
      updateScenarioState(scenario.id, { isActivating: false });
    }
  };

  const handleArchiveScenario = async (scenario) => {
    const current = scenarioState[scenario.id] || getInitialScenarioState();
    if (!current.templateId) return;
    updateScenarioState(scenario.id, { isArchiving: true });
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiRequest(`/prompt-templates/${encodeURIComponent(current.templateId)}/archive`, {
        method: 'POST'
      });
      setSuccessMessage(`Version archivee pour "${scenario.label}".`);
      await loadPromptTemplates();
    } catch (error) {
      setErrorMessage(error.message || `Erreur archivage "${scenario.label}".`);
    } finally {
      updateScenarioState(scenario.id, { isArchiving: false });
    }
  };

  const loadScenarioLogs = async (scenarioId) => {
    const current = scenarioState[scenarioId] || getInitialScenarioState();
    if (!current.templateId) return;
    updateScenarioState(scenarioId, { isLoadingLogs: true });
    try {
      const response = await apiRequest(`/prompt-templates/${encodeURIComponent(current.templateId)}/logs?limit=30`);
      updateScenarioState(scenarioId, {
        logs: Array.isArray(response.logs) ? response.logs : []
      });
    } catch (error) {
      setErrorMessage(error.message || 'Impossible de charger les logs.');
    } finally {
      updateScenarioState(scenarioId, { isLoadingLogs: false });
    }
  };

  const scenarioVariableGuides = useMemo(() => (
    PROMPT_SCENARIOS.reduce((acc, scenario) => {
      acc[scenario.id] = VARIABLE_GUIDE[scenario.id] || [];
      return acc;
    }, {})
  ), []);

  return (
    <div className="prompt-journey-page">
      <div className="prompt-journey-shell">
        <header className="prompt-journey-head">
          <div>
            <span className="label-gold">Parametrage prompts</span>
            <h1>Configuration et tests des prompts IA</h1>
            <p>Tous les prompts sont geres en base: edition, test, activation, archivage.</p>
          </div>
          <div className="prompt-journey-head-actions">
            <Link to="/dashboard" className="btn btn-outline">Dashboard</Link>
          </div>
        </header>

        {errorMessage ? <div className="prompt-journey-feedback is-error">{errorMessage}</div> : null}
        {successMessage ? <div className="prompt-journey-feedback is-success">{successMessage}</div> : null}

        <section className="prompt-journey-toolbar">
          <div className="prompt-journey-field">
            <label>Event type</label>
            <input className="input-luxe" value={projectForm.eventType} onChange={(event) => setProjectForm((prev) => ({ ...prev, eventType: event.target.value }))} />
          </div>
          <div className="prompt-journey-field">
            <label>Locale</label>
            <input className="input-luxe" value={projectForm.locale} onChange={(event) => setProjectForm((prev) => ({ ...prev, locale: event.target.value }))} />
          </div>
          <div className="prompt-journey-field">
            <label>Modele</label>
            <input className="input-luxe" value={modelName} onChange={(event) => setModelName(event.target.value)} />
          </div>
          <div className="prompt-journey-toolbar-actions">
            <button type="button" className="btn btn-primary" onClick={loadPromptTemplates} disabled={loadingTemplates}>
              {loadingTemplates ? 'Chargement...' : 'Recharger'}
            </button>
          </div>
        </section>

        <section className="prompt-journey-form">
          <h2>Variables de test</h2>
          <div className="prompt-journey-form-grid">
            {['bookTitle', 'recipientName', 'recipientAge', 'recipientGender', 'chapterTitle', 'chaptersCount', 'bookOccasion', 'bookLocation', 'bookYear', 'outputType'].map((key) => (
              <div className="prompt-journey-field" key={key}>
                <label>{key}</label>
                <input className="input-luxe" value={projectForm[key]} onChange={(event) => setProjectForm((prev) => ({ ...prev, [key]: event.target.value }))} />
              </div>
            ))}
          </div>
          <div className="prompt-journey-form-textareas">
            {['recipientTrait', 'recipientAnecdote', 'additionalContext', 'chapterSummary', 'narrativeContext', 'chapterArc', 'chapterTheme', 'chapterEmotion', 'prevChapterTitle', 'nextChapterTitle', 'contributionsJson', 'photosJson'].map((key) => (
              <div className="prompt-journey-field" key={key}>
                <label>{key}</label>
                <textarea className="input-luxe" value={projectForm[key]} onChange={(event) => setProjectForm((prev) => ({ ...prev, [key]: event.target.value }))} />
              </div>
            ))}
          </div>
        </section>

        <section className="prompt-journey-stages">
          {PROMPT_SCENARIOS.map((scenario) => {
            const current = scenarioState[scenario.id] || getInitialScenarioState();
            return (
              <details key={scenario.id} className="prompt-journey-card prompt-journey-card-collapsible">
                <summary className="prompt-journey-card-summary">
                  <div className="prompt-journey-card-summary-inner">
                    <div><h3>{scenario.label}</h3><p>{scenario.hint}</p></div>
                    <div className="prompt-journey-card-summary-right">
                      <div className="prompt-journey-badges">
                        <span className="prompt-journey-badge">{scenario.id}</span>
                        <span className="prompt-journey-badge">v{current.version}</span>
                        <span className="prompt-journey-badge">{current.status}</span>
                      </div>
                      <span className="prompt-journey-toggle-indicator" aria-hidden="true" />
                    </div>
                  </div>
                </summary>
                <div className="prompt-journey-card-body">
                  <div className="prompt-journey-field">
                    <label>{FIELD_LABELS.label}</label>
                    <input className="input-luxe" value={current.label} onChange={(event) => handlePromptFieldChange(scenario.id, 'label', event.target.value)} />
                  </div>
                  <div className="prompt-journey-preview-grid">
                    {['system_prompt', 'context_block', 'data_block', 'output_format'].map((field) => (
                      <div className="prompt-journey-field" key={field}>
                        <label>{FIELD_LABELS[field]}</label>
                        <textarea className="input-luxe prompt-journey-textarea-preview" value={current[field]} onChange={(event) => handlePromptFieldChange(scenario.id, field, event.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className="prompt-journey-inline-fields">
                    <div className="prompt-journey-field">
                      <label>{FIELD_LABELS.forbidden_phrases}</label>
                      <textarea className="input-luxe" value={current.forbidden_phrases} onChange={(event) => handlePromptFieldChange(scenario.id, 'forbidden_phrases', event.target.value)} />
                    </div>
                    <div className="prompt-journey-field">
                      <label>{FIELD_LABELS.min_words}</label>
                      <input className="input-luxe" value={current.min_words} onChange={(event) => handlePromptFieldChange(scenario.id, 'min_words', event.target.value)} />
                    </div>
                    <div className="prompt-journey-field">
                      <label>{FIELD_LABELS.max_words}</label>
                      <input className="input-luxe" value={current.max_words} onChange={(event) => handlePromptFieldChange(scenario.id, 'max_words', event.target.value)} />
                    </div>
                  </div>
                  <label className="prompt-journey-check prompt-journey-run-toggle">
                    <input type="checkbox" checked={Boolean(current.runModel)} onChange={(event) => updateScenarioState(scenario.id, { runModel: event.target.checked })} />
                    <span>Tester avec génération</span>
                  </label>
                  <details className="prompt-journey-variable-details">
                    <summary>Afficher les variables possibles ({(scenarioVariableGuides[scenario.id] || []).length})</summary>
                    <div className="prompt-journey-variable-list">
                      {(scenarioVariableGuides[scenario.id] || []).map((item) => (
                        <div key={`${scenario.id}-${item}`} className="prompt-journey-variable-chip"><code>{`{{${item}}}`}</code></div>
                      ))}
                    </div>
                  </details>
                  <div className="prompt-journey-preview-grid">
                    <div className="prompt-journey-field">
                      <label>{FIELD_LABELS.variables}</label>
                      <textarea className="input-luxe prompt-journey-textarea-preview" value={JSON.stringify(buildScenarioVariables(scenario.id), null, 2)} readOnly />
                    </div>
                    <div className="prompt-journey-field">
                      <label>{FIELD_LABELS.compiled}</label>
                      <textarea className="input-luxe prompt-journey-textarea-preview" value={current.lastCompiledPrompt || ''} readOnly />
                    </div>
                  </div>
                  <div className="prompt-journey-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => handleTestScenario(scenario)} disabled={current.isTesting}>{current.isTesting ? 'Test...' : 'Tester le prompt'}</button>
                    <button type="button" className="btn btn-primary" onClick={() => handleValidateScenario(scenario)} disabled={current.isPublishing}>{current.isPublishing ? 'Validation...' : 'Valider et versionner'}</button>
                    <button type="button" className="btn btn-outline" onClick={() => handleActivateScenario(scenario)} disabled={current.isActivating || !current.templateId}>{current.isActivating ? 'Activation...' : 'Utiliser pour la création'}</button>
                    <button type="button" className="btn btn-outline" onClick={() => handleArchiveScenario(scenario)} disabled={current.isArchiving || !current.templateId}>{current.isArchiving ? 'Archivage...' : 'Archiver'}</button>
                    <button type="button" className="btn btn-outline" onClick={() => loadScenarioLogs(scenario.id)} disabled={current.isLoadingLogs || !current.templateId}>{current.isLoadingLogs ? 'Logs...' : 'Voir logs'}</button>
                  </div>
                  <div className="prompt-journey-preview-grid">
                    <div className="prompt-journey-field">
                      <label>{FIELD_LABELS.modelOutput}</label>
                      <textarea className="input-luxe prompt-journey-textarea-result" value={current.lastModelOutput || ''} readOnly />
                    </div>
                    <div className="prompt-journey-field">
                      <label>Validation</label>
                      <textarea className="input-luxe prompt-journey-textarea-result" value={current.lastValidation ? JSON.stringify(current.lastValidation, null, 2) : ''} readOnly />
                    </div>
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
