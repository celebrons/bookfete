import React, { useEffect, useState } from 'react';
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

const JOURNEY_STAGES = [
  {
    id: 'book_title',
    label: '1. Titre du livre',
    promptKey: 'chapter_generation',
    hint: 'But: verifier ce que l IA comprend pour proposer un titre premium.'
  },
  {
    id: 'chapter_titles',
    label: '2. Titres des chapitres',
    promptKey: 'chapter_generation',
    hint: 'But: verifier la structure et la personnalisation des chapitres.'
  },
  {
    id: 'questions',
    label: '3. Questions',
    promptKey: 'question_generation',
    hint: 'But: verifier des questions narratives et exploitables.'
  },
  {
    id: 'chapter_content',
    label: '4. Contenu des chapitres',
    promptKey: 'content_generation',
    hint: 'But: verifier la qualite redactionnelle du chapitre genere.'
  }
];

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const buildEndpoint = (path) => `${buildApiBaseUrl()}/ai${path}`;

const compileTemplate = (template, variables = {}) => (
  String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, variableName) => {
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
  if (ageNumber < 50) return gender === 'homme' ? 'adulte' : 'adulte';
  if (ageNumber < 70) return gender === 'homme' ? 'senior' : 'senior';
  return gender === 'homme' ? 'veteran' : 'veterane';
};

const getInitialStageState = () => ({
  source: '-',
  version: '-',
  systemPrompt: '',
  userPromptTemplate: '',
  temperature: '',
  maxTokens: '',
  lastCompiledPrompt: '',
  lastModelOutput: '',
  isTesting: false,
  isPublishing: false,
  lastRunAt: ''
});

const initialProjectForm = {
  eventType: 'anniversaire',
  locale: 'fr',
  style: 'intime',
  bookTitle: 'Pour tes 40 ans',
  recipientName: 'Juliette',
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
  targetLength: '3200'
};

