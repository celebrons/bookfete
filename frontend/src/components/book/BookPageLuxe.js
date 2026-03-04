// C:\Users\USER\bookfete\frontend\src\components\book\BookPageLuxe.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import ChapterListLuxe from './ChapterListLuxe';
import BookConfigLuxe from './BookConfigLuxe';
import ContributorsTabLuxe from './contributors/ContributorsTabLuxe';
import Loading from '../common/Loading';
import '../../styles/luxe-theme.css';
import './BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
const CHAPTER_DRAFT_EMAIL = '__chapter_draft__@system.local';
const MAX_CHAPTERS = 12;
const WRITING_GUIDE_STEPS = [
  {
    title: 'Questions',
    text: 'Validez les questions du chapitre avant d\'ouvrir la suite du workflow.'
  },
  {
    title: 'Contribution',
    text: 'Ajoutez votre texte et vos photos pour debloquer les invitations.'
  },
  {
    title: 'Invitations',
    text: 'Invitez, relancez puis fermez les contributions quand tout est pret.'
  },
  {
    title: 'Configuration',
    text: 'Ajustez les options du livre et le nombre de pages depuis l\'onglet dedie.'
  }
];

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
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chapitres');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftPreview, setDraftPreview] = useState(null);
  const [user, setUser] = useState(null);
  const [pageNotice, setPageNotice] = useState(null);
  const chapterIdsRef = useRef(new Set());

  useEffect(() => {
    getUser();
  }, []);

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
    } catch (error) {
      console.error('❌ Erreur mise à jour livre:', error);
    }
  };

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
    } catch (error) {
      console.error('Erreur apercu livre:', error);
      showPageNotice(error.message || 'Erreur lors de l apercu du livre', 'error');
    } finally {
      setGeneratingDraft(false);
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
            projectBrief: book?.cover_config?.aiProjectBrief || ''
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
  const allChaptersDraftValidated = chapters.length > 0 && chapters.every(
    (chapter) => chapter?.chapterDraft?.status === 'validated'
  );
  const visibleGuideSteps = isSoloMode
    ? WRITING_GUIDE_STEPS.filter((step) => step.title !== 'Invitations')
    : WRITING_GUIDE_STEPS;

  return (
    <div className="book-container">
      <div className="book-header">
        <div className="book-header-content">
          <div className="book-title">
            <h1>{book.title}</h1>
            <div className="book-meta">
              <span>📖 {book.finition || 'Classique'}</span>
              <span>📄 {book.papier || 'Mat'}</span>
              <span>✍️ {book.style_narratif || 'Factuel'}</span>
            </div>
          </div>
          <div className="book-header-actions">
          <button
            type="button"
            className="btn btn-outline book-generate-btn"
            onClick={handleGenerateDraft}
            disabled={generatingDraft || !allChaptersDraftValidated}
            title={allChaptersDraftValidated
              ? 'Afficher l apercu assemble du livre'
              : 'Generez et validez chaque chapitre avant l apercu global'}
          >
            {generatingDraft ? 'Generation...' : 'Apercu du livre'}
          </button>
          <Link to="/dashboard" className="dashboard-link">
            <span>📊</span>
            Tableau de bord
          </Link>
          </div>
        </div>
      </div>

      <div className="tabs-container">
        <div className="tabs-toolbar">
          <div className="tabs">
            <button
              onClick={() => setActiveTab('chapitres')}
              className={`tab ${activeTab === 'chapitres' ? 'active' : ''}`}
            >
              <span>📑</span>
              Chapitres
            </button>
            <button
              onClick={() => setActiveTab('contributeurs')}
              className={`tab ${activeTab === 'contributeurs' ? 'active' : ''}`}
            >
              <span>👥</span>
              Contributeurs
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`tab ${activeTab === 'config' ? 'active' : ''}`}
            >
              <span>⚙️</span>
              Configuration
            </button>
          </div>

          <div className="guide-toggle-wrap">
            <button
              type="button"
              className={`guide-toggle-btn ${isGuideOpen ? 'active' : ''}`}
              onClick={() => setIsGuideOpen((prev) => !prev)}
            >
              <span>Guide rapide</span>
              <span className="guide-toggle-icon">{isGuideOpen ? '-' : '+'}</span>
            </button>

            {isGuideOpen && (
              <div className="writing-guide-popover">
                <div className="writing-guide-top">
                  <div className="writing-guide-header">Guide rapide</div>
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
                  {visibleGuideSteps.map((step) => (
                    <div key={step.title} className="writing-guide-item">
                      <span className="writing-guide-label">{step.title}</span>
                      <span className="writing-guide-text">{step.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="book-main-content">
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

        {activeTab === 'chapitres' && (
          <ChapterListLuxe
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
