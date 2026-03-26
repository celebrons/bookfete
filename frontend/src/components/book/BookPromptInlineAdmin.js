import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import './BookLuxe.css';

const getApiBaseUrl = () => {
  const envBase = String(process.env.REACT_APP_API_URL || '').trim();
  if (envBase) {
    const trimmed = envBase.replace(/\/$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  return 'http://localhost:5001/api';
};

const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const splitMissingItems = (items = []) => {
  const safeItems = Array.isArray(items) ? items : [];
  return {
    syntaxIssues: safeItems.filter((item) => String(item || '').startsWith('/')),
    trueMissing: safeItems.filter((item) => !String(item || '').startsWith('/'))
  };
};

const buildPromptErrorMessage = (fallbackMessage = '', items = []) => {
  const { syntaxIssues, trueMissing } = splitMissingItems(items);

  if (syntaxIssues.length > 0 && trueMissing.length > 0) {
    return `Le template contient une balise invalide (${syntaxIssues.join(', ')}). Variables encore vides : ${trueMissing.join(', ')}`;
  }

  if (syntaxIssues.length > 0) {
    return `Le template contient une boucle ou une balise invalide : ${syntaxIssues.join(', ')}`;
  }

  if (trueMissing.length > 0) {
    return `Variables manquantes : ${trueMissing.join(', ')}`;
  }

  return fallbackMessage;
};

const formatContextLine = (summary = {}) => [
  summary?.bookTitle ? `Livre : ${summary.bookTitle}` : '',
  summary?.tone ? `Ton : ${summary.tone}` : '',
  summary?.eventType ? `Occasion : ${summary.eventType}` : '',
  summary?.chapterCount ? `${summary.chapterCount} chapitre${summary.chapterCount > 1 ? 's' : ''}` : ''
].filter(Boolean).join('   ');

const buildStatusLabel = (template = null) => {
  if (!template?.version) {
    return 'Version active';
  }

  if (template?.status === 'active') {
    return `Version active v${template.version}`;
  }

  return `Base ${template.status || 'brouillon'} v${template.version}`;
};

const BookPromptInlineAdmin = ({
  endpointBase = '',
  panelTitle = '',
  panelSubtitle = '',
  emptyResultLabel = 'Cliquez sur "Tester" pour voir le resultat ici',
  publishNotice = 'Cette version est maintenant active pour la creation.',
  resultMode = 'text',
  onPublished = null,
  className = ''
}) => {
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contextSummary, setContextSummary] = useState(null);
  const [availableVariables, setAvailableVariables] = useState([]);
  const [templateVariables, setTemplateVariables] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [directives, setDirectives] = useState('');
  const [initialDirectives, setInitialDirectives] = useState('');
  const [testedDirectives, setTestedDirectives] = useState('');
  const [resultText, setResultText] = useState('');
  const [validation, setValidation] = useState(null);
  const [missingVariables, setMissingVariables] = useState([]);

  const requestJson = useCallback(async (path, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      throw new Error('Session introuvable');
    }

    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const nextError = new Error(payload?.error || 'Erreur chargement prompt livre.');
      nextError.status = response.status;
      nextError.missingVariables = Array.isArray(payload?.missingVariables)
        ? payload.missingVariables
        : [];
      throw nextError;
    }

    return payload;
  }, []);

  const formatResultOutput = useCallback((resultPayload = {}) => {
    if (resultMode === 'titles') {
      const parsedTitles = Array.isArray(resultPayload?.parsedTitles) ? resultPayload.parsedTitles : [];
      if (parsedTitles.length > 0) {
        return parsedTitles.map((title, index) => `${index + 1}. ${title}`).join('\n');
      }
    }

    return String(resultPayload?.output || '').trim();
  }, [resultMode]);

  const loadPanel = useCallback(async () => {
    if (!endpointBase) {
      setAvailable(false);
      setLoading(false);
      return;
    }

    setAvailable(true);
    setLoading(true);
    setError('');

    try {
      const payload = await requestJson(endpointBase, { method: 'GET' });
      const nextDirectives = String(payload?.directives || '');
      setContextSummary(payload?.contextSummary || null);
      setAvailableVariables(Array.isArray(payload?.availableVariables) ? payload.availableVariables : []);
      setTemplateVariables(Array.isArray(payload?.templateVariables) ? payload.templateVariables : []);
      setActiveTemplate(payload?.activeTemplate || null);
      setDirectives(nextDirectives);
      setInitialDirectives(nextDirectives);
      setTestedDirectives('');
      setResultText('');
      setValidation(null);
      setMissingVariables([]);
    } catch (loadError) {
      if (Number(loadError?.status) === 403) {
        setAvailable(false);
        return;
      }
      const missing = Array.isArray(loadError?.missingVariables) ? loadError.missingVariables : [];
      setMissingVariables(missing);
      setError(buildPromptErrorMessage(loadError.message || 'Erreur chargement panneau prompt.', missing));
    } finally {
      setLoading(false);
    }
  }, [endpointBase, requestJson]);

  useEffect(() => {
    setNotice('');
    loadPanel();
  }, [loadPanel]);

  const normalizedDirectives = normalizeText(directives);
  const normalizedInitialDirectives = normalizeText(initialDirectives);
  const normalizedTestedDirectives = normalizeText(testedDirectives);
  const needsRetest = normalizedTestedDirectives !== normalizedDirectives;
  const { syntaxIssues, trueMissing } = useMemo(
    () => splitMissingItems(missingVariables),
    [missingVariables]
  );

  const sortedVariables = useMemo(() => {
    if (templateVariables.length > 0) {
      return [...templateVariables].sort((left, right) => (
        Number(Boolean(right?.required)) - Number(Boolean(left?.required))
        || Number(Boolean(right?.hasValue)) - Number(Boolean(left?.hasValue))
        || String(left?.name || '').localeCompare(String(right?.name || ''), 'fr')
      ));
    }

    return [...availableVariables]
      .sort((left, right) => left.localeCompare(right, 'fr'))
      .map((name) => ({
        name,
        required: false,
        hasValue: true,
        preview: ''
      }));
  }, [availableVariables, templateVariables]);

  const availableOnlyVariables = useMemo(() => {
    const usedNames = new Set(
      (Array.isArray(templateVariables) ? templateVariables : [])
        .map((item) => String(item?.name || '').trim())
        .filter(Boolean)
    );

    return [...availableVariables]
      .filter((name) => !usedNames.has(name))
      .sort((left, right) => left.localeCompare(right, 'fr'));
  }, [availableVariables, templateVariables]);

  const hasResult = Boolean(String(resultText || '').trim());
  const canPublish = !loading && !busyAction && hasResult && !needsRetest;

  const handleTest = async () => {
    if (!endpointBase) return;

    setBusyAction('test');
    setError('');
    setNotice('');
    setMissingVariables([]);

    try {
      const payload = await requestJson(`${endpointBase}/test`, {
        method: 'POST',
        body: JSON.stringify({ directives })
      });

      setContextSummary(payload?.contextSummary || null);
      setAvailableVariables(Array.isArray(payload?.availableVariables) ? payload.availableVariables : []);
      setTemplateVariables(Array.isArray(payload?.templateVariables) ? payload.templateVariables : []);
      setActiveTemplate(payload?.activeTemplate || null);
      setResultText(formatResultOutput(payload?.result || {}));
      setValidation(payload?.result?.validation || null);
      setTestedDirectives(directives);
      setMissingVariables([]);
      setNotice('Resultat mis a jour avec les donnees reelles du livre.');
    } catch (testError) {
      const missing = Array.isArray(testError?.missingVariables) ? testError.missingVariables : [];
      setMissingVariables(missing);
      setError(buildPromptErrorMessage(testError.message || 'Erreur test prompt livre.', missing));
    } finally {
      setBusyAction('');
    }
  };

  const handlePublish = async () => {
    if (!endpointBase || !canPublish) return;

    setBusyAction('publish');
    setError('');
    setNotice('');
    setMissingVariables([]);

    try {
      const payload = await requestJson(`${endpointBase}/publish`, {
        method: 'POST',
        body: JSON.stringify({ directives })
      });

      const nextDirectives = String(payload?.directives || directives || '');
      setActiveTemplate(payload?.activeTemplate || null);
      setContextSummary(payload?.contextSummary || contextSummary);
      setAvailableVariables(Array.isArray(payload?.availableVariables) ? payload.availableVariables : availableVariables);
      setTemplateVariables(Array.isArray(payload?.templateVariables) ? payload.templateVariables : templateVariables);
      setDirectives(nextDirectives);
      setInitialDirectives(nextDirectives);
      setTestedDirectives(nextDirectives);
      setMissingVariables([]);
      setNotice(publishNotice);

      if (typeof onPublished === 'function') {
        onPublished(payload);
      }
    } catch (publishError) {
      const missing = Array.isArray(publishError?.missingVariables) ? publishError.missingVariables : [];
      setMissingVariables(missing);
      setError(buildPromptErrorMessage(publishError.message || 'Erreur validation prompt livre.', missing));
    } finally {
      setBusyAction('');
    }
  };

  const handleReset = () => {
    setDirectives(initialDirectives);
    setTestedDirectives('');
    setResultText('');
    setValidation(null);
    setMissingVariables([]);
    setError('');
    setNotice('Le brouillon local a ete reinitialise.');
  };

  if (!endpointBase || !available) {
    return null;
  }

  return (
    <div className={`chapter-prompt-admin-panel ${className}`.trim()}>
      <div className="chapter-prompt-admin-header">
        <div>
          <h5 className="chapter-prompt-admin-title">{panelTitle}</h5>
          <p className="chapter-prompt-admin-subtitle">{panelSubtitle}</p>
        </div>
        <span className="chapter-prompt-admin-status">{buildStatusLabel(activeTemplate)}</span>
      </div>

      <div className="chapter-prompt-admin-context">
        {formatContextLine(contextSummary)}
      </div>

      <div className="chapter-prompt-admin-section">
        <div className="chapter-prompt-admin-label">Variables utilisees par ce prompt</div>
        <p className="chapter-prompt-admin-helper">
          <span className="chapter-prompt-admin-helper-legend is-required">*</span> attendue par le prompt
          {' · '}
          <span className="chapter-prompt-admin-helper-legend is-filled">bleu</span> = valeur disponible dans ce contexte
        </p>
        <div className="chapter-prompt-admin-variables">
          {sortedVariables.map((variableItem) => (
            <span
              key={variableItem.name}
              className={`chapter-prompt-admin-variable ${variableItem.required ? 'is-required' : ''} ${variableItem.hasValue ? 'is-filled' : 'is-empty'}`}
              title={variableItem.preview || variableItem.name}
            >
              {variableItem.required && <span className="chapter-prompt-admin-variable-mark">*</span>}
              {`{{${variableItem.name}}}`}
            </span>
          ))}
        </div>
      </div>

      <div className="chapter-prompt-admin-section">
        <div className="chapter-prompt-admin-label">Autres variables disponibles</div>
        <p className="chapter-prompt-admin-helper">
          Ces variables existent dans ce contexte, meme si le prompt ne les utilise pas encore.
        </p>
        <div className="chapter-prompt-admin-variables">
          {availableOnlyVariables.length > 0 ? availableOnlyVariables.map((name) => (
            <span
              key={name}
              className="chapter-prompt-admin-variable is-filled"
              title={name}
            >
              {`{{${name}}}`}
            </span>
          )) : (
            <span className="chapter-prompt-admin-helper">Aucune autre variable disponible.</span>
          )}
        </div>
      </div>

      <div className="chapter-prompt-admin-section">
        <div className="chapter-prompt-admin-label">Directives</div>
        <textarea
          className="input-luxe chapter-prompt-admin-textarea"
          value={directives}
          onChange={(event) => setDirectives(event.target.value)}
          placeholder="Ecrivez simplement ce que vous voulez obtenir. Exemple : une introduction sobre, en 2 paragraphes, sans annoncer la structure du livre."
        />
        <p className="chapter-prompt-admin-helper">
          Toutes les consignes utilisees pour ce test sont visibles ici. Aucune consigne cachee n est ajoutee pendant le test. Seules les donnees reelles du livre restent injectees en contexte.
        </p>
        {normalizedDirectives !== normalizedInitialDirectives && (
          <p className="chapter-prompt-admin-helper is-attention">
            Le test actuel ne correspond plus au brouillon local. Retestez avant de valider cette version.
          </p>
        )}
      </div>

      <div className="chapter-prompt-admin-section">
        <div className="chapter-prompt-admin-label">Resultat du test</div>
        {validation && (
          <div className="chapter-prompt-admin-meta">
            <span className={`chapter-prompt-admin-meta-chip ${validation?.isValid ? 'is-valid' : 'is-warning'}`}>
              {validation?.isValid ? 'Valide' : 'Ajustements conseilles'}
            </span>
            <span className="chapter-prompt-admin-meta-chip">{`${Number(validation?.wordCount || 0)} mots`}</span>
            {Array.isArray(validation?.warnings) && validation.warnings.length > 0 && (
              <span className="chapter-prompt-admin-meta-chip is-muted">{`${validation.warnings.length} alerte${validation.warnings.length > 1 ? 's' : ''}`}</span>
            )}
          </div>
        )}
        <div className={`chapter-prompt-admin-result ${hasResult ? '' : 'is-empty'}`}>
          {hasResult ? resultText : emptyResultLabel}
        </div>

        {error && (
          <div className="chapter-prompt-admin-issues">
            <div className="chapter-prompt-admin-label">Points a revoir</div>
            <ul className="chapter-prompt-admin-issue-list">
              <li>{error}</li>
            </ul>
          </div>
        )}

        {syntaxIssues.length > 0 && (
          <div className="chapter-prompt-admin-issues">
            <div className="chapter-prompt-admin-label">Structure du prompt a corriger</div>
            <p className="chapter-prompt-admin-helper">
              Ces balises doivent etre corrigees dans le template avant de retester.
            </p>
            <ul className="chapter-prompt-admin-issue-list">
              {syntaxIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {trueMissing.length > 0 && (
          <div className="chapter-prompt-admin-issues">
            <div className="chapter-prompt-admin-label">Variables a completer</div>
            <p className="chapter-prompt-admin-helper">
              Le prompt demande encore ces variables, mais elles sont vides dans ce livre.
            </p>
            <ul className="chapter-prompt-admin-issue-list">
              {trueMissing.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="chapter-prompt-admin-actions">
        <div className="chapter-prompt-admin-actions-left">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleTest}
            disabled={loading || busyAction === 'test'}
          >
            {busyAction === 'test' ? 'Test en cours...' : 'Tester avec les donnees reelles'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handlePublish}
            disabled={!canPublish || busyAction === 'publish'}
          >
            {busyAction === 'publish' ? 'Validation...' : 'Valider cette version'}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleReset}
          disabled={loading || busyAction === 'test' || busyAction === 'publish'}
        >
          Reinitialiser
        </button>
      </div>

      {notice && (
        <p className="chapter-prompt-admin-helper">{notice}</p>
      )}
    </div>
  );
};

export default BookPromptInlineAdmin;
