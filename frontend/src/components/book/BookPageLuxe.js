// C:\Users\USER\bookfete\frontend\src\components\book\BookPageLuxe.js
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
// ON GARDE LES ANCIENS COMPOSANTS POUR L'INSTANT
import ChapterList from './ChapterList';  // Ancienne version
import BookConfig from './BookConfig';    // Ancienne version
import ContributorsTab from './contributors/ContributorsTab'; // Ancienne version
import Loading from '../common/Loading';
import '../../styles/luxe-theme.css';
import './BookLuxe.css';  


const BookPageLuxe = () => {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chapitres');

  useEffect(() => {
    loadBookAndChapters();
  }, [bookId]);

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

      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select(`
          *,
          contributions:contributions(count)
        `)
        .eq('book_id', bookId)
        .order('order_index', { ascending: true });

      if (chaptersError) throw chaptersError;
      setChapters(chaptersData || []);

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateChapter = async (chapterId, updates) => {
    try {
      const { error } = await supabase
        .from('chapters')
        .update(updates)
        .eq('id', chapterId);

      if (error) throw error;
      setChapters(prev => prev.map(ch => ch.id === chapterId ? { ...ch, ...updates } : ch));
    } catch (error) {
      console.error('❌ Erreur mise à jour:', error);
      alert('Erreur lors de la mise à jour');
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
      setChapters(prev => [...prev, data]);
    } catch (error) {
      console.error('❌ Erreur ajout:', error);
      alert('Erreur lors de l\'ajout du chapitre');
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

  if (loading) return <Loading message="Chargement du livre..." />;
  if (!book) return <div>Livre non trouvé</div>;

  return (
    <div className="book-container">
      {/* En-tête du livre */}
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
          
          {/* Lien vers tableau de bord */}
          <Link to="/dashboard" className="dashboard-link">
            <span>📊</span>
            Tableau de bord
          </Link>
        </div>
      </div>

      {/* Onglets */}
      <div className="tabs-container">
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
      </div>

      {/* Contenu principal */}
      <div className="book-main-content">
        {activeTab === 'chapitres' && (
          <ChapterList
            chapters={chapters}
            bookId={bookId}
            book={book}
            onUpdateChapter={handleUpdateChapter}
            onDeleteChapter={handleDeleteChapter}
            onAddChapter={handleAddChapter}
            onUpdateBook={handleUpdateBook}
          />
        )}
        
        {activeTab === 'contributeurs' && (
          <ContributorsTab bookId={bookId} />
        )}
        
        {activeTab === 'config' && (
          <BookConfig 
            book={book} 
            onUpdateBook={handleUpdateBook}
            chaptersCount={chapters.length}
          />
        )}
      </div>
    </div>
  );
};

export default BookPageLuxe;