import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
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

const Step1Amorce = ({
  chapter,
  onUpdateChapter,
  user,
  book
}) => {
  const [amorceText, setAmorceText] = useState(chapter?.amorce_text || '');
  const [triggers, setTriggers] = useState(Array.isArray(chapter?.triggers) ? chapter.triggers : []);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(chapter?.amorce_text || '');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const isValidated = Boolean(chapter?.amorce_validated || chapter?.questions_validated);
  const isOrganizer = Boolean(user && book && user.id === book.owner_id);
  const chapterLocked = Boolean(chapter?.isChapterClosed);

  useEffect(() => {
    const nextText = chapter?.amorce_text || '';
    const nextTriggers = Array.isArray(chapter?.triggers) ? chapter.triggers : [];
    setAmorceText(nextText);
    setDraftText(nextText);
    setTriggers(nextTriggers);
  }, [chapter?.amorce_text, chapter?.triggers]);

  useEffect(() => {
    if (!chapterLocked) return;
    setIsEditing(false);
  }, [chapterLocked]);

  const persistAmorce = async (nextText, nextTriggers, extraUpdates = {}) => {
    if (typeof onUpdateChapter !== 'function') return;
    const cleanText = String(nextText || '').trim();
    const cleanTriggers = Array.isArray(nextTriggers)
      ? [...new Set(nextTriggers.map((trigger) => normalizeTrigger(trigger)).filter(Boolean))].slice(0, 4)
      : [];

    setSaving(true);
    setError('');
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
    } catch (saveError) {
      setError(saveError.message || 'Erreur lors de la mise a jour de l amorce.');
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
    if (isValidated) {
      const confirmed = window.confirm('Cette amorce est deja validee. La regenerer remplacera le texte actuel. Continuer ?');
      if (!confirmed) return;
    }

    setGenerating(true);
    setError('');
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
        throw new Error(payload?.error || 'Erreur lors de la generation de l amorce.');
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
    } catch (generationError) {
      setError(generationError.message || 'Erreur lors de la generation de l amorce.');
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
    try {
      await onUpdateChapter(chapter.id, {
        amorce_validated: true,
        questions_validated: true
      });
    } catch (validationError) {
      setError(validationError.message || 'Erreur lors de la validation.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTrigger = async (triggerToRemove) => {
    if (chapterLocked) return;
    const nextTriggers = triggers.filter((trigger) => trigger !== triggerToRemove);
    await persistAmorce(amorceText, nextTriggers);
  };

  const handleAddTrigger = async () => {
    if (chapterLocked) return;
    if (triggers.length >= 4) {
      setError('Maximum 4 mots declencheurs.');
      return;
    }
    const nextValue = window.prompt('Ajouter un mot-declencheur', '');
    const normalized = normalizeTrigger(nextValue);
    if (!normalized) return;
    await persistAmorce(amorceText, [...triggers, normalized]);
  };

  const handleEditBlur = async () => {
    const normalizedDraft = String(draftText || '').trim();
    if (normalizedDraft === String(amorceText || '').trim()) {
      setIsEditing(false);
      return;
    }
    await persistAmorce(normalizedDraft, triggers);
  };

  return (
    <div className="workflow-content">
      <div className={`amorce-section ${isValidated ? 'validated' : ''}`}>
        <div className="questions-header">
          <h3>Amorce du chapitre</h3>
        </div>

        {error ? (
          <div className="validated-message" style={{ background: '#fff4f2', borderColor: '#efc8bf', color: '#9d3d2f', marginBottom: 'var(--space-md)' }}>
            {error}
          </div>
        ) : null}

        <div className="amorce-meta-copy">
          <span className="label-gold">Amorce generee</span>
          <p className="amorce-subcopy">Cette phrase s affiche aux contributeurs a la place des questions.</p>
        </div>

        <div className="amorce-callout">
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

        <div className="amorce-trigger-block">
          <div className="amorce-trigger-label">Mots-declencheurs affiches aux contributeurs</div>
          <div className="amorce-trigger-row">
            {triggers.map((trigger) => (
              <span key={trigger} className="amorce-trigger-pill">
                <span>{trigger}</span>
                {!chapterLocked ? (
                  <button
                    type="button"
                    className="amorce-trigger-remove"
                    onClick={() => handleRemoveTrigger(trigger)}
                    aria-label={`Supprimer ${trigger}`}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {!chapterLocked && triggers.length < 4 ? (
              <button
                type="button"
                className="amorce-trigger-pill amorce-trigger-pill-add"
                onClick={handleAddTrigger}
              >
                + Ajouter
              </button>
            ) : null}
          </div>
        </div>

        <div className="amorce-info-card">
          Ce que voient les contributeurs : la phrase ci-dessus en italique, un champ texte libre, les mots-declencheurs en bas, et la possibilite d ajouter une photo. Aucune question numerotee.
        </div>

        {chapterLocked ? (
          <div className="validated-message" style={{ background: 'rgba(255, 255, 255, 0.72)', color: 'var(--text-light)' }}>
            Chapitre verrouille: la validation finale bloque toute modification des etapes.
          </div>
        ) : null}

        {isOrganizer && !chapterLocked ? (
          <div className="questions-actions">
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
                setDraftText(amorceText);
                setIsEditing(true);
              }}
              disabled={saving}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={handleValidate}
              disabled={saving || generating}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              Valider
            </button>
          </div>
        ) : null}

        {!isOrganizer && !chapterLocked ? (
          <div className="validated-message" style={{ background: 'rgba(255, 255, 255, 0.72)', color: 'var(--text-light)' }}>
            Seul l organisateur peut modifier l amorce.
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Step1Amorce;
