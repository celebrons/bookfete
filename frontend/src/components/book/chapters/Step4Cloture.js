import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import '../BookLuxe.css';
import BookPromptInlineAdmin from '../BookPromptInlineAdmin';
import ChapterPromptInlineAdmin from './ChapterPromptInlineAdmin';

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
    .replace(/<p[^>]*class="[^"]*\bdraft-book-intro\b[^"]*"[^>]*>\s*Chapitre\s*\d+\s*[-:â€“][\s\S]*?<\/p>/gi, '');
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
  const duplicatedHeadingPattern = /^\s*(?:page\s*\d+\s*)?(?:chapitre\s*\d+\s*)+(?:[-:â€“â€”]\s*)?/i;
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

    const normalizedLowerText = text.toLowerCase();
    const looksLikeSinglePageLabel = /^page\s*\d+(?:\s*\/\s*\d+)?$/i.test(text);
    const looksLikeSingleChapterLabel = /^chapitre\s*\d+$/i.test(text);
    const looksLikeRepeatedChapterHeader = duplicatedHeadingPattern.test(text);
    const looksLikeLegacyChapterLead = /^chapitre\s*\d+\s*[-:â€“â€”]/i.test(text);
    const looksLikeLegacySummaryLabel = normalizedLowerText === 'fils directeurs';

    if (
      looksLikeSinglePageLabel
      || looksLikeSingleChapterLabel
      || looksLikeRepeatedChapterHeader
      || looksLikeLegacyChapterLead
      || looksLikeLegacySummaryLabel
    ) {
      node.remove();
    }
  });

  return doc.body.innerHTML.trim();
};

