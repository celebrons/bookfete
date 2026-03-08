// C:\Users\USER\bookfete\frontend\src\components\book\BookPageLuxe.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import ChapterListLuxe from './ChapterListLuxe';
import BookConfigLuxe from './BookConfigLuxe';
import ContributorsTabLuxe from './contributors/ContributorsTabLuxe';
import Loading from '../common/Loading';
import {
  BOOK_LIFECYCLE_ORDER,
  getBookLifecycleConfig,
  getBookLifecycleStatusFromBook,
  isBookLifecycleAtLeast,
  normalizeBookLifecycleStatus
} from '../../utils/bookLifecycle';
import '../../styles/luxe-theme.css';
import './BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const MAX_CHAPTERS = 12;
const WRITING_GUIDE_STEPS = [
  {
    title: 'Edition du livre',
    text: 'Travaillez en galerie ou en sommaire. Cliquez un chapitre, la zone de travail s ouvre a droite.'
  },
  {
    title: 'Workflow chapitre (1 a 4)',
    text: 'Suivez l ordre Questions > Contribution > Invitations > Generation. Les etapes valides passent en bas.'
  },
  {
    title: 'Couverture et 4e',
    text: 'Configurez la couverture et la 4e de couverture depuis la meme galerie, comme des elements du livre.'
  },
  {
    title: 'Contributeurs et temps reel',
    text: 'Les compteurs et statuts se mettent a jour en direct sans rafraichir la page.'
  },
  {
    title: 'Apercu et PDF final',
    text: 'Apercu du livre puis export PDF imprimeur. Les boutons deviennent actifs quand les chapitres sont valides.'
  },
  {
    title: 'Suivi de production',
    text: 'La timeline suit les statuts reel: edition, apercu, finalise, imprimeur, imprime, envoye.'
  }
];

const TAB_HELP = {
  chapitres: 'Structure du livre, couverture/4e et travail chapitre par chapitre.',
  contributeurs: 'Ajout, suivi et gestion des personnes qui peuvent contribuer au livre.',
  config: 'Reglages du livre: style, papier, finition, volume et prix.'
};

const getSoloMode = (book) => Boolean(book?.cover_config?.soloMode);

const parseChapterDraftState = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      version: parsed.version || 1,
      status: parsed.status || 'draft',
      generationCount: Number(parsed.generationCount || 0),
      maxGenerations: Number(parsed.maxGenerations || 3),
      title: parsed.title || '',
      summary: parsed.summary || '',
      html: parsed.html || '',
      lastGeneratedAt: parsed.lastGeneratedAt || null,
      lastEditedAt: parsed.lastEditedAt || null,
      finalizedAt: parsed.finalizedAt || null
    };
  } catch (error) {
    return null;
  }
};

