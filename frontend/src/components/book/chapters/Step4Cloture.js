import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import '../BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const EDITABLE_BLOCK_SELECTOR = 'p, li, blockquote';

const escapeHtml = (value = '') => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizePlainText = (text = '') => text.replace(/\r\n/g, '\n').trim();

const splitPlainTextBlocks = (text = '') => normalizePlainText(text)
  .split(/\n{2,}/)
  .map((block) => block.trim())
  .filter(Boolean);

const htmlToPlainText = (html = '') => {
  if (!html) {
    return '';
  }

  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    const doc = new window.DOMParser().parseFromString(html, 'text/html');
    const blocks = Array.from(doc.body.querySelectorAll(EDITABLE_BLOCK_SELECTOR));

    if (blocks.length > 0) {
      return blocks
        .map((node) => (node.textContent || '').trim())
        .filter(Boolean)
        .join('\n\n');
    }

    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const plainTextToHtml = (text = '') => {
  const textBlocks = splitPlainTextBlocks(text);
  if (textBlocks.length === 0) {
    return '';
  }

  return textBlocks
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
};

const mergePlainTextIntoHtml = (templateHtml = '', text = '') => {
  const textBlocks = splitPlainTextBlocks(text);

  if (textBlocks.length === 0) {
    return '';
  }

  if (!templateHtml || typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return plainTextToHtml(text);
  }

  const doc = new window.DOMParser().parseFromString(templateHtml, 'text/html');
  const editableNodes = Array.from(doc.body.querySelectorAll(EDITABLE_BLOCK_SELECTOR));

  if (editableNodes.length === 0) {
    return plainTextToHtml(text);
  }

  const overlapCount = Math.min(editableNodes.length, textBlocks.length);

  for (let index = 0; index < overlapCount; index += 1) {
    editableNodes[index].innerHTML = escapeHtml(textBlocks[index]).replace(/\n/g, '<br />');
  }

  for (let index = overlapCount; index < editableNodes.length; index += 1) {
    editableNodes[index].textContent = '';
  }

  if (textBlocks.length > editableNodes.length) {
    const appendTarget = doc.body.querySelector('.draft-book-body') || doc.body;

    textBlocks.slice(editableNodes.length).forEach((blockText) => {
      const paragraph = doc.createElement('p');
      paragraph.innerHTML = escapeHtml(blockText).replace(/\n/g, '<br />');
      appendTarget.appendChild(paragraph);
    });
  }

  return doc.body.innerHTML.trim();
};

const sanitizeLegacyChapterPreviewHtml = (html = '') => {
  const source = String(html || '').trim();
  if (!source) {
    return '';
  }

  return source
    .replace(/<div[^>]*class="[^"]*\bdraft-book-page-label\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*\bdraft-book-chapter-index\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<p[^>]*class="[^"]*\bdraft-book-intro\b[^"]*"[^>]*>\s*Chapitre\s*\d+\s*[-:–][\s\S]*?<\/p>/gi, '');
};

