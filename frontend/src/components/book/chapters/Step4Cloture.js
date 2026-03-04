import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import '../BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';

const Step4Cloture = ({
  chapter,
  user,
  book,
  questionsValidated,
  hasContributed,
  invitations,
  onGenerateChapterDraft,
  onSaveChapterDraft,
  onFinalizeChapterDraft
}) => {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [editorHtml, setEditorHtml] = useState(chapter?.chapterDraft?.html || '');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

  const isOrganizer = user && book && user.id === book.owner_id;
  const isSoloMode = Boolean(book?.cover_config?.soloMode);
  const contributionsClosed = chapter?.contributionsClosed || false;
  const generationUnlocked = isSoloMode || contributionsClosed;
  const chapterDraft = chapter?.chapterDraft || null;
  const draftStatus = chapterDraft?.status || 'idle';
  const isDraftValidated = draftStatus === 'validated';
  const generationCount = Number(chapterDraft?.generationCount || 0);
  const maxGenerations = Number(chapterDraft?.maxGenerations || 3);
  const remainingGenerations = Math.max(0, maxGenerations - generationCount);
  const questionsReady = Boolean(chapter?.questions_validated ?? questionsValidated);
  const contributionReady = Boolean(chapter?.hasContributed ?? hasContributed);
  const fallbackVisibleContributions = Array.isArray(chapter?.contributions)
    ? chapter.contributions.filter(
        (contribution) =>
          contribution.contributor_email !== user?.email &&
          contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
          contribution.contributor_email !== CHAPTER_DRAFT_EMAIL &&
          contribution.is_finalized !== false
      )
    : [];
  const fallbackInvitationsCount = typeof chapter?.invitationsCount === 'number'
    ? chapter.invitationsCount
    : (
        Array.isArray(chapter?.chapter_invites)
          ? chapter.chapter_invites.length
          : (Array.isArray(invitations) ? invitations.length : 0)
      );
  const invitationsCount = typeof summary?.invitationsCount === 'number'
    ? summary.invitationsCount
    : fallbackInvitationsCount;
  const invitationsReady = invitationsCount > 0;
  const visibleContributionsCount = typeof summary?.receivedCount === 'number'
    ? summary.receivedCount
    : fallbackVisibleContributions.length;
  const pendingValidationCount = typeof summary?.pendingValidationCount === 'number'
    ? summary.pendingValidationCount
    : fallbackVisibleContributions.filter(
        (contribution) => !contribution.approved && !contribution.needs_revision
      ).length;
  const normalizedHtml = (editorHtml || '').trim();
  const canGenerateWithAI = !isDraftValidated && generationUnlocked && remainingGenerations > 0;
  const canSaveRevision = !isDraftValidated && Boolean(normalizedHtml);
  const canFinalize = !isDraftValidated && generationUnlocked && Boolean(normalizedHtml);
  const latestDraftTimestamp =
    chapterDraft?.finalizedAt ||
    chapterDraft?.lastEditedAt ||
    chapterDraft?.lastGeneratedAt ||
    null;
  const summaryCards = [
    {
      label: 'Questions',
      value: questionsReady ? 'Validees' : 'A finaliser',
      tone: questionsReady ? 'ok' : 'pending'
    },
    {
      label: 'Votre contribution',
      value: contributionReady ? 'Prete' : 'A completer',
      tone: contributionReady ? 'ok' : 'pending'
    },
    !isSoloMode ? {
      label: 'Invitations',
      value: `${invitationsCount} envoyee(s)`,
      tone: invitationsReady ? 'ok' : 'pending'
    } : null,
    !isSoloMode ? {
      label: 'Contributions recues',
      value: `${visibleContributionsCount} retenue(s)`,
      tone: visibleContributionsCount > 0 ? 'ok' : 'pending'
    } : null,
    !isSoloMode ? {
      label: 'A valider',
      value: `${pendingValidationCount} en attente`,
      tone: pendingValidationCount === 0 ? 'ok' : 'pending'
    } : null,
    !isSoloMode ? {
      label: 'Flux contributeurs',
      value: contributionsClosed ? 'Clos' : 'Ouvert',
      tone: contributionsClosed ? 'ok' : 'pending'
    } : null,
    {
      label: 'Brouillon',
      value: isDraftValidated ? 'Valide' : (chapterDraft ? 'En cours' : 'A generer'),
      tone: isDraftValidated ? 'ok' : (chapterDraft ? 'active' : 'pending')
    }
  ].filter(Boolean);

  useEffect(() => {
    setEditorHtml(chapter?.chapterDraft?.html || '');
    setError('');
    setNotice('');
    setShowPreviewModal(false);
    setShowEditorModal(false);
    setShowFinalizeConfirm(false);
  }, [chapter?.id, chapter?.chapterDraft?.html, chapter?.chapterDraft?.status]);

  useEffect(() => {
    const loadSummary = async () => {
      if (!chapter?.id) {
        setSummary(null);
        return;
      }

      try {
        const [{ data: invitesData, error: invitesError }, { data: contributionsData, error: contributionsError }] = await Promise.all([
          supabase
            .from('chapter_invites')
            .select('accepted, contributed')
            .eq('chapter_id', chapter.id),
          supabase
            .from('contributions')
            .select('contributor_email, approved, needs_revision, is_finalized')
            .eq('chapter_id', chapter.id)
        ]);

        if (invitesError) throw invitesError;
        if (contributionsError) throw contributionsError;

        const externalContributions = (contributionsData || []).filter(
          (contribution) =>
            contribution.contributor_email !== user?.email &&
            contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
            contribution.contributor_email !== CHAPTER_DRAFT_EMAIL &&
            contribution.is_finalized !== false
        );
        const respondedInvitesCount = (invitesData || []).filter(
          (invite) => invite.accepted || invite.contributed
        ).length;

        setSummary({
          invitationsCount: (invitesData || []).length,
          receivedCount: Math.max(externalContributions.length, respondedInvitesCount),
          pendingValidationCount: externalContributions.filter(
            (contribution) => !contribution.approved && !contribution.needs_revision
          ).length
        });
      } catch (loadError) {
        console.error('Erreur chargement recap chapitre:', loadError);
        setSummary(null);
      }
    };

    loadSummary();
  }, [chapter?.id, chapter?.workflowState, chapter?.chapterDraft?.status, user?.email]);

  const handleGenerate = async () => {
    if (!generationUnlocked) {
      setError('Fermez d abord les contributions avant de generer le brouillon de ce chapitre.');
      return;
    }

    if (typeof onGenerateChapterDraft !== 'function') {
      setError('La generation du chapitre est indisponible.');
      return;
    }

    setBusyAction('generate');
    setError('');
    setNotice('');

    try {
      const result = await onGenerateChapterDraft(chapter.id);
      if (result?.draft?.html) {
        setEditorHtml(result.draft.html);
      }
      setNotice('Brouillon de chapitre genere. Vous pouvez maintenant le relire et le reviser.');
    } catch (generationError) {
      setError(generationError.message || 'Erreur lors de la generation du chapitre.');
    } finally {
      setBusyAction('');
    }
  };

  const handleSaveRevision = async () => {
    if (!normalizedHtml) {
      setError('Aucun HTML a enregistrer pour ce chapitre.');
      return;
    }

    if (typeof onSaveChapterDraft !== 'function') {
      setError('La revision du chapitre est indisponible.');
      return;
    }

    setBusyAction('save');
    setError('');
    setNotice('');

    try {
      const result = await onSaveChapterDraft(chapter.id, normalizedHtml);
      if (result?.draft?.html) {
        setEditorHtml(result.draft.html);
      }
      setNotice('Revision enregistree.');
    } catch (saveError) {
      setError(saveError.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setBusyAction('');
    }
  };

  const requestFinalize = () => {
    if (!generationUnlocked) {
      setError('Fermez d abord les contributions avant la validation finale.');
      return;
    }

    if (!normalizedHtml) {
      setError('Generez ou revisez le brouillon avant la validation finale.');
      return;
    }

    if (typeof onFinalizeChapterDraft !== 'function') {
      setError('La validation finale est indisponible.');
      return;
    }

    setError('');
    setNotice('');
    setShowFinalizeConfirm(true);
  };

  const handleFinalize = async () => {
    setBusyAction('finalize');
    setError('');
    setNotice('');

    try {
      const result = await onFinalizeChapterDraft(chapter.id, normalizedHtml);
      if (result?.draft?.html) {
        setEditorHtml(result.draft.html);
      }
      setNotice('Le chapitre a ete valide definitivement et ferme.');
    } catch (finalizeError) {
      setError(finalizeError.message || 'Erreur lors de la validation finale.');
    } finally {
      setBusyAction('');
      setShowFinalizeConfirm(false);
    }
  };

  const handleRestoreSavedVersion = () => {
    if (!chapterDraft?.html) {
      setError('Aucune version enregistree a restaurer pour ce chapitre.');
      return;
    }

    setEditorHtml(chapterDraft.html);
    setError('');
    setNotice('La derniere version enregistree a ete restauree dans l editeur.');
  };

  if (!isOrganizer) {
    return (
      <div className="workflow-content" style={{ textAlign: 'center', color: '#999' }}>
        Seul l organisateur peut finaliser le chapitre.
      </div>
    );
  }

  return (
    <div className="workflow-content">
      {error && (
        <div className="luxe-feedback-banner is-error">{error}</div>
      )}

      {notice && (
        <div className="luxe-feedback-banner is-success">{notice}</div>
      )}

      <div
        className="card"
        style={{
          marginBottom: 'var(--space-lg)',
          background: isDraftValidated ? '#e9f7ef' : '#fcfbf8',
          borderColor: isDraftValidated ? '#d9eadf' : 'var(--mist)'
        }}
      >
        <p style={{ margin: 0, color: 'var(--ink)' }}>
          {isDraftValidated
            ? 'Le chapitre est valide definitivement. Le contenu ne peut plus etre modifie.'
            : 'Generez un brouillon HTML de 4 pages, ajustez-le si besoin puis validez-le definitivement.'}
        </p>
      </div>

      <div className="chapter-draft-summary-grid">
        {summaryCards.map((item) => (
          <div
            key={item.label}
            className={`chapter-draft-summary-card is-${item.tone}`}
          >
            <div className="chapter-draft-summary-label">{item.label}</div>
            <div className="chapter-draft-summary-value">{item.value}</div>
          </div>
        ))}
      </div>

      {!generationUnlocked && (
        <div className="card chapter-draft-warning-card">
          Fermez d abord les contributions a l etape 3. Les commentaires non valides ne sont jamais pris en compte
          dans cette generation.
        </div>
      )}

      <div className="card chapter-draft-workbench-card">
        <div className="chapter-draft-workbench-header">
          <div>
            <h4 className="chapter-draft-workbench-title">Atelier du chapitre</h4>
            <p className="chapter-draft-workbench-subtitle">
              4 pages HTML minimum. Regeneration IA limitee a 3 essais, puis revision manuelle et validation finale.
            </p>
          </div>
          <div className="chapter-draft-chip-row">
            <span className={`chapter-draft-chip ${isDraftValidated ? 'is-success' : 'is-neutral'}`}>
              {isDraftValidated ? 'Version finale verrouillee' : (chapterDraft ? 'Brouillon modifiable' : 'A generer')}
            </span>
            <span className="chapter-draft-chip is-gold">
              IA {generationCount}/{maxGenerations}
            </span>
            {latestDraftTimestamp && (
              <span className="chapter-draft-chip is-muted">
                Maj {new Date(latestDraftTimestamp).toLocaleString('fr-FR')}
              </span>
            )}
          </div>
        </div>

        <div className="chapter-draft-action-row">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleGenerate}
            disabled={!canGenerateWithAI || busyAction !== ''}
          >
            {busyAction === 'generate'
              ? 'Generation...'
              : (generationCount > 0 ? 'Regenerer avec IA' : 'Generer ce chapitre')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={requestFinalize}
            disabled={!canFinalize || busyAction !== ''}
          >
            {busyAction === 'finalize' ? 'Validation...' : 'Validation finale'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowEditorModal(true)}
            disabled={isDraftValidated ? !normalizedHtml : false}
          >
            Modifier le chapitre
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowPreviewModal(true)}
            disabled={!normalizedHtml}
          >
            Voir l apercu
          </button>
        </div>

        {chapterDraft?.summary && (
          <div className="chapter-draft-summary-callout">
            <div className="label-gold">Resume retenu pour le chapitre suivant</div>
            <p style={{ margin: '8px 0 0', color: 'var(--ink)' }}>{chapterDraft.summary}</p>
          </div>
        )}

        <div className="chapter-draft-summary-card is-active" style={{ marginTop: 'var(--space-sm)' }}>
          <div className="chapter-draft-summary-label">Utilisation</div>
          <div className="chapter-draft-summary-value" style={{ fontSize: '14px', fontWeight: '500' }}>
            Le brouillon se travaille maintenant via le bouton "Modifier le chapitre", puis se relit dans "Voir l apercu".
          </div>
        </div>
      </div>

      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div
            className="modal-content book-draft-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="book-draft-modal-header">
              <div>
                <div className="label-gold">Grand apercu du chapitre</div>
                <h3 className="book-draft-modal-title">
                  {chapter?.order_index === 0 ? 'Introduction' : chapter?.title}
                </h3>
                <div className="book-draft-modal-meta">
                  Version {isDraftValidated ? 'finale' : 'de travail'} | 4 pages minimum
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowPreviewModal(false)}
              >
                x
              </button>
            </div>

            <div className="book-draft-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowPreviewModal(false)}
              >
                Fermer
              </button>
            </div>

            <div className="book-draft-preview">
              {normalizedHtml ? (
                <div dangerouslySetInnerHTML={{ __html: normalizedHtml }} />
              ) : (
                <p className="draft-book-empty">Aucun brouillon n a encore ete genere pour ce chapitre.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showFinalizeConfirm && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (busyAction !== 'finalize') {
              setShowFinalizeConfirm(false);
            }
          }}
        >
          <div
            className="modal-content modal-content-compact"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="modal-title">Validation finale</h3>
            <p className="modal-text">
              Cette action verrouille definitivement le chapitre et ferme son edition.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={() => setShowFinalizeConfirm(false)}
                disabled={busyAction === 'finalize'}
              >
                Annuler
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={handleFinalize}
                disabled={busyAction === 'finalize'}
              >
                {busyAction === 'finalize' ? 'Validation...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditorModal && (
        <div className="modal-overlay" onClick={() => setShowEditorModal(false)}>
          <div
            className="modal-content book-draft-modal chapter-draft-editor-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="book-draft-modal-header">
              <div>
                <div className="label-gold">Edition plein ecran</div>
                <h3 className="book-draft-modal-title">
                  {chapter?.order_index === 0 ? 'Introduction' : chapter?.title}
                </h3>
                <div className="book-draft-modal-meta">
                  Travaillez le HTML confortablement avant de revenir au workflow.
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowEditorModal(false)}
              >
                x
              </button>
            </div>

            <div className="book-draft-modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleRestoreSavedVersion}
                disabled={!chapterDraft?.html}
              >
                Restaurer
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleSaveRevision}
                disabled={!canSaveRevision || busyAction !== ''}
              >
                {busyAction === 'save' ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setShowEditorModal(false);
                  setShowPreviewModal(true);
                }}
                disabled={!normalizedHtml}
              >
                Voir l apercu
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowEditorModal(false)}
              >
                Revenir au chapitre
              </button>
            </div>

            <div className="chapter-draft-editor-modal-body">
              <textarea
                value={editorHtml}
                onChange={(event) => setEditorHtml(event.target.value)}
                className="input-luxe chapter-draft-editor chapter-draft-editor-fullscreen"
                rows={22}
                disabled={isDraftValidated}
                placeholder="Le HTML du chapitre apparaitra ici apres la generation."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step4Cloture;