const BookPageLuxe = () => {
  const { bookId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chapitres');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftPreview, setDraftPreview] = useState(null);
  const [startingPdfExport, setStartingPdfExport] = useState(false);
  const [pdfExportJob, setPdfExportJob] = useState(null);
  const [downloadingPdfKind, setDownloadingPdfKind] = useState('');
  const [updatingLifecycleStatus, setUpdatingLifecycleStatus] = useState('');
  const [user, setUser] = useState(null);
  const [pageNotice, setPageNotice] = useState(null);
  const [editionGalleryRequest, setEditionGalleryRequest] = useState(0);
  const chapterIdsRef = useRef(new Set());
  const pdfExportPollRef = useRef(null);
  const pdfPanelRef = useRef(null);
  const mainContentRef = useRef(null);
  const areAllChaptersValidated = chapters.length > 0 && chapters.every(
    (chapter) => chapter?.chapterDraft?.status === 'validated'
  );

  useEffect(() => {
    getUser();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const requestedTab = params.get('tab');
    const requestedView = params.get('view');

    if (requestedTab === 'chapitres' || requestedTab === 'contributeurs' || requestedTab === 'config') {
      setActiveTab(requestedTab);
    }

    if (requestedTab === 'chapitres' && requestedView === 'gallery') {
      setEditionGalleryRequest((previous) => previous + 1);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          scrollToMainContent();
        });
        window.setTimeout(() => {
          scrollToMainContent();
        }, 120);
      }
    }
  }, [location.search]);

  useEffect(() => {
    if (bookId && user) {
      loadBookAndChapters();
    }
  }, [bookId, user]);

  useEffect(() => {
    chapterIdsRef.current = new Set(
      chapters
        .map((chapter) => chapter?.id)
        .filter(Boolean)
    );
  }, [chapters]);

  useEffect(() => (
    () => {
      if (pdfExportPollRef.current) {
        clearInterval(pdfExportPollRef.current);
        pdfExportPollRef.current = null;
      }
    }
  ), []);

  useEffect(() => {
    if (!bookId || !user) {
      return undefined;
    }

    const shouldRefreshForChapter = (payload) => {
      const changedChapterId = payload?.new?.chapter_id || payload?.old?.chapter_id;
      return Boolean(changedChapterId && chapterIdsRef.current.has(changedChapterId));
    };

    const channel = supabase
      .channel(`book-page-${bookId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contributions' },
        (payload) => {
          if (shouldRefreshForChapter(payload)) {
            loadBookAndChapters({ silent: true });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chapter_invites' },
        (payload) => {
          if (shouldRefreshForChapter(payload)) {
            loadBookAndChapters({ silent: true });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chapters', filter: `book_id=eq.${bookId}` },
        () => {
          loadBookAndChapters({ silent: true });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'books', filter: `id=eq.${bookId}` },
        () => {
          loadBookAndChapters({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId, user]);

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  const getApiBaseUrl = () => process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const showPageNotice = (message, type = 'info') => {
    setPageNotice({ message, type });
  };
  const dismissPageNotice = () => {
    setPageNotice(null);
  };

  const stopPdfExportPolling = () => {
    if (pdfExportPollRef.current) {
      clearInterval(pdfExportPollRef.current);
      pdfExportPollRef.current = null;
    }
  };

  const parseFileNameFromDisposition = (disposition, fallback) => {
    if (!disposition) {
      return fallback;
    }

    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const standardMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (standardMatch?.[1]) {
      return standardMatch[1];
    }

    return fallback;
  };

  const decorateChapter = (chapter) => {
    const contributions = Array.isArray(chapter?.contributions) ? chapter.contributions : [];
    const chapterInvites = Array.isArray(chapter?.chapter_invites) ? chapter.chapter_invites : [];
    const respondedInvitesCount = chapterInvites.filter(
      (invite) => invite?.accepted || invite?.contributed
    ).length;
    const stateContribution = contributions
      .filter((contribution) => contribution?.contributor_email === CHAPTER_STATE_EMAIL)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    const draftContribution = contributions
      .filter((contribution) => contribution?.contributor_email === CHAPTER_DRAFT_EMAIL)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    const workflowState = stateContribution?.message || null;
    const chapterDraft = parseChapterDraftState(draftContribution?.message);
    const visibleContributions = contributions.filter(
      (contribution) =>
        contribution.contributor_email !== user?.email &&
        contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
        contribution.contributor_email !== CHAPTER_DRAFT_EMAIL &&
        contribution.is_finalized !== false
    );
    const matchingContributions = contributions
      .filter((contribution) => contribution.contributor_email === user?.email)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const currentUserContribution = chapter?.currentUserContribution || matchingContributions[0] || null;

    return {
      ...chapter,
      workflowState,
      chapterDraft,
      contributionsClosed: workflowState === 'contributions_closed' || workflowState === 'closed',
      isChapterClosed: workflowState === 'closed',
      currentUserContribution,
      hasContributed: Boolean(currentUserContribution),
      isFinalized: Boolean(currentUserContribution?.is_finalized),
      contributionsCount: Math.max(visibleContributions.length, respondedInvitesCount),
      invitationsCount: Array.isArray(chapter?.chapter_invites)
        ? chapterInvites.length
        : chapter?.invitationsCount || 0
    };
  };

  const normalizeChaptersForState = (chapterList) => (
    [...(chapterList || [])]
      .sort((a, b) => (a?.order_index || 0) - (b?.order_index || 0))
      .map((chapter, index) => decorateChapter({
        ...chapter,
        order_index: index,
        title: index === 0 ? 'Introduction' : (chapter?.title || `Chapitre ${index + 1}`)
      }))
  );

  const updateChapterInState = (chapterId, updater) => {
    setChapters((prevChapters) =>
      normalizeChaptersForState(prevChapters.map((chapter) => {
        if (chapter.id !== chapterId) {
          return chapter;
        }

        return typeof updater === 'function'
          ? updater(chapter)
          : { ...chapter, ...updater };
      }))
    );
  };

  const mergeContributionIntoChapterState = (chapterId, contribution) => {
    if (!contribution?.id) {
      return;
    }

    updateChapterInState(chapterId, (chapter) => {
      const contributions = Array.isArray(chapter?.contributions) ? [...chapter.contributions] : [];
      const existingIndex = contributions.findIndex((item) => item.id === contribution.id);

      if (existingIndex >= 0) {
        contributions[existingIndex] = contribution;
      } else {
        contributions.push(contribution);
      }

      return {
        ...chapter,
        contributions
      };
    });
  };

  const persistChapterWorkflowState = async (chapterId, nextState) => {
    const currentChapter = chapters.find((chapter) => chapter.id === chapterId);
    const existingStateContribution = Array.isArray(currentChapter?.contributions)
      ? currentChapter.contributions.find(
          (contribution) => contribution?.contributor_email === CHAPTER_STATE_EMAIL
        )
      : null;
    let savedStateContribution = null;

    if (existingStateContribution?.id) {
      const { data, error } = await supabase
        .from('contributions')
        .update({
          contributor_name: '__chapter_state__',
          message: nextState,
          photo_urls: [],
          approved: true,
          is_finalized: true,
          needs_revision: false,
          moderation_feedback: null
        })
        .eq('id', existingStateContribution.id)
        .select()
        .single();

      if (error) throw error;
      savedStateContribution = data;
    } else {
      const { data, error } = await supabase
        .from('contributions')
        .insert([{
          chapter_id: chapterId,
          contributor_name: '__chapter_state__',
          contributor_email: CHAPTER_STATE_EMAIL,
          message: nextState,
          photo_urls: [],
          approved: true,
          is_finalized: true,
          needs_revision: false
        }])
        .select()
        .single();

      if (error) throw error;
      savedStateContribution = data;
    }

    updateChapterInState(chapterId, (chapter) => {
      const contributions = Array.isArray(chapter?.contributions) ? [...chapter.contributions] : [];
      const existingIndex = contributions.findIndex(
        (contribution) => contribution.id === savedStateContribution.id
      );

      if (existingIndex >= 0) {
        contributions[existingIndex] = savedStateContribution;
      } else {
        contributions.push(savedStateContribution);
      }

      return {
        ...chapter,
        contributions
      };
    });

    return savedStateContribution;
  };

  const loadBookAndChapters = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError) throw bookError;
      setBook(bookData);

      // Charger les chapitres avec toutes leurs contributions
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select(`
          *,
          contributions:contributions(*),
          chapter_invites:chapter_invites(*)
        `)
        .eq('book_id', bookId)
        .order('order_index', { ascending: true });

      if (chaptersError) throw chaptersError;

      setChapters(normalizeChaptersForState(chaptersData || []));

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleUpdateChapter = async (chapterId, updates) => {
    try {
      const currentChapter = chapters.find((chapter) => chapter.id === chapterId);
      if (currentChapter?.isChapterClosed) {
        throw new Error('Ce chapitre est verrouille apres validation finale.');
      }

      const { status, ...chapterUpdates } = updates || {};
      const currentChapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
      const safeChapterUpdates = { ...chapterUpdates };

      if (
        currentChapterIndex === 0 &&
        Object.prototype.hasOwnProperty.call(safeChapterUpdates, 'title')
      ) {
        safeChapterUpdates.title = 'Introduction';
      }

      if (status === 'contributions_closed' || status === 'closed') {
        await persistChapterWorkflowState(chapterId, status);

        if (Object.keys(safeChapterUpdates).length === 0) {
          return { workflowState: status };
        }
      }

      if (Object.keys(safeChapterUpdates).length === 0) {
        return null;
      }

      const { data, error } = await supabase
        .from('chapters')
        .update(safeChapterUpdates)
        .eq('id', chapterId)
        .select()
        .single();

      if (error) throw error;
      updateChapterInState(chapterId, (chapter) => ({ ...chapter, ...data }));
      return data;
    } catch (error) {
      console.error('❌ Erreur mise à jour:', error);
      showPageNotice('Erreur lors de la mise à jour du chapitre.', 'error');
      throw error;
    }
  };

  const handleSaveContribution = async (chapterId, contributionData) => {
    try {
      const currentChapter = chapters.find((chapter) => chapter.id === chapterId);
      if (currentChapter?.isChapterClosed) {
        throw new Error('Ce chapitre est verrouille apres validation finale.');
      }

      const existingContribution = currentChapter?.currentUserContribution;
      let savedContribution = null;

      if (existingContribution?.id) {
        const { data, error } = await supabase
          .from('contributions')
          .update({
            message: contributionData.message,
            photo_urls: contributionData.photo_urls,
            is_finalized: false
          })
          .eq('id', existingContribution.id)
          .select()
          .single();

        if (error) throw error;
        savedContribution = data;
      } else {
        const { data, error } = await supabase
          .from('contributions')
          .insert([{
            chapter_id: chapterId,
            ...contributionData
          }])
          .select()
          .single();

        if (error) throw error;
        savedContribution = data;
      }

      updateChapterInState(chapterId, (chapter) => {
        const contributions = Array.isArray(chapter.contributions) ? [...chapter.contributions] : [];
        const existingIndex = contributions.findIndex((contribution) => contribution.id === savedContribution.id);

        if (existingIndex >= 0) {
          contributions[existingIndex] = savedContribution;
        } else {
          contributions.push(savedContribution);
        }

        return {
          ...chapter,
          contributions,
          currentUserContribution: savedContribution
        };
      });

      return savedContribution;
    } catch (error) {
      console.error('❌ Erreur sauvegarde contribution:', error);
      throw error;
    }
  };

  const handleFinalizeContribution = async (chapterId) => {
    try {
      const currentChapter = chapters.find((chapter) => chapter.id === chapterId);
      if (currentChapter?.isChapterClosed) {
        throw new Error('Ce chapitre est verrouille apres validation finale.');
      }

      const existingContribution = currentChapter?.currentUserContribution;

      if (!existingContribution?.id) {
        throw new Error('Contribution introuvable');
      }

      const { data, error } = await supabase
        .from('contributions')
        .update({ is_finalized: true })
        .eq('id', existingContribution.id)
        .select()
        .single();

      if (error) throw error;

      updateChapterInState(chapterId, (chapter) => {
        const contributions = Array.isArray(chapter.contributions) ? [...chapter.contributions] : [];
        const existingIndex = contributions.findIndex((contribution) => contribution.id === data.id);

        if (existingIndex >= 0) {
          contributions[existingIndex] = data;
        }

        return {
          ...chapter,
          contributions,
          currentUserContribution: data
        };
      });

      return data;
    } catch (error) {
      console.error('❌ Erreur finalisation contribution:', error);
      throw error;
    }
  };

  const handleGenerateChapterDraft = async (chapterId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/chapters/${chapterId}/generate-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la generation du chapitre');
      }

      mergeContributionIntoChapterState(chapterId, data.draftContribution);
      return data;
    } catch (error) {
      console.error('Erreur generation chapitre:', error);
      throw error;
    }
  };

  const handleSaveChapterDraft = async (chapterId, html) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/chapters/${chapterId}/save-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ html })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde du chapitre');
      }

      mergeContributionIntoChapterState(chapterId, data.draftContribution);
      return data;
    } catch (error) {
      console.error('Erreur sauvegarde chapitre:', error);
      throw error;
    }
  };

  const handleFinalizeChapterDraft = async (chapterId, html) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/chapters/${chapterId}/finalize-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ html })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la validation finale');
      }

      mergeContributionIntoChapterState(chapterId, data.draftContribution);
      mergeContributionIntoChapterState(chapterId, data.workflowContribution);
      return data;
    } catch (error) {
      console.error('Erreur validation finale chapitre:', error);
      throw error;
    }
  };

  const handleDeleteChapter = async (chapterId) => {
    try {
      const { error } = await supabase
        .from('chapters')
        .delete()
        .eq('id', chapterId);

      if (error) throw error;

      const remainingChapters = chapters.filter((chapter) => chapter.id !== chapterId);
      const reorderUpdates = remainingChapters
        .map((chapter, index) => ({
          id: chapter.id,
          updates: {
            order_index: index,
            ...(index === 0 ? { title: 'Introduction' } : {})
          },
          shouldUpdate:
            chapter.order_index !== index ||
            (index === 0 && chapter.title !== 'Introduction')
        }))
        .filter((chapter) => chapter.shouldUpdate);

      if (reorderUpdates.length > 0) {
        await Promise.all(
          reorderUpdates.map(({ id, updates }) =>
            supabase
              .from('chapters')
              .update(updates)
              .eq('id', id)
          )
        );
      }

      setChapters(normalizeChaptersForState(remainingChapters));
      const syncedPages = Math.max(8, remainingChapters.length * 8);
      if (Number(book?.pages || 0) !== syncedPages) {
        await handleUpdateBook({ pages: syncedPages });
      }
      showPageNotice('Chapitre supprimé.', 'success');
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      showPageNotice('Erreur lors de la suppression du chapitre.', 'error');
    }
  };

  const handleUpdateBook = async (updates) => {
    try {
      const { error } = await supabase
        .from('books')
        .update(updates)
        .eq('id', bookId);

      if (error) throw error;
      setBook(prev => ({ ...prev, ...updates }));
      return true;
    } catch (error) {
      console.error('❌ Erreur mise à jour livre:', error);
      throw error;
    }
  };

  const setBookLifecycleStatus = async (
    nextStatus,
    { silent = false, onlyForward = false } = {}
  ) => {
    const normalizedStatus = normalizeBookLifecycleStatus(nextStatus);
    if (!normalizedStatus || !book) {
      return false;
    }

    const currentStatus = getBookLifecycleStatusFromBook(book);
    if (currentStatus === normalizedStatus) {
      return true;
    }

    if (onlyForward && !isBookLifecycleAtLeast(normalizedStatus, currentStatus)) {
      return false;
    }

    const currentCoverConfig = (book?.cover_config && typeof book.cover_config === 'object')
      ? book.cover_config
      : {};
    const nowIso = new Date().toISOString();
    const nextCoverConfig = {
      ...currentCoverConfig,
      lifecycleStatus: normalizedStatus,
      lifecycleUpdatedAt: nowIso
    };

    if (normalizedStatus === 'preview_available' && !nextCoverConfig.previewAvailableAt) {
      nextCoverConfig.previewAvailableAt = nowIso;
    }
    if (normalizedStatus === 'finalized' && !nextCoverConfig.finalPdfReadyAt) {
      nextCoverConfig.finalPdfReadyAt = nowIso;
    }
    if (normalizedStatus === 'sent_to_printer' && !nextCoverConfig.sentToPrinterAt) {
      nextCoverConfig.sentToPrinterAt = nowIso;
    }
    if (normalizedStatus === 'printed' && !nextCoverConfig.printedAt) {
      nextCoverConfig.printedAt = nowIso;
    }
    if (normalizedStatus === 'shipped' && !nextCoverConfig.shippedAt) {
      nextCoverConfig.shippedAt = nowIso;
    }

    setUpdatingLifecycleStatus(normalizedStatus);
    try {
      await handleUpdateBook({
        cover_config: nextCoverConfig
      });

      if (!silent) {
        showPageNotice(
          `Etat du livre: ${getBookLifecycleConfig(normalizedStatus).label}.`,
          'success'
        );
      }
      return true;
    } catch (error) {
      if (!silent) {
        showPageNotice('Impossible de mettre a jour l etat du livre.', 'error');
      }
      return false;
    } finally {
      setUpdatingLifecycleStatus('');
    }
  };

  const getAutomaticLifecycleStatus = () => {
    if (!book) {
      return 'editing';
    }

    let inferredStatus = areAllChaptersValidated ? 'preview_available' : 'editing';
    if (pdfExportJob?.status === 'ready' || String(book?.statut || '').toLowerCase() === 'termine') {
      inferredStatus = 'finalized';
    }

    const persistedStatus = getBookLifecycleStatusFromBook(book);
    return isBookLifecycleAtLeast(persistedStatus, inferredStatus)
      ? persistedStatus
      : inferredStatus;
  };

  useEffect(() => {
    if (!book || updatingLifecycleStatus) {
      return;
    }

    const currentStatus = getBookLifecycleStatusFromBook(book);
    const automaticStatus = getAutomaticLifecycleStatus();
    if (currentStatus !== automaticStatus) {
      setBookLifecycleStatus(automaticStatus, { silent: true, onlyForward: true });
    }
  }, [
    book?.id,
    book?.statut,
    book?.cover_config?.lifecycleStatus,
    areAllChaptersValidated,
    pdfExportJob?.status,
    updatingLifecycleStatus
  ]);

  const handleGenerateDraft = async () => {
    try {
      if (!chapters.length || chapters.some((chapter) => chapter?.chapterDraft?.status !== 'validated')) {
        throw new Error('Generez et validez tous les chapitres avant l apercu global');
      }

      setGeneratingDraft(true);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/generate-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l apercu du livre');
      }

      setDraftPreview(data);
      dismissPageNotice();
      await setBookLifecycleStatus('preview_available', { silent: true, onlyForward: true });
    } catch (error) {
      console.error('Erreur apercu livre:', error);
      showPageNotice(error.message || 'Erreur lors de l apercu du livre', 'error');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const fetchPdfExportStatus = async (jobId) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      throw new Error('Session introuvable');
    }

    const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${jobId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Impossible de recuperer le statut export');
    }

    return data;
  };

  const startPdfExportPolling = (jobId) => {
    stopPdfExportPolling();

    const pollStatus = async () => {
      try {
        const nextStatus = await fetchPdfExportStatus(jobId);
        setPdfExportJob(nextStatus);

        if (nextStatus.status === 'ready') {
          stopPdfExportPolling();
          await setBookLifecycleStatus('finalized', { silent: true, onlyForward: true });
          showPageNotice('PDF final pret. Vous pouvez telecharger interieur et couverture.', 'success');
        } else if (nextStatus.status === 'failed') {
          stopPdfExportPolling();
          showPageNotice(nextStatus.error || 'La generation PDF a echoue.', 'error');
        }
      } catch (error) {
        stopPdfExportPolling();
        showPageNotice(error.message || 'Erreur lors du suivi de generation PDF.', 'error');
      }
    };

    pollStatus();
    pdfExportPollRef.current = setInterval(pollStatus, 2500);
  };

  const handleStartPdfExport = async () => {
    try {
      if (!chapters.length || chapters.some((chapter) => chapter?.chapterDraft?.status !== 'validated')) {
        throw new Error('Validez tous les chapitres avant la generation PDF finale');
      }

      setStartingPdfExport(true);
      stopPdfExportPolling();

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(`${getApiBaseUrl()}/books/${bookId}/export-final-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du lancement export PDF');
      }

      setPdfExportJob(data);
      showPageNotice('Generation PDF finale lancee. Nous preparons les fichiers imprimeur...', 'info');
      startPdfExportPolling(data.jobId);
    } catch (error) {
      showPageNotice(error.message || 'Erreur lors de la generation PDF finale.', 'error');
    } finally {
      setStartingPdfExport(false);
    }
  };

  const handleDownloadPdfFile = async (kind) => {
    if (!pdfExportJob?.jobId) {
      return;
    }

    try {
      setDownloadingPdfKind(kind);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Session introuvable');
      }

      const response = await fetch(
        `${getApiBaseUrl()}/books/${bookId}/export-final-pdf/${pdfExportJob.jobId}/download/${kind}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Erreur lors du telechargement du PDF');
      }

      const blob = await response.blob();
      const fallbackFileName = kind === 'cover' ? 'couverture.pdf' : 'interieur.pdf';
      const fileName = parseFileNameFromDisposition(
        response.headers.get('content-disposition'),
        fallbackFileName
      );

      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      showPageNotice(error.message || 'Erreur lors du telechargement du PDF.', 'error');
    } finally {
      setDownloadingPdfKind('');
    }
  };

  const focusPdfPanel = () => {
    if (pdfPanelRef.current) {
      pdfPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleUpdateChaptersFromPages = async (newPages) => {
    try {
      const maxPages = MAX_CHAPTERS * 8;
      const pagesToPersist = Math.min(newPages, maxPages);
      const newChaptersCount = Math.min(MAX_CHAPTERS, Math.floor(pagesToPersist / 8));
      const currentChaptersCount = chapters.length;

      if (newPages > maxPages) {
        showPageNotice(`Le livre est limité à ${MAX_CHAPTERS} chapitres maximum.`, 'info');
      }

      if (newChaptersCount > currentChaptersCount) {
        const chaptersToAdd = newChaptersCount - currentChaptersCount;
        
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${getApiBaseUrl()}/ai/generate-chapters`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            eventType: book.event_type,
            style: book.style_narratif,
            count: chaptersToAdd,
            bookTitle: book.title,
            recipientName: book.recipient_name,
            recipientAge: book.recipient_age,
            recipientGender: book.recipient_gender,
            recipientNickname: '',
            recipientTrait: '',
            recipientAnecdote: '',
            additionalContext: book?.cover_config?.aiProjectBrief || ''
          })
        });

        const data = await response.json();
        
        if (response.ok) {
          const newChapters = data.chapters.map((ch, index) => ({
            book_id: bookId,
            title: currentChaptersCount === 0 && index === 0 ? 'Introduction' : ch.title,
            description: ch.description || `Chapitre ${currentChaptersCount + index + 1}`,
            order_index: currentChaptersCount + index,
            questions_ia: [
              `Quel est votre plus beau souvenir lié à "${ch.title}" ?`,
              `Que retenez-vous de ce moment ?`,
              `Quelle émotion cela évoque-t-il ?`,
              `Un détail qui vous a marqué ?`
            ]
          }));

          const { error: insertError } = await supabase
            .from('chapters')
            .insert(newChapters);

          if (insertError) throw insertError;
        }
      } else if (newChaptersCount < currentChaptersCount) {
        const chaptersToRemove = currentChaptersCount - newChaptersCount;
        const chaptersToDelete = chapters.slice(-chaptersToRemove).map(ch => ch.id);

        const { error: deleteError } = await supabase
          .from('chapters')
          .delete()
          .in('id', chaptersToDelete);

        if (deleteError) throw deleteError;
      }
      
      await loadBookAndChapters();
      await handleUpdateBook({ pages: pagesToPersist });
      
    } catch (error) {
      console.error('❌ Erreur mise à jour chapitres:', error);
      showPageNotice('Erreur lors de la mise à jour des chapitres.', 'error');
    }
  };

  if (loading) return <Loading message="Chargement du livre..." />;
  if (!book) return <div>Livre non trouvé</div>;

  const isSoloMode = getSoloMode(book);
  const visibleGuideSteps = isSoloMode
    ? WRITING_GUIDE_STEPS.filter((step) => step.title !== 'Invitations')
    : WRITING_GUIDE_STEPS;
  const bookLifecycleStatus = getAutomaticLifecycleStatus();
  const bookLifecycleConfig = getBookLifecycleConfig(bookLifecycleStatus);
  const lifecycleUpdatedAt = book?.cover_config?.lifecycleUpdatedAt;
  const lifecycleUpdatedLabel = lifecycleUpdatedAt
    ? new Date(lifecycleUpdatedAt).toLocaleString('fr-FR')
    : '';
  const bookMetaItems = [
    { label: 'Finition', value: book.finition || 'Classique' },
    { label: 'Papier', value: book.papier || 'Mat' },
    { label: 'Voix', value: book.style_narratif || 'Factuel' }
  ];
  const pdfExportStatusLabel = (() => {
    switch (pdfExportJob?.status) {
      case 'queued':
        return 'File en attente';
      case 'rendering':
        return 'Generation en cours';
      case 'ready':
        return 'Pret au telechargement';
      case 'failed':
        return 'Generation en erreur';
      default:
        return 'Non lance';
    }
  })();
  const isPdfReady = pdfExportJob?.status === 'ready';
  function scrollToMainContent() {
    if (typeof window === 'undefined' || !mainContentRef.current) {
      return;
    }

    const top = mainContentRef.current.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({
      top: Math.max(top, 0),
      behavior: 'smooth'
    });
  }
  const forceOpenEditionGalleryDom = () => {
    if (typeof document === 'undefined') {
      return;
    }

    const chapterTab = document.querySelector('button.tab[data-tab="chapitres"]');
    if (chapterTab instanceof HTMLButtonElement) {
      chapterTab.click();
    }

    const backToStructureButton = document.querySelector('button.sidebar-gallery-btn');
    if (backToStructureButton instanceof HTMLButtonElement) {
      backToStructureButton.click();
    }

    const galleryLayoutButton = document.querySelector('button.edition-layout-btn[data-layout="gallery"]');
    if (galleryLayoutButton instanceof HTMLButtonElement) {
      galleryLayoutButton.click();
    }
  };
  const openEditionGallery = () => {
    setActiveTab('chapitres');
    setEditionGalleryRequest((previous) => previous + 1);

    const nextParams = new URLSearchParams(location.search || '');
    nextParams.set('tab', 'chapitres');
    nextParams.set('view', 'gallery');
    nextParams.set('reset', String(Date.now()));
    navigate({
      pathname: `/book/${bookId}`,
      search: `?${nextParams.toString()}`
    });

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(forceOpenEditionGalleryDom);
      window.setTimeout(forceOpenEditionGalleryDom, 0);
      window.setTimeout(scrollToMainContent, 120);
    }
  };
  const currentLifecycleAction = (() => {
    if (bookLifecycleStatus === 'editing') {
      return {
        label: 'Continuer l edition',
        note: 'Aller aux chapitres',
        onClick: openEditionGallery,
        disabled: false
      };
    }

    if (bookLifecycleStatus === 'preview_available') {
      return {
        label: generatingDraft ? 'Generation...' : 'Ouvrir l apercu',
        note: 'Apercu assemble du livre',
        onClick: handleGenerateDraft,
        disabled: generatingDraft || !areAllChaptersValidated
      };
    }

    if (bookLifecycleStatus === 'finalized') {
      if (isPdfReady) {
        return {
          label: 'Voir les PDF finaux',
          note: 'Aller au panneau PDF',
          onClick: focusPdfPanel,
          disabled: false
        };
      }

      return {
        label: startingPdfExport ? 'Lancement...' : 'Lancer PDF imprimeur',
        note: pdfExportStatusLabel,
        onClick: handleStartPdfExport,
        disabled: startingPdfExport || !areAllChaptersValidated
      };
    }

    if (bookLifecycleStatus === 'sent_to_printer') {
      return {
        label: updatingLifecycleStatus === 'printed' ? 'Mise a jour...' : 'Marquer imprime',
        note: 'Suivi de production',
        onClick: () => setBookLifecycleStatus('printed'),
        disabled: Boolean(updatingLifecycleStatus)
      };
    }

    if (bookLifecycleStatus === 'printed') {
      return {
        label: updatingLifecycleStatus === 'shipped' ? 'Mise a jour...' : 'Marquer envoye',
        note: 'Suivi de livraison',
        onClick: () => setBookLifecycleStatus('shipped'),
        disabled: Boolean(updatingLifecycleStatus)
      };
    }

    return {
      label: 'Livre envoye',
      note: 'Workflow termine',
      onClick: () => {},
      disabled: true
    };
  })();

  return (
    <div className="book-container">
      <div className="book-header">
        <div className="book-header-content">
          <div className="book-title">
            <div className="book-header-identity">
            <div className="book-eyebrow">{bookLifecycleConfig.label}</div>
            <h1>{book.title}</h1>
            <div className="book-meta">
              <div className="book-meta-grid">
                {bookMetaItems.map((item) => (
                  <div key={item.label} className="book-meta-pill">
                    <span className="book-meta-label">{item.label}</span>
                    <span className="book-meta-value">{item.value}</span>
                  </div>
                ))}
              </div>
              <span>📖 {book.finition || 'Classique'}</span>
              <span>📄 {book.papier || 'Mat'}</span>
              <span>✍️ {book.style_narratif || 'Factuel'}</span>
            </div>
            </div>
            <div className="book-lifecycle-panel">
              <div className="book-lifecycle-top">
                <span className={`book-lifecycle-chip ${bookLifecycleConfig.tone}`}>
                  {bookLifecycleConfig.label}
                </span>
                {lifecycleUpdatedLabel && (
                  <span className="book-lifecycle-updated">
                    Mis a jour: {lifecycleUpdatedLabel}
                  </span>
                )}
              </div>
              <div className="book-lifecycle-line">
                {BOOK_LIFECYCLE_ORDER.map((statusKey, index) => {
                  const config = getBookLifecycleConfig(statusKey);
                  const isCurrent = statusKey === bookLifecycleStatus;
                  const isDone = !isCurrent && isBookLifecycleAtLeast(bookLifecycleStatus, statusKey);
                  const isUpcoming = !isCurrent && !isDone;
                  const isEditingStep = statusKey === 'editing';
                  const nextStatusKey = BOOK_LIFECYCLE_ORDER[index + 1] || null;
                  const isConnectorDone = Boolean(
                    nextStatusKey && isBookLifecycleAtLeast(bookLifecycleStatus, nextStatusKey)
                  );
                  const isConnectorCurrent = Boolean(nextStatusKey && isCurrent && !isConnectorDone);
                  const lifecycleStepClick = isCurrent
                    ? (isEditingStep ? openEditionGallery : currentLifecycleAction.onClick)
                    : undefined;
                  return (
                    <React.Fragment key={statusKey}>
                      <button
                        type="button"
                      className={`book-lifecycle-step ${isCurrent ? 'is-current' : ''} ${isDone ? 'is-done' : ''} ${isUpcoming ? 'is-upcoming' : ''}`}
                      onClick={lifecycleStepClick}
                      disabled={!isCurrent || currentLifecycleAction.disabled}
                      title={isCurrent ? `${config.label} - ${currentLifecycleAction.note}` : config.label}
                    >
                      <span className="book-lifecycle-marker">{isDone ? '✓' : index + 1}</span>
                      <span className="book-lifecycle-label">{config.shortLabel}</span>
                    </button>
                    {nextStatusKey && (
                      <span className={`book-lifecycle-connector ${isConnectorDone ? 'is-done' : ''} ${isConnectorCurrent ? 'is-current' : ''}`} />
                    )}
                    </React.Fragment>
                  );
                })}
              </div>
              <button
                type="button"
                className="book-lifecycle-current-action"
                onClick={bookLifecycleStatus === 'editing' ? openEditionGallery : currentLifecycleAction.onClick}
                disabled={currentLifecycleAction.disabled}
              >
                <span className="book-lifecycle-current-label">{currentLifecycleAction.label}</span>
                <span className="book-lifecycle-current-note">{currentLifecycleAction.note}</span>
              </button>
            </div>
          </div>
          <div className="book-header-actions">
            <div className="book-header-actions-top">
              <Link to="/dashboard" className="book-dashboard-mini" title="Tableau de bord">
                <span className="book-dashboard-mini-icon">📊</span>
              </Link>
            </div>
            <div className="book-header-actions-row is-primary">
          <button
            type="button"
            className="book-header-btn book-header-btn-primary book-generate-btn"
            onClick={handleGenerateDraft}
            disabled={generatingDraft || !areAllChaptersValidated}
            title={areAllChaptersValidated
              ? 'Afficher l apercu assemble du livre'
              : 'Generez et validez chaque chapitre avant l apercu global'}
          >
            <span className="book-action-label">
              {generatingDraft ? 'Generation...' : 'Apercu du livre'}
            </span>
            <span className="book-action-note">Apercu assemble du livre</span>
          </button>
          <button
            type="button"
            className="book-header-btn book-header-btn-primary book-export-btn"
            onClick={handleStartPdfExport}
            disabled={startingPdfExport || !areAllChaptersValidated}
            title={areAllChaptersValidated
              ? 'Lancer la generation des PDF finaux imprimeur'
              : 'Validez tous les chapitres avant la generation PDF finale'}
          >
            <span className="book-action-label">
              {startingPdfExport ? 'Lancement...' : 'PDF final imprimeur'}
            </span>
            <span className="book-action-note">{pdfExportStatusLabel}</span>
          </button>
            </div>
            <div className="book-header-actions-row is-secondary">
          <Link to="/dashboard" className="book-dashboard-bottom-link">
            Tableau de bord
            <span>📊</span>
            
          </Link>
          </div>
        </div>
      </div>
      </div>

      <div className="tabs-container">
        <div className="tabs-toolbar">
          <div className="tabs">
            <button
              data-tab="chapitres"
              onClick={() => setActiveTab('chapitres')}
              className={`tab ${activeTab === 'chapitres' ? 'active' : ''}`}
              title={TAB_HELP.chapitres}
              aria-label={`Edition du livre. ${TAB_HELP.chapitres}`}
            >
              <span>📑</span>
              Edition du livre
              <span className="tab-help" aria-hidden="true">?</span>
            </button>
            <button
              data-tab="contributeurs"
              onClick={() => setActiveTab('contributeurs')}
              className={`tab ${activeTab === 'contributeurs' ? 'active' : ''}`}
              title={TAB_HELP.contributeurs}
              aria-label={`Contributeurs. ${TAB_HELP.contributeurs}`}
            >
              <span>👥</span>
              Contributeurs
              <span className="tab-help" aria-hidden="true">?</span>
            </button>
            <button
              data-tab="config"
              onClick={() => setActiveTab('config')}
              className={`tab ${activeTab === 'config' ? 'active' : ''}`}
              title={TAB_HELP.config}
              aria-label={`Configuration. ${TAB_HELP.config}`}
            >
              <span>⚙️</span>
              Configuration
              <span className="tab-help" aria-hidden="true">?</span>
            </button>
          </div>

          <div className="guide-toggle-wrap">
            <button
              type="button"
              className={`guide-toggle-btn ${isGuideOpen ? 'active' : ''}`}
              onClick={() => setIsGuideOpen((prev) => !prev)}
              aria-expanded={isGuideOpen}
              aria-controls="book-writing-guide"
              title="Guide rapide"
            >
              <span className="guide-toggle-question" aria-hidden="true">?</span>
              <span className="guide-toggle-label">Guide rapide</span>
            </button>
          </div>
        </div>

        {isGuideOpen && (
          <div id="book-writing-guide" className="writing-guide-popover is-expanded">
            <div className="writing-guide-top">
              <div>
                <div className="writing-guide-header">Guide rapide</div>
                <div className="writing-guide-subtitle">
                  Parcours recommande pour avancer vite et proprement.
                </div>
              </div>
              <button
                type="button"
                className="writing-guide-close"
                onClick={() => setIsGuideOpen(false)}
                aria-label="Fermer le guide"
              >
                x
              </button>
            </div>

            <div className="writing-guide-list">
              {visibleGuideSteps.map((step, index) => (
                <div key={step.title} className="writing-guide-item">
                  <span className="writing-guide-index">{index + 1}</span>
                  <div className="writing-guide-copy">
                    <span className="writing-guide-label">{step.title}</span>
                    <span className="writing-guide-text">{step.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div ref={mainContentRef} className="book-main-content">
        {pageNotice?.message && (
          <div className={`luxe-feedback-banner is-${pageNotice.type || 'info'}`}>
            <span>{pageNotice.message}</span>
            <button
              type="button"
              className="luxe-feedback-close"
              onClick={dismissPageNotice}
              aria-label="Fermer le message"
            >
              x
            </button>
          </div>
        )}

        {pdfExportJob?.jobId && (
          <div ref={pdfPanelRef} className={`book-pdf-panel is-${pdfExportJob.status || 'queued'}`}>
            <div className="book-pdf-head">
              <div className="book-pdf-title">Export PDF final</div>
              <div className="book-pdf-status">{pdfExportStatusLabel}</div>
            </div>
            <div className="book-pdf-meta">
              Job: {pdfExportJob.jobId}
              {pdfExportJob.renderer && (
                <span> | Moteur: {pdfExportJob.renderer === 'browser' ? 'rendu navigateur fidele' : 'fallback simplifie'}</span>
              )}
              {pdfExportJob.completedAt && (
                <span> | Termine le {new Date(pdfExportJob.completedAt).toLocaleString('fr-FR')}</span>
              )}
            </div>
            {pdfExportJob.error && (
              <div className="book-pdf-error">{pdfExportJob.error}</div>
            )}
            {isPdfReady && (
              <div className="book-pdf-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleDownloadPdfFile('interior')}
                  disabled={downloadingPdfKind === 'interior'}
                >
                  {downloadingPdfKind === 'interior' ? 'Telechargement...' : 'Telecharger interieur.pdf'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleDownloadPdfFile('cover')}
                  disabled={downloadingPdfKind === 'cover'}
                >
                  {downloadingPdfKind === 'cover' ? 'Telechargement...' : 'Telecharger couverture.pdf'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'chapitres' && (
          <ChapterListLuxe
            key={`edition-gallery-${editionGalleryRequest}`}
            chapters={chapters}
            bookId={bookId}
            book={book}
            onUpdateChapter={handleUpdateChapter}
            onSaveContribution={handleSaveContribution}
            onFinalizeContribution={handleFinalizeContribution}
            onGenerateChapterDraft={handleGenerateChapterDraft}
            onSaveChapterDraft={handleSaveChapterDraft}
            onFinalizeChapterDraft={handleFinalizeChapterDraft}
            onDeleteChapter={handleDeleteChapter}
            onUpdateBook={handleUpdateBook}
            editionGalleryRequest={editionGalleryRequest}
          />
        )}
        
        {activeTab === 'contributeurs' && (
          <ContributorsTabLuxe
            bookId={bookId}
            book={book}
            onUpdateBook={handleUpdateBook}
          />
        )}
        
        {activeTab === 'config' && (
          <BookConfigLuxe 
            book={book} 
            onUpdateBook={handleUpdateBook}
            chaptersCount={chapters.length}
            onPagesChange={handleUpdateChaptersFromPages}
          />
        )}

      </div>

      {draftPreview && (
        <div className="modal-overlay">
          <div className="modal-content book-draft-modal">
            <div className="book-draft-modal-header">
              <div>
                <div className="label-gold">Apercu HTML grand format</div>
                <h3 className="book-draft-modal-title">Apercu du livre</h3>
                {draftPreview.generatedAt && (
                  <div className="book-draft-modal-meta">
                    Genere le {new Date(draftPreview.generatedAt).toLocaleString('fr-FR')}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setDraftPreview(null)}
              >
                x
              </button>
            </div>

            <div className="book-draft-modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleGenerateDraft}
                disabled={generatingDraft}
              >
                {generatingDraft ? 'Generation...' : 'Actualiser l apercu'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDraftPreview(null)}
              >
                Fermer
              </button>
            </div>

            <div
              className="book-draft-preview"
              dangerouslySetInnerHTML={{ __html: draftPreview.html }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BookPageLuxe;
