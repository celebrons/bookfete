import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import PromptTestingGuide from './PromptTestingGuide';
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
const VARIABLE_NAME_PATTERN = /^[a-zA-Z0-9_@.]+$/;
const DIRECTIVES_PLACEHOLDER = [
  'OBJECTIF',
  '- Expliquer ce que le rendu doit produire.',
  '',
  'OBLIGATOIRE',
  '- Les contraintes a respecter absolument.',
  '',
  'A EXCLURE',
  '- Ce qu il ne faut surtout pas faire.',
  '',
  'FORMAT ATTENDU',
  '- La forme finale attendue.'
].join('\n');


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

const normalizeVariableName = (value = '') => {
  const normalized = normalizeText(
    typeof value === 'string' ? value : value?.name
  );
  if (!normalized || normalized === '[object Object]') {
    return '';
  }
  if (!VARIABLE_NAME_PATTERN.test(normalized)) {
    return '';
  }
  return normalized;
};

const buildVariableFamilyKey = (name = '') => (
  normalizeVariableName(name).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
);

const choosePreferredVariableItem = (left = {}, right = {}) => {
  const leftName = normalizeVariableName(left?.name || left);
  const rightName = normalizeVariableName(right?.name || right);

  const scoreName = (name) => {
    let score = 0;
    if (name.includes('_')) score += 2;
    if (name === name.toLowerCase()) score += 1;
    if (name.includes('.')) score -= 1;
    return score;
  };

  const leftScore = scoreName(leftName);
  const rightScore = scoreName(rightName);

  if (rightScore !== leftScore) {
    return rightScore > leftScore ? right : left;
  }

  if (Boolean(right?.hasValue) !== Boolean(left?.hasValue)) {
    return right?.hasValue ? right : left;
  }

  return rightName.length < leftName.length ? right : left;
};

const normalizeVariableItems = (items = []) => {
  const byName = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const name = normalizeVariableName(item);
    if (!name) return;

    const existing = byName.get(name);
    const next = typeof item === 'string'
      ? {
          name,
          required: false,
          hasValue: true,
          preview: ''
        }
      : {
          name,
          required: Boolean(item?.required),
          hasValue: Boolean(item?.hasValue),
          preview: normalizeText(item?.preview)
        };

    if (!existing) {
      byName.set(name, next);
      return;
    }

    byName.set(name, {
      name,
      required: Boolean(existing.required || next.required),
      hasValue: Boolean(existing.hasValue || next.hasValue),
      preview: existing.preview || next.preview || ''
    });
  });

  return [...byName.values()];
};

const collapseVariableAliases = (items = []) => {
  const families = new Map();

  normalizeVariableItems(items).forEach((item) => {
    const familyKey = buildVariableFamilyKey(item?.name);
    if (!familyKey) return;

    const existing = families.get(familyKey);
    if (!existing) {
      families.set(familyKey, item);
      return;
    }

    families.set(familyKey, choosePreferredVariableItem(existing, item));
  });

  return [...families.values()];
};

const buildVariablePreviewText = (item = {}) => {
  if (normalizeText(item?.preview)) {
    return `Valeur actuelle : ${normalizeText(item.preview)}`;
  }
  return item?.hasValue ? 'Valeur disponible.' : 'Aucune valeur disponible';
};

const inferPanelTitleFromEndpoint = (endpointBase = '') => {
  const normalized = normalizeText(endpointBase).toLowerCase();
  if (normalized.includes('/prompt-admin/introduction')) {
    return 'Generation de l introduction';
  }
  if (normalized.includes('/prompt-admin/epilogue') || normalized.includes('/prompt-admin/conclusion')) {
    return 'Generation de l epilogue';
  }
  if (normalized.includes('/prompt-admin/chapter-titles')) {
    return 'Generation des titres de chapitres';
  }
  return 'Generation du chapitre';
};

const inferPanelSubtitleFromEndpoint = (endpointBase = '') => {
  const normalized = normalizeText(endpointBase).toLowerCase();
  if (normalized.includes('/prompt-admin/introduction')) {
    return 'Texte d ouverture du livre. Testez des directives simples ici, puis regenerez l apercu pour voir le rendu dans le livre.';
  }
  if (normalized.includes('/prompt-admin/epilogue') || normalized.includes('/prompt-admin/conclusion')) {
    return 'Texte de fermeture du livre. Le resultat apparait ici sans quitter l apercu.';
  }
  if (normalized.includes('/prompt-admin/chapter-titles')) {
    return 'Testez les directives du sommaire sans quitter la page, puis activez la version si le rendu convient.';
  }
  return 'Testez des directives simples sans quitter cette page, puis activez la version si le rendu convient.';
};