const buildChapterPreviewPages = (html = '') => {
  if (!html || typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return [];
  }

  try {
    const parser = new window.DOMParser();
    const document = parser.parseFromString(html, 'text/html');
    const chapterPages = Array.from(
      document.querySelectorAll('.draft-book-chapter-shell > .draft-book-page')
    );

    if (chapterPages.length > 0) {
      return chapterPages
        .map((page) => (page instanceof window.HTMLElement ? page.outerHTML : ''))
        .filter(Boolean);
    }

    const fallbackPages = Array.from(
      document.querySelectorAll('.draft-book-page, .draft-book-section')
    );

    if (fallbackPages.length > 0) {
      return fallbackPages
        .map((page) => (page instanceof window.HTMLElement ? page.outerHTML : ''))
        .filter(Boolean);
    }

    const root = document.querySelector('.draft-book') || document.body;
    if (!root) {
      return [];
    }

    return Array.from(root.children || [])
      .map((child) => (child instanceof window.HTMLElement ? child.outerHTML : ''))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
};

const Step4Cloture = ({
  chapter,
  chaptersCount,
  user,
  book,
  amorceValidated,
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
  const [draftQualityForPreview, setDraftQualityForPreview] = useState(chapter?.chapterDraft?.aiQuality || null);
  const [editorText, setEditorText] = useState(htmlToPlainText(chapter?.chapterDraft?.html || ''));
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewSpreadIndex, setPreviewSpreadIndex] = useState(0);
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
  const questionsReady = Boolean(
    chapter?.amorce_validated
    || chapter?.questions_validated
    || amorceValidated
  );
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
  const chapterPreviewPages = useMemo(
    () => buildChapterPreviewPages(previewHtml),
    [previewHtml]
  );
  const chapterOrderIndex = Number(chapter?.order_index ?? chapter?.position ?? 0);
  const totalChapters = Number(chaptersCount || book?.chapter_count || 0);
  const isFirstChapter = chapterOrderIndex === 0;
  const isLastChapter = totalChapters > 0 && chapterOrderIndex === totalChapters - 1;
  const previewSpreadCount = Math.max(1, Math.ceil(chapterPreviewPages.length / 2));
  const currentPreviewSpreadIndex = Math.min(
    previewSpreadIndex,
    Math.max(0, previewSpreadCount - 1)
  );
  const leftPreviewPageHtml = chapterPreviewPages[currentPreviewSpreadIndex * 2] || '';
  const rightPreviewPageHtml = chapterPreviewPages[currentPreviewSpreadIndex * 2 + 1] || '';
  const canGoToPreviousPreviewSpread = currentPreviewSpreadIndex > 0;
  const canGoToNextPreviewSpread = currentPreviewSpreadIndex < previewSpreadCount - 1;
  const hasDraftContent = Boolean(previewHtml || normalizedText);
  const canGenerateWithAI = isDraftValidated
    ? true
    : (generationUnlocked && remainingGenerations > 0);
  const canSaveRevision = !isDraftValidated && !chapterLocked && Boolean(normalizedText);
  const canFinalize = !isDraftValidated && generationUnlocked && Boolean(normalizedText);
  const showFinalizeAction = !isDraftValidated && hasDraftContent;
  const latestDraftTimestamp =
    chapterDraft?.finalizedAt ||
    chapterDraft?.lastEditedAt ||
    chapterDraft?.lastGeneratedAt ||
    null;
  const aiQualityScore = Number(draftQualityForPreview?.score);
  const hasAiQualityScore = Number.isFinite(aiQualityScore) && aiQualityScore > 0;
  const aiQualityIssues = Array.isArray(draftQualityForPreview?.issues)
    ? draftQualityForPreview.issues.filter(Boolean).slice(0, 3)
    : [];
  const summaryCards = [
    {
      key: 'questions',
      label: 'Amorce',
      value: questionsReady ? 'OK' : 'A faire',
      tone: questionsReady ? 'ok' : 'pending',
      icon: 'questions'
    },
    {
      key: 'contribution',
      label: 'Votre contribution',
      value: contributionReady ? 'Prete' : 'A faire',
      tone: contributionReady ? 'ok' : 'pending',
      icon: 'contribution'
    },
    !isSoloMode ? {
      key: 'invitations',
      label: 'Invitations',
      value: `${invitationsCount}`,
      tone: invitationsReady ? 'ok' : 'pending',
      icon: 'invitations'
    } : null,
    !isSoloMode ? {
      key: 'received',
      label: 'Contributions recues',
      value: `${visibleContributionsCount}`,
      tone: visibleContributionsCount > 0 ? 'ok' : 'pending',
      icon: 'received'
    } : null,
    !isSoloMode ? {
      key: 'pending_validation',
      label: 'A valider',
      value: `${pendingValidationCount}`,
      tone: pendingValidationCount === 0 ? 'ok' : 'pending',
      icon: 'pending'
    } : null,
    !isSoloMode ? {
      key: 'flow',
      label: 'Flux contributeurs',
      value: contributionsClosed ? 'Clos' : 'Ouvert',
      tone: contributionsClosed ? 'ok' : 'pending',
      icon: 'flow'
    } : null
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

  useEffect(() => {
    if (!showPreviewModal) {
      return;
    }
    setPreviewSpreadIndex(0);
  }, [showPreviewModal, chapter?.id]);

  useEffect(() => {
    setPreviewSpreadIndex((previous) => {
      const max = Math.max(0, previewSpreadCount - 1);
      return Math.min(previous, max);
    });
  }, [previewSpreadCount]);

  useEffect(() => {
    if (!showPreviewModal || typeof window === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowPreviewModal(false);
        return;
      }
      if (event.key === 'ArrowLeft' && canGoToPreviousPreviewSpread) {
        event.preventDefault();
        setPreviewSpreadIndex((previous) => Math.max(0, previous - 1));
      }
      if (event.key === 'ArrowRight' && canGoToNextPreviewSpread) {
        event.preventDefault();
        setPreviewSpreadIndex((previous) => Math.min(previewSpreadCount - 1, previous + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    showPreviewModal,
    canGoToPreviousPreviewSpread,
    canGoToNextPreviewSpread,
    previewSpreadCount
  ]);

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
    setDraftQualityForPreview(chapter?.chapterDraft?.aiQuality || null);
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
    const previewOnlyRegeneration = isDraftValidated;

    if (chapterLocked && !previewOnlyRegeneration) {
      setError('Ce chapitre est deja valide et verrouille.');
      return;
    }

    if (!generationUnlocked && !previewOnlyRegeneration) {
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
      const result = await onGenerateChapterDraft(
        chapter.id,
        previewOnlyRegeneration
          ? { allowValidatedRegeneration: true, previewOnly: true }
          : {}
      );
      if (result?.draft?.html) {
        setDraftHtmlForPreview(result.draft.html);
        setEditorText(htmlToPlainText(result.draft.html));
      }
      if (result?.draft?.aiQuality) {
        setDraftQualityForPreview(result.draft.aiQuality);
      }
      if (previewOnlyRegeneration || result?.previewOnly) {
        setNotice('Nouvelle version de comparaison generee. La version finale reste verrouillee.');
        setShowPreviewModal(true);
      } else {
        setNotice('Chapitre genere. Vous pouvez relire et ajuster le texte avant validation.');
        setShowEditorModal(true);
      }
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
      if (result?.draft?.aiQuality) {
        setDraftQualityForPreview(result.draft.aiQuality);
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
      if (result?.draft?.aiQuality) {
        setDraftQualityForPreview(result.draft.aiQuality);
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

  const shiftPreviewSpread = (direction) => {
    setPreviewSpreadIndex((previous) => {
      const max = Math.max(0, previewSpreadCount - 1);
      const next = previous + direction;
      return Math.min(max, Math.max(0, next));
    });
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
              8 pages HTML. Regeneration IA limitee a 3 essais, puis revision manuelle et validation finale.
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
              : (
                isDraftValidated
                  ? 'Regenerer pour comparer'
                  : (
                    generationCount > 0
                      ? `Regenerer le chapitre (${remainingGenerations} restant${remainingGenerations > 1 ? 's' : ''})`
                      : 'Generer le chapitre'
                  )
              )}
          </button>

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

        {hasAiQualityScore && (
          <div className="chapter-draft-quality-box">
            <div className="chapter-draft-quality-header">
              <span>aiQuality</span>
              <strong>{Math.max(0, Math.min(100, Math.round(aiQualityScore)))}/100</strong>
            </div>
            {aiQualityIssues.length > 0 && (
              <div className="chapter-draft-quality-issues">
                {aiQualityIssues.join(' | ')}
              </div>
            )}
          </div>
        )}

        {summaryCards.length > 0 && (
          <div className="chapter-draft-summary-cloud is-inline is-minimal">
            {summaryCards.map((item) => (
              <div
                key={item.key}
                className={`chapter-draft-summary-pill is-${item.tone}`}
                title={`${item.label}: ${item.value}`}
                aria-label={`${item.label}: ${item.value}`}
              >
                <span className={`chapter-draft-summary-pill-icon is-${item.icon}`} aria-hidden="true" />
                <strong className="chapter-draft-summary-pill-value">{item.value}</strong>
              </div>
            ))}
          </div>
        )}
        {isFirstChapter || isLastChapter ? (
          <div className="book-prompt-admin-stack">
            {isFirstChapter && (
              <BookPromptInlineAdmin
                endpointBase={`/books/${book?.id}/prompt-admin/introduction`}
                panelTitle="Generation de l introduction"
                panelSubtitle="Texte d ouverture du livre. Testez les directives ici, puis regenerez le chapitre pour voir le rendu."
                emptyResultLabel={'Cliquez sur "Tester" pour voir une introduction ici.'}
                publishNotice="Cette version est maintenant active pour la generation de l introduction."
                onPublished={onGenerateChapterDraft}
                className="book-prompt-admin-inline"
              />
            )}
            {isLastChapter && (
              <BookPromptInlineAdmin
                endpointBase={`/books/${book?.id}/prompt-admin/epilogue`}
                panelTitle="Generation de l epilogue"
                panelSubtitle="Texte de fermeture du livre. Testez les directives ici, puis regenerez le chapitre pour voir le rendu."
                emptyResultLabel={'Cliquez sur "Tester" pour voir un epilogue ici.'}
                publishNotice="Cette version est maintenant active pour la generation de l epilogue."
                onPublished={onGenerateChapterDraft}
                className="book-prompt-admin-inline"
              />
            )}
          </div>
        ) : (
          <ChapterPromptInlineAdmin chapter={chapter} />
        )}
      </div>

      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div
            className="modal-content book-draft-modal chapter-draft-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="book-draft-modal-header chapter-draft-preview-header-compact">
              <div>
                <h3 className="book-draft-modal-title">
                  {isFirstChapter ? 'Introduction' : (isLastChapter ? 'Epilogue' : chapter?.title)}
                </h3>
                <div className="book-draft-modal-meta">
                  Version {isDraftValidated ? 'finale' : 'de travail'}
                </div>
              </div>
              {!isDraftValidated && (
                <button
                  type="button"
                  className="btn btn-outline chapter-draft-preview-edit-btn"
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
                className="modal-close"
                onClick={() => setShowPreviewModal(false)}
              >
                x
              </button>
            </div>

            <div className="book-draft-preview chapter-draft-preview-scroll is-horizontal">
              {chapterPreviewPages.length > 0 ? (
                <div className="book-draft-preview-stage book-draft-preview-stage-spread chapter-draft-preview-stage">
                  <button
                    type="button"
                    className="book-draft-nav-arrow is-left"
                    onClick={() => shiftPreviewSpread(-1)}
                    disabled={!canGoToPreviousPreviewSpread}
                    aria-label="Pages precedentes"
                  >
                    {'<'}
                  </button>
                  <div className="book-draft-book-spread">
                    <article className="draft-book-leaf is-left">
                      <div
                        className="draft-book-leaf-content"
                        dangerouslySetInnerHTML={{ __html: leftPreviewPageHtml }}
                      />
                    </article>
                    <article className="draft-book-leaf is-right">
                      <div
                        className="draft-book-leaf-content"
                        dangerouslySetInnerHTML={{
                          __html: rightPreviewPageHtml || '<div class="draft-book-leaf-empty"></div>'
                        }}
                      />
                    </article>
                  </div>
                  <button
                    type="button"
                    className="book-draft-nav-arrow is-right"
                    onClick={() => shiftPreviewSpread(1)}
                    disabled={!canGoToNextPreviewSpread}
                    aria-label="Pages suivantes"
                  >
                    {'>'}
                  </button>
                </div>
              ) : previewHtml ? (
                <div className="book-draft-preview-stage">
                  <div
                    className="book-draft-preview-paper"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
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
                  {isFirstChapter ? 'Introduction' : (isLastChapter ? 'Epilogue' : chapter?.title)}
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


