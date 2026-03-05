import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';
import './PromptAdminLuxe.css';

const PROMPT_KEY_OPTIONS = [
  { value: 'chapter_generation', label: 'Generation chapitres' },
  { value: 'question_generation', label: 'Generation questions' }
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

  return {
    eventType,
    style: 'emotion',
    bookTitle: 'Pour tes 40 ans',
    recipientName: 'Juliette',
    recipientAge: 40,
    recipientGender: 'femme',
    projectBrief: 'Souvenirs drles et touchants partags en famille',
    count: 8
  };
};

const PromptAdminLuxe = () => {
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

  const [runModel, setRunModel] = useState(false);
  const [modelName, setModelName] = useState(DEFAULT_MODEL);
  const [testTemperature, setTestTemperature] = useState('');
  const [testMaxTokens, setTestMaxTokens] = useState('');
  const [testVariablesText, setTestVariablesText] = useState(() =>
    JSON.stringify(buildDefaultVariables('chapter_generation', '*'), null, 2)
  );
  const [testResult, setTestResult] = useState(null);

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
    if (!prompt) return;

    setSystemPrompt(prompt.systemPrompt || '');
    setUserPromptTemplate(prompt.userPromptTemplate || '');
    setTemperature(
      Number.isFinite(Number(prompt.temperature))
        ? String(prompt.temperature)
        : ''
    );
    setMaxTokens(
      Number.isFinite(Number(prompt.maxTokens))
        ? String(prompt.maxTokens)
        : ''
    );
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
      JSON.stringify(buildDefaultVariables(promptKey, eventType), null, 2)
    );
  }, [promptKey, eventType]);

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
      await loadTemplate();
    } catch (error) {
      setErrorMessage(error.message || 'Publication impossible.');
    } finally {
      setPublishing(false);
    }
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
      const parsedVariables = JSON.parse(testVariablesText || '{}');
      if (!parsedVariables || Array.isArray(parsedVariables) || typeof parsedVariables !== 'object') {
        throw new Error('Variables de test: JSON objet attendu.');
      }

      const payload = {
        eventType: (eventType || '*').trim() || '*',
        locale: (locale || 'fr').trim() || 'fr',
        variables: parsedVariables,
        runModel,
        model: (modelName || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
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

  const activeVersion = templateVersions?.active_version || activePrompt?.version || null;

  return (
    <div className="prompt-admin-page">
      <div className="prompt-admin-shell">
        <div className="prompt-admin-head">
          <div>
            <span className="label-gold">Prompt lab</span>
            <h1 className="prompt-admin-title">Administration des prompts IA</h1>
            <p className="prompt-admin-subtitle">
              Chargez une version, testez le rendu compile, puis publiez une nouvelle version.
            </p>
          </div>
          <Link to="/dashboard" className="btn btn-outline prompt-admin-back-link">
            Retour dashboard
          </Link>
        </div>

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
            <label htmlFor="prompt-key">Prompt key</label>
            <select
              id="prompt-key"
              className="input-luxe"
              value={promptKey}
              onChange={(event) => setPromptKey(event.target.value)}
            >
              {PROMPT_KEY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

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

        <section className="prompt-admin-grid">
          <article className="prompt-admin-editor">
            <div className="prompt-admin-panel-head">
              <h2>Edition</h2>
              <span className="prompt-admin-active-pill">
                Source: {activePrompt?.source || '-'} | Active: {activeVersion || '-'}
              </span>
            </div>

            <div className="prompt-admin-field">
              <label htmlFor="system-prompt">System prompt</label>
              <textarea
                id="system-prompt"
                className="input-luxe prompt-admin-textarea prompt-admin-textarea-system"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder="Role system..."
              />
            </div>

            <div className="prompt-admin-field">
              <label htmlFor="user-prompt-template">User prompt template</label>
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

            <div className="prompt-admin-editor-actions">
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

          <aside className="prompt-admin-side">
            <article className="prompt-admin-versions">
              <div className="prompt-admin-panel-head">
                <h2>Versions</h2>
                <span>{templateVersions?.versions?.length || 0} version(s)</span>
              </div>

              <div className="prompt-admin-version-list">
                {(templateVersions?.versions || []).length === 0 ? (
                  <p className="prompt-admin-empty">Aucune version stockee.</p>
                ) : (
                  (templateVersions?.versions || []).map((versionRow) => (
                    <div
                      key={versionRow.id || versionRow.version}
                      className={`prompt-admin-version-row ${
                        Number(versionRow.version) === Number(activeVersion) ? 'is-active' : ''
                      }`}
                    >
                      <div>
                        <strong>v{versionRow.version}</strong>
                        <span>{versionRow.status || '-'}</span>
                      </div>
                      <div>
                        <span>{formatDateTime(versionRow.created_at)}</span>
                        <span>{versionRow.created_by || '-'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="prompt-admin-test">
              <div className="prompt-admin-panel-head">
                <h2>Test</h2>
              </div>

              <div className="prompt-admin-field">
                <label htmlFor="test-vars">Variables (JSON)</label>
                <textarea
                  id="test-vars"
                  className="input-luxe prompt-admin-textarea prompt-admin-textarea-test-vars"
                  value={testVariablesText}
                  onChange={(event) => setTestVariablesText(event.target.value)}
                />
              </div>

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

                  <div className="prompt-admin-field">
                    <label>Prompt compile</label>
                    <textarea
                      className="input-luxe prompt-admin-textarea prompt-admin-textarea-result"
                      value={testResult.userPrompt || ''}
                      readOnly
                    />
                  </div>

                  {testResult?.modelCall?.output ? (
                    <div className="prompt-admin-field">
                      <label>Sortie modele</label>
                      <textarea
                        className="input-luxe prompt-admin-textarea prompt-admin-textarea-result"
                        value={testResult.modelCall.output}
                        readOnly
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          </aside>
        </section>
      </div>
    </div>
  );
};

export default PromptAdminLuxe;
