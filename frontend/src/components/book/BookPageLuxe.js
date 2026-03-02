// C:\Users\USER\bookfete\frontend\src\components\book\BookPageLuxe.js
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import ChapterListLuxe from './ChapterListLuxe';
import BookConfigLuxe from './BookConfigLuxe';
import ContributorsTabLuxe from './contributors/ContributorsTabLuxe';
import Loading from '../common/Loading';
import '../../styles/luxe-theme.css';
import './BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';
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

const BookPageLuxe = () => {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chapitres');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    getUser();
  }, []);

  useEffect(() => {
    if (bookId && user) {
      loadBookAndChapters();
    }
  }, [bookId, user]);

  useEffect(() => {
    if (!bookId || !user) {
      return undefined;
    }

    const channel = supabase
      .channel(`book-page-${bookId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contributions' },
        () => {
          loadBookAndChapters();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chapter_invites' },
        () => {
          loadBookAndChapters();
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

  const decorateChapter = (chapter) => {
    const contributions = Array.isArray(chapter?.contributions) ? chapter.contributions : [];
    const chapterInvites = Array.isArray(chapter?.chapter_invites) ? chapter.chapter_invites : [];
    const stateContribution = contributions
      .filter((contribution) => contribution?.contributor_email === CHAPTER_STATE_EMAIL)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    const workflowState = stateContribution?.message || null;
    const visibleContributions = contributions.filter(
      (contribution) =>
        contribution.contributor_email !== user?.email &&
        contribution.contributor_email !== CHAPTER_STATE_EMAIL &&
        contribution.is_finalized !== false
    );
    const matchingContributions = contributions
      .filter((contribution) => contribution.contributor_email === user?.email)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const currentUserContribution = chapter?.currentUserContribution || matchingContributions[0] || null;

    return {
      ...chapter,
      workflowState,
      contributionsClosed: workflowState === 'contributions_closed' || workflowState === 'closed',
      isChapterClosed: workflowState === 'closed',
      currentUserContribution,
      hasContributed: Boolean(currentUserContribution),
      isFinalized: Boolean(currentUserContribution?.is_finalized),
      contributionsCount: visibleContributions.length,
      invitationsCount: Array.isArray(chapter?.chapter_invites)
        ? chapterInvites.length
        : chapter?.invitationsCount || 0
    };
  };

  const updateChapterInState = (chapterId, updater) => {
    setChapters((prevChapters) =>
      prevChapters.map((chapter) => {
        if (chapter.id !== chapterId) {
          return chapter;
        }

        const nextChapter = typeof updater === 'function'
          ? updater(chapter)
          : { ...chapter, ...updater };

        return decorateChapter(nextChapter);
      })
    );
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

  const loadBookAndChapters = async () => {
    try {
      setLoading(true);
      
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

      const chaptersWithStatus = chaptersData.map((chapter) => decorateChapter(chapter));

      setChapters(chaptersWithStatus || []);

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateChapter = async (chapterId, updates) => {
    try {
      const { status, ...chapterUpdates } = updates || {};

      if (status === 'contributions_closed' || status === 'closed') {
        await persistChapterWorkflowState(chapterId, status);

        if (Object.keys(chapterUpdates).length === 0) {
          return { workflowState: status };
        }
      }

      if (Object.keys(chapterUpdates).length === 0) {
        return null;
      }

      const { data, error } = await supabase
        .from('chapters')
        .update(chapterUpdates)
        .eq('id', chapterId)
        .select()
        .single();

      if (error) throw error;
      updateChapterInState(chapterId, (chapter) => ({ ...chapter, ...data }));
      return data;
    } catch (error) {
      console.error('❌ Erreur mise à jour:', error);
      alert('Erreur lors de la mise à jour');
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

  const handleDeleteChapter = async (chapterId) => {
    try {
      const { error } = await supabase
        .from('chapters')
        .delete()
        .eq('id', chapterId);

      if (error) throw error;
      setChapters(prev => prev.filter(ch => ch.id !== chapterId));
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleAddChapter = async () => {
    try {
      const newChapter = {
        book_id: bookId,
        title: `Nouveau chapitre ${chapters.length + 1}`,
        description: '',
        order_index: chapters.length,
        questions_ia: [
          "Quel est votre souvenir préféré ?",
          "Que retenez-vous de ce moment ?",
          "Quelle émotion cela évoque-t-il ?",
          "Un détail qui vous a marqué ?"
        ]
      };

      const { data, error } = await supabase
        .from('chapters')
        .insert([newChapter])
        .select()
        .single();

      if (error) throw error;
      const createdChapter = decorateChapter(data);
      setChapters((prev) => [...prev, createdChapter]);
      return createdChapter;
    } catch (error) {
      console.error('❌ Erreur ajout:', error);
      alert('Erreur lors de l\'ajout du chapitre');
      return null;
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

  const handleUpdateChaptersFromPages = async (newPages) => {
    try {
      const newChaptersCount = Math.floor(newPages / 8);
      const currentChaptersCount = chapters.length;

      if (newChaptersCount > currentChaptersCount) {
        const chaptersToAdd = newChaptersCount - currentChaptersCount;
        
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${process.env.REACT_APP_API_URL}/ai/generate-chapters`, {
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
            recipientGender: book.recipient_gender
          })
        });

        const data = await response.json();
        
        if (response.ok) {
          const newChapters = data.chapters.map((ch, index) => ({
            book_id: bookId,
            title: ch.title,
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
      await handleUpdateBook({ pages: newPages });
      
    } catch (error) {
      console.error('❌ Erreur mise à jour chapitres:', error);
      alert('Erreur lors de la mise à jour des chapitres');
    }
  };

  if (loading) return <Loading message="Chargement du livre..." />;
  if (!book) return <div>Livre non trouvé</div>;

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
          <Link to="/dashboard" className="dashboard-link">
            <span>📊</span>
            Tableau de bord
          </Link>
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
                  {WRITING_GUIDE_STEPS.map((step) => (
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
        {activeTab === 'chapitres' && (
          <ChapterListLuxe
            chapters={chapters}
            bookId={bookId}
            book={book}
            onUpdateChapter={handleUpdateChapter}
            onSaveContribution={handleSaveContribution}
            onFinalizeContribution={handleFinalizeContribution}
            onDeleteChapter={handleDeleteChapter}
            onAddChapter={handleAddChapter}
            onUpdateBook={handleUpdateBook}
          />
        )}
        
        {activeTab === 'contributeurs' && (
          <ContributorsTabLuxe bookId={bookId} />
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
    </div>
  );
};

export default BookPageLuxe;