const PromptJourneyLabLuxe = () => {
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [runModel, setRunModel] = useState(false);
  const [modelName, setModelName] = useState(DEFAULT_MODEL);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [stageState, setStageState] = useState(() => (
    JOURNEY_STAGES.reduce((acc, stage) => {
      acc[stage.id] = getInitialStageState();
      return acc;
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

  const updateStageState = (stageId, patch) => {
    setStageState((previous) => ({
      ...previous,
      [stageId]: {
        ...(previous[stageId] || getInitialStageState()),
        ...patch
      }
    }));
  };

  const buildStageVariables = (stageId) => {
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

    if (stageId === 'book_title') {
      return {
        ...common,
        count: 1,
        additionalContext: [common.additionalContext, 'Objectif: produire uniquement un titre du livre.']
          .filter(Boolean)
          .join(' ')
      };
    }

    if (stageId === 'chapter_titles') {
      return {
        ...common,
        count: Number(projectForm.chaptersCount) || 8
      };
    }

    if (stageId === 'questions') {
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
      outputType: 'chapter_content',
      chapterSummary: projectForm.chapterSummary || '',
      narrativeContext: projectForm.narrativeContext || common.additionalContext || '',
      targetLength: Number(projectForm.targetLength) || 3200
    };
  };

  const buildCompiledPromptPreview = (stageId) => {
    const currentStage = stageState[stageId] || getInitialStageState();
    const variables = buildStageVariables(stageId);
    return [
      '[SYSTEM PROMPT]',
      currentStage.systemPrompt || '',
      '',
      '[USER TEMPLATE COMPILE]',
      compileTemplate(currentStage.userPromptTemplate || '', variables)
    ].join('\n');
  };

  const loadJourneyPrompts = async () => {
    setLoadingTemplates(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const uniquePromptKeys = [...new Set(JOURNEY_STAGES.map((stage) => stage.promptKey))];
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

      const promptByKey = responses.reduce((acc, row) => {
        acc[row.promptKey] = row.activePrompt;
        return acc;
      }, {});

      setStageState((previous) => {
        const next = { ...previous };
        JOURNEY_STAGES.forEach((stage) => {
          const activePrompt = promptByKey[stage.promptKey] || null;
          next[stage.id] = {
            ...(previous[stage.id] || getInitialStageState()),
            source: activePrompt?.source || '-',
            version: activePrompt?.version || '-',
            systemPrompt: activePrompt?.systemPrompt || '',
            userPromptTemplate: activePrompt?.userPromptTemplate || '',
            temperature: Number.isFinite(Number(activePrompt?.temperature))
              ? String(activePrompt.temperature)
              : '',
            maxTokens: Number.isFinite(Number(activePrompt?.maxTokens))
              ? String(activePrompt.maxTokens)
              : ''
          };
        });
        return next;
      });

      setSuccessMessage('Prompts du parcours charges.');
    } catch (error) {
      setErrorMessage(error.message || 'Impossible de charger les prompts du parcours.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadJourneyPrompts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStageFieldChange = (stageId, field, value) => {
    updateStageState(stageId, { [field]: value });
  };

  const handleTestStage = async (stage) => {
    const current = stageState[stage.id] || getInitialStageState();
    if (!current.systemPrompt.trim() || !current.userPromptTemplate.trim()) {
      setErrorMessage(`Le prompt ${stage.label} doit contenir un system prompt et un user template.`);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    updateStageState(stage.id, { isTesting: true });

    try {
      const payload = {
        eventType: (projectForm.eventType || '*').trim() || '*',
        locale: (projectForm.locale || 'fr').trim() || 'fr',
        variables: buildStageVariables(stage.id),
        runModel,
        model: (modelName || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
        systemPrompt: current.systemPrompt,
        userPromptTemplate: current.userPromptTemplate,
        temperature: parseOptionalNumber(current.temperature, `Temperature (${stage.label})`),
        maxTokens: parseOptionalNumber(current.maxTokens, `Max tokens (${stage.label})`)
      };

      const response = await apiRequest(
        `/prompt-templates/${encodeURIComponent(stage.promptKey)}/test`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      updateStageState(stage.id, {
        lastCompiledPrompt: response.compiledPrompt || buildCompiledPromptPreview(stage.id),
        lastModelOutput: response?.modelCall?.output || '',
        lastRunAt: new Date().toISOString()
      });
      setSuccessMessage(`Test execute pour "${stage.label}".`);
    } catch (error) {
      setErrorMessage(error.message || `Impossible de tester "${stage.label}".`);
    } finally {
      updateStageState(stage.id, { isTesting: false });
    }
  };

  const handlePublishStage = async (stage) => {
    const current = stageState[stage.id] || getInitialStageState();
    if (!current.systemPrompt.trim() || !current.userPromptTemplate.trim()) {
      setErrorMessage(`Le prompt ${stage.label} est incomplet.`);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    updateStageState(stage.id, { isPublishing: true });

    try {
      const payload = {
        eventType: (projectForm.eventType || '*').trim() || '*',
        locale: (projectForm.locale || 'fr').trim() || 'fr',
        systemPrompt: current.systemPrompt.trim(),
        userPromptTemplate: current.userPromptTemplate.trim(),
        temperature: parseOptionalNumber(current.temperature, `Temperature (${stage.label})`),
        maxTokens: parseOptionalNumber(current.maxTokens, `Max tokens (${stage.label})`),
        note: `Validation parcours: ${stage.label}`,
        status: 'published',
        publish: true
      };

      await apiRequest(
        `/prompt-templates/${encodeURIComponent(stage.promptKey)}/versions`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setSuccessMessage(`Prompt publie pour "${stage.label}".`);
      await loadJourneyPrompts();
    } catch (error) {
      setErrorMessage(error.message || `Impossible de publier "${stage.label}".`);
    } finally {
      updateStageState(stage.id, { isPublishing: false });
    }
  };

  return (
    <div className="prompt-journey-page">
      <div className="prompt-journey-shell">
        <header className="prompt-journey-head">
          <div>
            <span className="label-gold">Prompt journey lab</span>
            <h1>Simulation complete des prompts IA</h1>
            <p>
              Une seule page pour simuler le parcours: formulaire projet, prompt envoye a l IA, test, puis validation.
            </p>
          </div>
          <div className="prompt-journey-head-actions">
            <Link to="/admin/prompts" className="btn btn-outline">Prompt admin</Link>
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
            <label className="prompt-journey-check">
              <input
                type="checkbox"
                checked={runModel}
                onChange={(event) => setRunModel(event.target.checked)}
              />
              <span>Executer aussi le modele</span>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={loadJourneyPrompts}
              disabled={loadingTemplates}
            >
              {loadingTemplates ? 'Chargement...' : 'Charger les prompts'}
            </button>
          </div>
        </section>

        <section className="prompt-journey-form">
          <h2>Donnees du projet (simulees)</h2>
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
              <label>Nom</label>
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
              <label>Nb chapitres</label>
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
              <label>Contexte narratif (chapitre)</label>
              <textarea
                className="input-luxe"
                value={projectForm.narrativeContext}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, narrativeContext: event.target.value }))}
              />
            </div>
            <div className="prompt-journey-field">
              <label>Longueur cible (chapitre)</label>
              <input
                className="input-luxe"
                value={projectForm.targetLength}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, targetLength: event.target.value }))}
              />
            </div>
          </div>
        </section>

        <section className="prompt-journey-stages">
          {JOURNEY_STAGES.map((stage) => {
            const current = stageState[stage.id] || getInitialStageState();
            const stageVariables = buildStageVariables(stage.id);
            const compiledPreview = buildCompiledPromptPreview(stage.id);

            return (
              <article key={stage.id} className="prompt-journey-card">
                <div className="prompt-journey-card-head">
                  <div>
                    <h3>{stage.label}</h3>
                    <p>{stage.hint}</p>
                  </div>
                  <div className="prompt-journey-badges">
                    <span className="prompt-journey-badge">{stage.promptKey}</span>
                    <span className="prompt-journey-badge">source: {current.source}</span>
                    <span className="prompt-journey-badge">v{current.version}</span>
                  </div>
                </div>

                <div className="prompt-journey-card-grid">
                  <div className="prompt-journey-field">
                    <label>System prompt (modifiable)</label>
                    <textarea
                      className="input-luxe prompt-journey-textarea-system"
                      value={current.systemPrompt}
                      onChange={(event) => handleStageFieldChange(stage.id, 'systemPrompt', event.target.value)}
                    />
                  </div>

                  <div className="prompt-journey-field">
                    <label>User template prompt (modifiable)</label>
                    <textarea
                      className="input-luxe prompt-journey-textarea-user"
                      value={current.userPromptTemplate}
                      onChange={(event) => handleStageFieldChange(stage.id, 'userPromptTemplate', event.target.value)}
                    />
                  </div>
                </div>

                <div className="prompt-journey-inline-fields">
                  <div className="prompt-journey-field">
                    <label>Temperature</label>
                    <input
                      className="input-luxe"
                      value={current.temperature}
                      onChange={(event) => handleStageFieldChange(stage.id, 'temperature', event.target.value)}
                    />
                  </div>
                  <div className="prompt-journey-field">
                    <label>Max tokens</label>
                    <input
                      className="input-luxe"
                      value={current.maxTokens}
                      onChange={(event) => handleStageFieldChange(stage.id, 'maxTokens', event.target.value)}
                    />
                  </div>
                </div>

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
                    onClick={() => handleTestStage(stage)}
                    disabled={current.isTesting}
                  >
                    {current.isTesting ? 'Test...' : 'Tester ce prompt'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handlePublishStage(stage)}
                    disabled={current.isPublishing}
                  >
                    {current.isPublishing ? 'Validation...' : 'Valider ce prompt'}
                  </button>
                </div>

                <div className="prompt-journey-field">
                  <label>Sortie IA</label>
                  <textarea
                    className="input-luxe prompt-journey-textarea-result"
                    value={current.lastModelOutput || ''}
                    readOnly
                    placeholder="Activez 'Executer aussi le modele' puis testez ce prompt."
                  />
                  {current.lastRunAt ? (
                    <span className="prompt-journey-last-run">
                      Dernier test: {new Date(current.lastRunAt).toLocaleString('fr-FR')}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
};

export default PromptJourneyLabLuxe;
