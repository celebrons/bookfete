import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ChapterPromptInlineAdmin from './ChapterPromptInlineAdmin';
import '../BookLuxe.css';

const getApiBaseUrl = () => {
  const envBase = String(process.env.REACT_APP_API_URL || '').trim();
  if (envBase) {
    const trimmed = envBase.replace(/\/$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  return 'http://localhost:5001/api';
};

const normalizeTrigger = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const getFriendlyAmorceError = (error) => {
  const rawMessage = String(error?.message || error || '').trim();
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('service_tier_capacity_exceeded')
    || normalized.includes('capacity exceeded')
    || normalized.includes('status 429')
    || normalized.includes('"code":"3505"')
    || normalized.includes('code 3505')
  ) {
    return 'Le service de generation est temporairement surcharge. Reessayez dans quelques instants.';
  }

  if (normalized.includes('session introuvable')) {
    return 'Votre session semble expiree. Rechargez la page puis reconnectez-vous.';
  }

  return rawMessage || "Erreur lors de la generation de l amorce.";
};

const Step1Amorce = ({
  chapter,
  onUpdateChapter,
  user,
  book,
  embedded = false,
  editorialMode = false
}) => {
  const [amorceText, setAmorceText] = useState(chapter?.amorce_text || '');
  const [triggers, setTriggers] = useState(Array.isArray(chapter?.triggers) ? chapter.triggers : []);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(chapter?.amorce_text || '');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showContributorPreview, setShowContributorPreview] = useState(false);
  const [hasPendingSensitiveEdit, setHasPendingSensitiveEdit] = useState(false);
  const [showAddTriggerInput, setShowAddTriggerInput] = useState(false);
  const [newTriggerValue, setNewTriggerValue] = useState('');

  const isValidated = Boolean(chapter?.amorce_validated || chapter?.questions_validated);
  const isOrganizer = Boolean(user && book && user.id === book.owner_id);
  const chapterLocked = Boolean(chapter?.isChapterClosed || chapter?.contributionsClosed);
  const hasEditorialDraft = Boolean(
    chapter?.contributionsClosed
    || chapter?.chapterDraft?.status
    || Number(chapter?.chapterDraft?.generationCount || 0) > 0
    || String(chapter?.chapterDraft?.html || '').trim()
  );

  useEffect(() => {
    const nextText = chapter?.amorce_text || '';
    const nextTriggers = Array.isArray(chapter?.triggers) ? chapter.triggers : [];
    setAmorceText(nextText);
    setDraftText(nextText);
    setTriggers(nextTriggers);
    setNotice('');
    setHasPendingSensitiveEdit(false);
    setShowAddTriggerInput(false);
    setNewTriggerValue('');
  }, [chapter?.amorce_text, chapter?.triggers]);

  useEffect(() => {
    if (!chapterLocked) {
      return;
    }

    setIsEditing(false);
    setHasPendingSensitiveEdit(false);
    setShowAddTriggerInput(false);
  }, [chapterLocked]);

  const confirmSensitiveEdit = ({ forEditingSession = false } = {}) => {
    if (!hasEditorialDraft || chapterLocked) {
      return true;
    }

    if (forEditingSession && hasPendingSensitiveEdit) {
      return true;
    }

    const confirmed = window.confirm(
      "Modifier l inspiration peut impacter la coherence des recits deja recus. Voulez-vous continuer ?"
    );

    if (confirmed && forEditingSession) {
      setHasPendingSensitiveEdit(true);
    }

    return confirmed;
  };

  const persistAmorce = async (nextText, nextTriggers, extraUpdates = {}) => {
    if (typeof onUpdateChapter !== 'function') {
      return;
    }

    const cleanText = String(nextText || '').trim();
    const cleanTriggers = Array.isArray(nextTriggers)
      ? [...new Set(nextTriggers.map((trigger) => normalizeTrigger(trigger)).filter(Boolean))].slice(0, 4)
      : [];

    setSaving(true);
    setError('');
    setNotice('');

    try {
      await onUpdateChapter(chapter.id, {
        amorce_text: cleanText || null,
        triggers: cleanTriggers,
        amorce_generated_at: null,
        amorce_validated: false,
        questions_validated: false,
        ...extraUpdates
      });
      setAmorceText(cleanText);
      setDraftText(cleanText);
      setTriggers(cleanTriggers);
      setIsEditing(false);
      setHasPendingSensitiveEdit(false);

      if (hasEditorialDraft) {
        setNotice('Inspiration mise a jour. Le chapitre repasse en revision avant la finalisation.');
      }
    } catch (saveError) {
      setError(saveError.message || "Erreur lors de la mise a jour de l amorce.");
      throw saveError;
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    if (!confirmSensitiveEdit()) {
      return;
    }

    if (isValidated) {
      const confirmed = window.confirm('Cette amorce est deja marquee comme prete. La regenerer remplacera le texte actuel. Continuer ?');
      if (!confirmed) {
        return;
      }
    }

    setGenerating(true);
    setError('');
    setNotice('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/chapters/${chapter.id}/generate-amorce`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ force: isValidated })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Erreur lors de la generation de l amorce.");
      }

      const nextText = payload?.chapter?.amorce_text || payload?.amorce || '';
      const nextTriggers = Array.isArray(payload?.chapter?.triggers)
        ? payload.chapter.triggers
        : (Array.isArray(payload?.triggers) ? payload.triggers : []);

      setAmorceText(nextText);
      setDraftText(nextText);
      setTriggers(nextTriggers);

      if (typeof onUpdateChapter === 'function') {
        await onUpdateChapter(chapter.id, {
          amorce_text: nextText || null,
          triggers: nextTriggers,
          amorce_generated_at: payload?.chapter?.amorce_generated_at || new Date().toISOString(),
          amorce_validated: false,
          questions_validated: false
        });
      }

      if (hasEditorialDraft) {
        setNotice('Nouvelle inspiration enregistree. Pensez a la marquer de nouveau comme prete.');
      }
    } catch (generationError) {
      setError(getFriendlyAmorceError(generationError));
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async () => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    if (!amorceText.trim()) {
      setError('Generez ou saisissez d abord une amorce.');
      return;
    }

    if (triggers.length < 3) {
      setError('Ajoutez au moins 3 mots declencheurs.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      await onUpdateChapter(chapter.id, {
        amorce_validated: true,
        questions_validated: true
      });
      setNotice('Inspiration marquee comme prete.');
    } catch (validationError) {
      setError(validationError.message || 'Erreur lors de la validation.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTrigger = async (triggerToRemove) => {
    if (chapterLocked) {
      return;
    }

    if (!confirmSensitiveEdit()) {
      return;
    }

    const nextTriggers = triggers.filter((trigger) => trigger !== triggerToRemove);
    await persistAmorce(amorceText, nextTriggers);
  };

  const handleAddTrigger = async () => {
    if (chapterLocked) {
      return;
    }

    if (!confirmSensitiveEdit()) {
      return;
    }

    if (triggers.length >= 4) {
      setError('Maximum 4 mots declencheurs.');
      return;
    }
    setError('');
    setShowAddTriggerInput(true);
    setNewTriggerValue('');
  };

  const handleTriggerContextMenu = async (event, trigger) => {
    if (!editorialMode || chapterLocked) {
      return;
    }

    event.preventDefault();
    await handleRemoveTrigger(trigger);
  };

  const handleEditBlur = async () => {
    const normalizedDraft = String(draftText || '').trim();
    if (normalizedDraft === String(amorceText || '').trim()) {
      setIsEditing(false);
      setHasPendingSensitiveEdit(false);
      return;
    }

    if (!confirmSensitiveEdit()) {
      setDraftText(amorceText);
      setIsEditing(false);
      setHasPendingSensitiveEdit(false);
      return;
    }

    await persistAmorce(normalizedDraft, triggers);
  };

  const handleConfirmAddTrigger = async () => {
    const normalized = normalizeTrigger(newTriggerValue);
    if (!normalized) {
      setError('Saisissez un mot-cle avant de valider.');
      return;
    }

    await persistAmorce(amorceText, [...triggers, normalized]);
    setShowAddTriggerInput(false);
    setNewTriggerValue('');
  };

  const handleCancelAddTrigger = () => {
    setShowAddTriggerInput(false);
    setNewTriggerValue('');
    setError('');
  };

  const content = (
    <>
      <div className={`amorce-section ${isValidated ? 'validated' : ''} ${editorialMode ? 'is-editorial' : ''}`}>
        {!editorialMode ? (
          <div className="questions-header">
            <h3>Amorce du chapitre</h3>
          </div>
        ) : null}

        <div className={`amorce-feedback-slot ${editorialMode ? 'is-editorial' : ''}`} aria-live="polite">
          {notice ? (
            <div className="luxe-feedback-banner is-success">{notice}</div>
          ) : null}

          {!notice && error ? (
            <div className="luxe-feedback-banner is-error amorce-feedback-banner">
              {error}
            </div>
          ) : null}
        </div>

        <div className={`amorce-meta-copy ${editorialMode ? 'is-editorial' : ''}`}>
          <span className="label-gold">{editorialMode ? 'Amorce' : 'Amorce generee'}</span>
        </div>

        <div className={`amorce-callout ${editorialMode ? 'is-editorial' : ''}`}>
          {isEditing ? (
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              onBlur={handleEditBlur}
              className="input-luxe amorce-textarea"
              autoFocus
              disabled={saving}
            />
          ) : (
            <button
              type="button"
              className="amorce-inline-button"
              onClick={() => {
                if (chapterLocked) return;
                if (!confirmSensitiveEdit({ forEditingSession: true })) return;
                setDraftText(amorceText);
                setIsEditing(true);
              }}
            >
              <span className="amorce-display-text">
                {amorceText || 'Aucune amorce pour le moment. Utilisez Regenerer pour proposer une premiere phrase.'}
              </span>
            </button>
          )}
        </div>

        <button
          type="button"
          className="amorce-preview-launcher"
          onClick={() => setShowContributorPreview(true)}
        >
          <span className="amorce-preview-launcher-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 5c5.4 0 9.6 5.1 10.5 6.4a1 1 0 0 1 0 1.2C21.6 13.9 17.4 19 12 19S2.4 13.9 1.5 12.6a1 1 0 0 1 0-1.2C2.4 10.1 6.6 5 12 5Zm0 2c-3.8 0-7 3.4-8.3 5 1.3 1.6 4.5 5 8.3 5s7-3.4 8.3-5C19 10.4 15.8 7 12 7Zm0 1.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Zm0 2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" fill="currentColor" />
            </svg>
          </span>
          <span>Voir l apercu contributeur</span>
        </button>

        <div className="amorce-trigger-block">
          <div className="amorce-trigger-label">Mots-cles de guidage</div>
          <div className="amorce-trigger-row">
            {triggers.map((trigger) => (
              editorialMode ? (
                <button
                  key={trigger}
                  type="button"
                  className="amorce-trigger-pill is-editorial"
                  onClick={() => handleRemoveTrigger(trigger)}
                  onContextMenu={(event) => handleTriggerContextMenu(event, trigger)}
                  disabled={chapterLocked}
                  title={chapterLocked ? trigger : `${trigger} - cliquer pour retirer`}
                >
                  <span>{trigger}</span>
                </button>
              ) : (
                <span key={trigger} className="amorce-trigger-pill">
                  <span>{trigger}</span>
                  {!chapterLocked ? (
                    <button
                      type="button"
                      className="amorce-trigger-remove"
                      onClick={() => handleRemoveTrigger(trigger)}
                      aria-label={`Supprimer ${trigger}`}
                    >
                      x
                    </button>
                  ) : null}
                </span>
              )
            ))}
            {!chapterLocked && triggers.length < 4 ? (
              <button
                type="button"
                className={`amorce-trigger-pill amorce-trigger-pill-add ${editorialMode ? 'is-editorial' : ''}`}
                onClick={handleAddTrigger}
              >
                + Ajouter
              </button>
            ) : null}
          </div>
          {showAddTriggerInput && !chapterLocked ? (
            <div className="amorce-trigger-inline-editor">
              <input
                type="text"
                value={newTriggerValue}
                onChange={(event) => setNewTriggerValue(event.target.value)}
                className="input-luxe amorce-trigger-inline-input"
                placeholder="Ajouter un mot-cle"
                autoFocus
                maxLength={60}
              />
              <div className="amorce-trigger-inline-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCancelAddTrigger}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmAddTrigger}
                >
                  Ajouter
                </button>
              </div>
            </div>
          ) : null}
          {!chapterLocked ? (
            <div className="amorce-trigger-helper">
              Cliquez sur un mot-cle pour le retirer, ou ajoutez-en un nouveau.
            </div>
          ) : null}
        </div>

        {chapterLocked ? (
          <div className="validated-message" style={{ background: 'rgba(255, 255, 255, 0.72)', color: 'var(--text-light)' }}>
            L inspiration est maintenant figee pour la finalisation.
          </div>
        ) : null}

        {isOrganizer && !chapterLocked ? (
          <div className={`questions-actions ${editorialMode ? 'is-editorial is-two' : ''}`}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || saving}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              {generating ? 'Generation...' : 'Regenerer'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmSensitiveEdit({ forEditingSession: true })) return;
                setDraftText(amorceText);
                setIsEditing(true);
              }}
              disabled={saving}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              Modifier
            </button>
            {editorialMode ? (
              <button
                type="button"
                onClick={handleValidate}
                disabled={saving || generating}
                className="chapter-editor-hidden-action"
                data-workflow-action="validate-amorce"
                aria-hidden="true"
                tabIndex={-1}
              >
                Marquer comme pret
              </button>
            ) : null}
            {!editorialMode ? (
              <button
                type="button"
                onClick={handleValidate}
                disabled={saving || generating}
                className="btn btn-primary"
                data-workflow-action="validate-amorce"
                style={{ flex: 1 }}
              >
                Marquer comme pret
              </button>
            ) : null}
          </div>
        ) : null}

        {editorialMode ? (
          <ChapterPromptInlineAdmin
            chapter={chapter}
            endpointBase={`/chapters/${chapter.id}/prompt-admin/chapter-amorce`}
            panelTitle="Generation de l amorce"
            panelSubtitle="Testez ici la phrase d amorce et les mots-cles du chapitre, puis activez la version si le rendu convient."
            currentAreaLabel="Generation de l amorce"
            collapsedCtaLabel="Tester le prompt d amorce"
            emptyResultLabel={'Cliquez sur "Tester" pour voir une proposition d amorce ici.'}
            loadErrorLabel="Erreur chargement panneau prompt amorce."
            testErrorLabel="Erreur test prompt amorce."
            publishErrorLabel="Erreur validation prompt amorce."
            testSuccessLabel="Resultat mis a jour avec les donnees reelles de l amorce."
            publishSuccessLabel="Cette version est maintenant active pour la creation de l amorce."
          />
        ) : null}

        {!isOrganizer && !chapterLocked ? (
          <div className="validated-message" style={{ background: 'rgba(255, 255, 255, 0.72)', color: 'var(--text-light)' }}>
            Seul l organisateur peut modifier l inspiration.
          </div>
        ) : null}
      </div>

      {showContributorPreview ? (
        <div className="modal-overlay" onClick={() => setShowContributorPreview(false)}>
          <div
            className="modal-content contributor-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="contributor-preview-modal-header">
              <div>
                <div className="label-gold">Apercu contributeur</div>
                <h3 className="contributor-preview-modal-title">
                  {chapter?.order_index === 0 ? 'Introduction' : (chapter?.title || 'Chapitre')}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowContributorPreview(false)}
              >
                x
              </button>
            </div>

            <div className="contributor-preview-modal-body">
              <div className="amorce-callout contributor-preview-callout is-editorial">
                <span className="amorce-display-text">
                  {amorceText || 'Aucune amorce pour le moment. Les contributeurs verront ici la phrase d ouverture du chapitre.'}
                </span>
              </div>

              {triggers.length > 0 ? (
                <div className="amorce-trigger-block contributor-preview-trigger-block">
                  <div className="amorce-trigger-label">Mots-cles</div>
                  <div className="amorce-trigger-row">
                    {triggers.map((trigger) => (
                      <span key={trigger} className="amorce-trigger-pill is-editorial">
                        <span>{trigger}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="contributor-preview-field">
                <label className="chapter-prompt-admin-label">Espace de reponse</label>
                <textarea
                  className="input-luxe contributor-preview-textarea"
                  readOnly
                  value=""
                  placeholder="Continuez a votre facon - une phrase, un paragraphe, tout est bienvenu."
                />
                <div className="contributor-preview-count">0 caractere</div>
              </div>

              <button
                type="button"
                className="btn btn-outline contributor-preview-photo-btn"
                disabled
              >
                Ajouter une photo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="workflow-content">
      {content}
    </div>
  );
};

export default Step1Amorce;