const sanitizeChapterPreviewHtml = (html = '') => {
  const source = sanitizeLegacyChapterPreviewHtml(html);
  if (!source) {
    return '';
  }

  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return source;
  }

  const doc = new window.DOMParser().parseFromString(source, 'text/html');
  const duplicatedHeadingPattern = /^\s*(?:page\s*\d+\s*)?(?:chapitre\s*\d+\s*)+(?:[-:–—]\s*)?/i;
  const legacySummaryTitles = Array.from(doc.body.querySelectorAll('.draft-book-mini-title'));
  legacySummaryTitles.forEach((node) => {
    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text === 'resume de chapitre') {
      const sectionNode = node.closest('.draft-book-section');
      if (sectionNode) {
        sectionNode.remove();
        return;
      }
      node.remove();
    }
  });
  const headingLikeNodes = Array.from(doc.body.querySelectorAll('h1, h2, h3, p, div, span'));

  headingLikeNodes.forEach((node) => {
    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return;
    }

    if (
      /^page\s*\d+$/i.test(text)
      || /^chapitre\s*\d+$/i.test(text)
      || duplicatedHeadingPattern.test(text)
    ) {
      node.remove();
    }
  });

  return doc.body.innerHTML.trim();
};

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
  const [draftHtmlForPreview, setDraftHtmlForPreview] = useState(chapter?.chapterDraft?.html || '');
  const [editorText, setEditorText] = useState(htmlToPlainText(chapter?.chapterDraft?.html || ''));
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const hasOpenModal = showPreviewModal || showEditorModal || showFinalizeConfirm;

  const isOrganizer = user && book && user.id === book.owner_id;
  const isSoloMode = Boolean(book?.cover_config?.soloMode);
  const contributionsClosed = chapter?.contributionsClosed || false;
  const chapterLocked = chapter?.isChapterClosed || false;
  const generationUnlocked = !chapterLocked && (isSoloMode || contributionsClosed);
  const showContributionsGateWarning = !chapterLocked && !isSoloMode && !contributionsClosed;
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
  const normalizedText = (editorText || '').trim();
  const normalizedHtml = plainTextToHtml(normalizedText);
  const previewHtml = sanitizeChapterPreviewHtml(
    (draftHtmlForPreview || chapterDraft?.html || normalizedHtml || '').trim()
  );
  const hasDraftContent = Boolean(previewHtml || normalizedText);
  const canGenerateWithAI = !isDraftValidated && generationUnlocked && remainingGenerations > 0;
  const canSaveRevision = !isDraftValidated && !chapterLocked && Boolean(normalizedText);
  const canFinalize = !isDraftValidated && generationUnlocked && Boolean(normalizedText);
  const showFinalizeAction = !isDraftValidated && hasDraftContent;
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
    if (typeof document === 'undefined') {
      return undefined;
    }
    if (!hasOpenModal) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hasOpenModal]);

  const buildLocalSummary = useCallback(() => {
    if (!chapter?.id) {
      return null;
    }

    const localInvites = Array.isArray(chapter?.chapter_invites)
      ? chapter.chapter_invites
      : (Array.isArray(invitations) ? invitations : []);
    const localContributions = Array.isArray(chapter?.contributions) ? chapter.contributions : [];
    const externalContributions = localContributions.filter(
      (contribution) =>
        contribution.contributor_email !== user?.email &&
        contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
        contribution.contributor_email !== CHAPTER_DRAFT_EMAIL &&
        contribution.is_finalized !== false
    );
    const respondedInvitesCount = localInvites.filter(
      (invite) => invite.accepted || invite.contributed
    ).length;

    return {
      invitationsCount: localInvites.length,
      receivedCount: Math.max(externalContributions.length, respondedInvitesCount),
      pendingValidationCount: externalContributions.filter(
        (contribution) => !contribution.approved && !contribution.needs_revision
      ).length
    };
  }, [chapter?.id, chapter?.chapter_invites, chapter?.contributions, invitations, user?.email]);

  const updateSummaryState = useCallback((nextSummary) => {
    if (!nextSummary) {
      return;
    }

    setSummary((previous) => {
      if (
        previous &&
        previous.invitationsCount === nextSummary.invitationsCount &&
        previous.receivedCount === nextSummary.receivedCount &&
        previous.pendingValidationCount === nextSummary.pendingValidationCount
      ) {
        return previous;
      }

      return nextSummary;
    });
  }, []);

  useEffect(() => {
    const nextDraftHtml = chapter?.chapterDraft?.html || '';
    setDraftHtmlForPreview(nextDraftHtml);
    setEditorText(htmlToPlainText(chapter?.chapterDraft?.html || ''));
    setError('');
    setNotice('');
    setShowPreviewModal(false);
    setShowEditorModal(false);
    setShowFinalizeConfirm(false);
  }, [chapter?.id, chapter?.chapterDraft?.html, chapter?.chapterDraft?.status]);

  useEffect(() => {
    const localSummary = buildLocalSummary();
    updateSummaryState(localSummary);
  }, [buildLocalSummary, updateSummaryState]);

  const loadSummary = useCallback(async () => {
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

      updateSummaryState({
        invitationsCount: (invitesData || []).length,
        receivedCount: Math.max(externalContributions.length, respondedInvitesCount),
        pendingValidationCount: externalContributions.filter(
          (contribution) => !contribution.approved && !contribution.needs_revision
        ).length
      });
    } catch (loadError) {
      console.error('Erreur chargement recap chapitre:', loadError);
      updateSummaryState(buildLocalSummary());
    }
  }, [chapter?.id, user?.email, buildLocalSummary, updateSummaryState]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, chapter?.workflowState, chapter?.chapterDraft?.status]);

  useEffect(() => {
    if (!chapter?.id) {
      return undefined;
    }

    const realtimeChannel = supabase
      .channel(`step4-summary-${chapter.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contributions', filter: `chapter_id=eq.${chapter.id}` },
        () => {
          loadSummary();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chapter_invites', filter: `chapter_id=eq.${chapter.id}` },
        () => {
          loadSummary();
        }
      )
      .subscribe();

    const intervalId = setInterval(() => {
      loadSummary();
    }, 4000);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(realtimeChannel);
    };
  }, [chapter?.id, loadSummary]);

  const buildHtmlToPersist = () => mergePlainTextIntoHtml(
    draftHtmlForPreview || chapterDraft?.html || '',
    normalizedText
  );

  const handleGenerate = async () => {
    if (chapterLocked) {
      setError('Ce chapitre est deja valide et verrouille.');
      return;
    }

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
        setDraftHtmlForPreview(result.draft.html);
        setEditorText(htmlToPlainText(result.draft.html));
      }
      setNotice('Chapitre genere. Vous pouvez relire et ajuster le texte avant validation.');
      setShowEditorModal(true);
    } catch (generationError) {
      setError(generationError.message || 'Erreur lors de la generation du chapitre.');
    } finally {
      setBusyAction('');
    }
  };

  const handleSaveRevision = async ({ closeAfterSave = false } = {}) => {
    const htmlToPersist = buildHtmlToPersist();

    if (!htmlToPersist) {
      setError('Aucun texte a enregistrer pour ce chapitre.');
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
      const result = await onSaveChapterDraft(chapter.id, htmlToPersist);
      if (result?.draft?.html) {
        setDraftHtmlForPreview(result.draft.html);
        setEditorText(htmlToPlainText(result.draft.html));
      }
      setNotice('Texte du chapitre enregistre.');
      if (closeAfterSave) {
        setShowEditorModal(false);
      }
    } catch (saveError) {
      setError(saveError.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setBusyAction('');
    }
  };

  const requestFinalize = () => {
    const htmlToPersist = buildHtmlToPersist();

    if (chapterLocked) {
      setError('Ce chapitre est deja valide et verrouille.');
      return;
    }

    if (!generationUnlocked) {
      setError('Fermez d abord les contributions avant la validation finale.');
      return;
    }

    if (!htmlToPersist) {
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
    const htmlToPersist = buildHtmlToPersist();

    if (!htmlToPersist) {
      setError('Generez ou revisez le brouillon avant la validation finale.');
      return;
    }

    setBusyAction('finalize');
    setError('');
    setNotice('');

    try {
      const result = await onFinalizeChapterDraft(chapter.id, htmlToPersist);
      if (result?.draft?.html) {
        setDraftHtmlForPreview(result.draft.html);
        setEditorText(htmlToPlainText(result.draft.html));
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
    const sourceHtml = draftHtmlForPreview || chapterDraft?.html || '';

    if (!sourceHtml) {
      setError('Aucune version enregistree a restaurer pour ce chapitre.');
      return;
    }

    setEditorText(htmlToPlainText(sourceHtml));
    setError('');
    setNotice('La derniere version enregistree a ete restauree.');
  };

  const handleCancelEditing = () => {
    const sourceHtml = draftHtmlForPreview || chapterDraft?.html || '';
    setEditorText(htmlToPlainText(sourceHtml));
    setError('');
    setShowEditorModal(false);
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
            : 'Generez le chapitre, ajustez le texte si besoin puis lancez la validation finale.'}
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

      {showContributionsGateWarning && (
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
          {!isDraftValidated && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleGenerate}
              disabled={!canGenerateWithAI || busyAction !== ''}
            >
              {busyAction === 'generate'
                ? 'Generation...'
                : (
                  generationCount > 0
                    ? `Regenerer le chapitre (${remainingGenerations} restant${remainingGenerations > 1 ? 's' : ''})`
                    : 'Generer le chapitre'
                )}
            </button>
          )}

          {hasDraftContent && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowPreviewModal(true)}
              disabled={!previewHtml}
            >
              Voir l apercu
            </button>
          )}

          {showFinalizeAction && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={requestFinalize}
              disabled={!canFinalize || busyAction !== ''}
            >
              {busyAction === 'finalize' ? 'Validation...' : 'Validation finale'}
            </button>
          )}
        </div>

        <div className="chapter-draft-summary-card is-active" style={{ marginTop: 'var(--space-sm)' }}>
          <div className="chapter-draft-summary-label">Utilisation</div>
          <div className="chapter-draft-summary-value" style={{ fontSize: '14px', fontWeight: '500' }}>
            Le texte du chapitre se corrige dans la fenetre d edition, sans afficher les balises HTML.
          </div>
        </div>
      </div>

      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div
            className="modal-content book-draft-modal chapter-draft-preview-modal"
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
              {!isDraftValidated && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowPreviewModal(false);
                    setShowEditorModal(true);
                  }}
                >
                  Modifier le texte
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowPreviewModal(false)}
              >
                Fermer
              </button>
            </div>

            <div className="book-draft-preview chapter-draft-preview-scroll">
              {previewHtml ? (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
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
        <div className="modal-overlay" onClick={handleCancelEditing}>
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
                  Ajustez uniquement le texte du chapitre, sans balises HTML visibles.
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={handleCancelEditing}
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
                className="btn btn-primary"
                onClick={() => handleSaveRevision({ closeAfterSave: true })}
                disabled={!canSaveRevision || busyAction !== ''}
              >
                {busyAction === 'save' ? 'Enregistrement...' : 'Valider les modifications'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCancelEditing}
              >
                Annuler
              </button>
            </div>

            <div className="chapter-draft-editor-modal-body">
              <textarea
                value={editorText}
                onChange={(event) => setEditorText(event.target.value)}
                className="input-luxe chapter-draft-editor chapter-draft-editor-fullscreen"
                rows={22}
                disabled={isDraftValidated}
                placeholder="Le texte du chapitre apparaitra ici apres la generation."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step4Cloture;