const copyTextToClipboard = async (text = '') => {
  const content = String(text || '');
  if (!content.trim()) {
    throw new Error('Aucun texte a copier.');
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
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
  const [availableVariableMeta, setAvailableVariableMeta] = useState([]);
  const [templateVariables, setTemplateVariables] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [directives, setDirectives] = useState('');
  const [initialDirectives, setInitialDirectives] = useState('');
  const [testedDirectives, setTestedDirectives] = useState('');
  const [resultText, setResultText] = useState('');
  const [validation, setValidation] = useState(null);
  const [missingVariables, setMissingVariables] = useState([]);
  const [compiledPromptText, setCompiledPromptText] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const resolvedPanelTitle = useMemo(
    () => normalizeText(panelTitle) || inferPanelTitleFromEndpoint(endpointBase),
    [panelTitle, endpointBase]
  );

  const resolvedPanelSubtitle = useMemo(
    () => normalizeText(panelSubtitle) || inferPanelSubtitleFromEndpoint(endpointBase),
    [panelSubtitle, endpointBase]
  );

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
      setAvailableVariableMeta(Array.isArray(payload?.availableVariableMeta) ? payload.availableVariableMeta : []);
      setTemplateVariables(Array.isArray(payload?.templateVariables) ? payload.templateVariables : []);
      setActiveTemplate(payload?.activeTemplate || null);
      setDirectives(nextDirectives);
      setInitialDirectives(nextDirectives);
      setTestedDirectives('');
      setResultText('');
      setCompiledPromptText('');
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
    const normalizedTemplateVariables = normalizeVariableItems(templateVariables);

    if (normalizedTemplateVariables.length > 0) {
      return collapseVariableAliases(normalizedTemplateVariables).sort((left, right) => (
        Number(Boolean(right?.required)) - Number(Boolean(left?.required))
        || Number(Boolean(right?.hasValue)) - Number(Boolean(left?.hasValue))
        || String(left?.name || '').localeCompare(String(right?.name || ''), 'fr')
      ));
    }

    return normalizeVariableItems([...availableVariables]
      .sort((left, right) => left.localeCompare(right, 'fr'))
      .map((name) => ({
        name,
        required: false,
        hasValue: true,
        preview: ''
      })));
  }, [availableVariables, templateVariables]);

  const availableOnlyVariables = useMemo(() => {
    const usedNames = new Set(
      collapseVariableAliases(templateVariables)
        .map((item) => buildVariableFamilyKey(item?.name))
        .filter(Boolean)
    );

    const metaSource = Array.isArray(availableVariableMeta) && availableVariableMeta.length > 0
      ? availableVariableMeta
      : [...availableVariables].map((name) => ({
          name,
          required: false,
          hasValue: true,
          preview: ''
        }));

    return collapseVariableAliases(metaSource)
      .filter((item) => !usedNames.has(buildVariableFamilyKey(item?.name)))
      .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'fr'));
  }, [availableVariableMeta, availableVariables, templateVariables]);

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
      setAvailableVariableMeta(Array.isArray(payload?.availableVariableMeta) ? payload.availableVariableMeta : []);
      setTemplateVariables(Array.isArray(payload?.templateVariables) ? payload.templateVariables : []);
      setActiveTemplate(payload?.activeTemplate || null);
      setResultText(formatResultOutput(payload?.result || {}));
      setCompiledPromptText(String(payload?.result?.compiledPrompt || '').trim());
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
      setAvailableVariableMeta(Array.isArray(payload?.availableVariableMeta) ? payload.availableVariableMeta : availableVariableMeta);
      setTemplateVariables(Array.isArray(payload?.templateVariables) ? payload.templateVariables : templateVariables);
      setDirectives(nextDirectives);
      setInitialDirectives(nextDirectives);
      setTestedDirectives(nextDirectives);
      setCompiledPromptText('');
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
    setCompiledPromptText('');
    setValidation(null);
    setMissingVariables([]);
    setError('');
    setNotice('Le brouillon local a ete reinitialise.');
  };

  if (!endpointBase || !available) {
    return null;
  }

  const handleCopy = async (mode = 'combined') => {
    try {
      setError('');
      const chunks = [];

      if (mode === 'input' || mode === 'combined') {
        chunks.push('[ENTREE DU PROMPT]');
        chunks.push(compiledPromptText || 'Aucune entree disponible.');
      }

      if (mode === 'output' || mode === 'combined') {
        chunks.push(mode === 'combined' ? '\n[SORTIE DU TEST]' : '[SORTIE DU TEST]');
        chunks.push(resultText || 'Aucune sortie disponible.');
      }

      await copyTextToClipboard(chunks.join('\n'));
      setNotice(
        mode === 'input'
          ? 'Entree du prompt copiee.'
          : mode === 'output'
            ? 'Sortie du test copiee.'
            : 'Entree et sortie copiees.'
      );
    } catch (copyError) {
      setError(copyError?.message || 'Impossible de copier le texte.');
    }
  };

  return (
    <div className={`chapter-prompt-admin-panel ${className}`.trim()}>
      <div className="chapter-prompt-admin-header">
        <div>
          <h5 className="chapter-prompt-admin-title">{resolvedPanelTitle}</h5>
          <p className="chapter-prompt-admin-subtitle">{resolvedPanelSubtitle}</p>
        </div>
        <div className="chapter-prompt-admin-header-actions">
          <span className="chapter-prompt-admin-status">{buildStatusLabel(activeTemplate)}</span>
          <button
            type="button"
            className="btn btn-ghost chapter-prompt-admin-toggle"
            onClick={() => setIsOpen((current) => !current)}
          >
            {isOpen ? 'Replier' : 'Deplier'}
          </button>
        </div>
      </div>

      <div className="chapter-prompt-admin-context">
        {formatContextLine(contextSummary)}
      </div>

      <PromptTestingGuide currentAreaLabel={resolvedPanelTitle} />

      {isOpen && (
        <>
      <div className="chapter-prompt-admin-section">
        <div className="chapter-prompt-admin-label">Variables utilisees par ce prompt</div>
        <p className="chapter-prompt-admin-helper">
          <span className="chapter-prompt-admin-helper-legend is-required">*</span> attendue par le prompt
          {' | '}
          <span className="chapter-prompt-admin-helper-legend is-filled">bleu</span> = valeur disponible dans ce contexte
        </p>
        <div className="chapter-prompt-admin-variables">
          {sortedVariables.map((variableItem) => (
            <span
              key={variableItem.name}
              className={`chapter-prompt-admin-variable ${variableItem.required ? 'is-required' : ''} ${variableItem.hasValue ? 'is-filled has-preview' : 'is-empty'}`}
              title={buildVariablePreviewText(variableItem)}
              data-preview={buildVariablePreviewText(variableItem)}
              tabIndex={0}
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
          {availableOnlyVariables.length > 0 ? availableOnlyVariables.map((item) => (
            <span
              key={item.name}
              className={`chapter-prompt-admin-variable ${item?.hasValue ? 'is-filled has-preview' : 'is-empty'}`}
              title={buildVariablePreviewText(item)}
              data-preview={buildVariablePreviewText(item)}
              tabIndex={0}
            >
              {`{{${item.name}}}`}
            </span>
          )) : (
            <span className="chapter-prompt-admin-helper">Aucune autre variable disponible.</span>
          )}
        </div>
      </div>

      <div className="chapter-prompt-admin-section">
        <div className="chapter-prompt-admin-label">Directives</div>
        <p className="chapter-prompt-admin-helper">
          Toutes les consignes utilisees pour ce test sont visibles ici. Vous pouvez les structurer librement avec OBJECTIF, OBLIGATOIRE, A EXCLURE et FORMAT ATTENDU si cela vous aide.
        </p>
        <textarea
          className="input-luxe chapter-prompt-admin-textarea"
          value={directives}
          onChange={(event) => setDirectives(event.target.value)}
          placeholder={DIRECTIVES_PLACEHOLDER}
          disabled={loading || busyAction !== ''}
        />
        {normalizedDirectives !== normalizedInitialDirectives && (
          <p className="chapter-prompt-admin-helper is-attention">
            Les directives ont change. Lancez un test avant de valider cette version.
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
        <div className="chapter-prompt-admin-copy-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => handleCopy('input')}
            disabled={!compiledPromptText || busyAction !== ''}
          >
            Copier l entree
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => handleCopy('combined')}
            disabled={!compiledPromptText || !hasResult || busyAction !== ''}
          >
            Copier entree + sortie
          </button>
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
        </>
      )}
    </div>
  );
};

export default BookPromptInlineAdmin;
