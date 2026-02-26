// C:\Users\USER\bookfete\frontend\src\components\book\BookPage.js
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import ChapterList from './ChapterList';
import BookConfig from './BookConfig';
import ContributorsTab from './contributors/ContributorsTab';
import Loading from '../common/Loading';

const BookPage = () => {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chapitres');

  useEffect(() => {
    console.log('📚 BookPage - Chargement du livre ID:', bookId);
    loadBookAndChapters();
  }, [bookId]);

  const loadBookAndChapters = async () => {
    try {
      setLoading(true);
      
      console.log('🔍 BookPage - Récupération du livre...');
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError) throw bookError;
      
      console.log('✅ BookPage - Livre chargé:', {
        id: bookData.id,
        title: bookData.title,
        recipient_name: bookData.recipient_name,
        recipient_age: bookData.recipient_age,
        recipient_gender: bookData.recipient_gender,
        event_type: bookData.event_type,
        style_narratif: bookData.style_narratif
      });
      
      setBook(bookData);

      console.log('🔍 BookPage - Récupération des chapitres...');
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select(`
          *,
          contributions:contributions(count)
        `)
        .eq('book_id', bookId)
        .order('order_index', { ascending: true });

      if (chaptersError) throw chaptersError;
      console.log(`✅ BookPage - ${chaptersData?.length || 0} chapitres chargés`);
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
  
  console.log('📦 BookPage - ENVOI à ChapterList:', {
  bookId: bookId,
  book: {
    title: book?.title,
    recipient_name: book?.recipient_name,
    recipient_age: book?.recipient_age,
    recipient_gender: book?.recipient_gender
  }
});

  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f5f5'
    }}>
      {/* En-tête du livre avec lien tableau de bord */}
      <div style={{
        background: 'white',
        padding: '1.5rem 2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '2rem'
      }}>
        <div style={{ 
          maxWidth: '1400px', 
          margin: '0 auto', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div>
            <h1 style={{ margin: '0 0 0.5rem' }}>{book.title}</h1>
            <div style={{ display: 'flex', gap: '1rem', color: '#666' }}>
              <span>📖 {book.finition || 'Classique'}</span>
              <span>📄 {book.papier || 'Mat'}</span>
              <span>✍️ {book.style_narratif || 'Factuel'}</span>
            </div>
          </div>
          
          <Link 
            to="/dashboard" 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.8rem 1.5rem',
              background: '#f8f9fa',
              color: '#764ba2',
              textDecoration: 'none',
              borderRadius: '8px',
              border: '1px solid #e9ecef',
              transition: 'all 0.2s',
              fontWeight: '500'
            }}
            onMouseEnter={(e) => e.target.style.background = '#f3e8ff'}
            onMouseLeave={(e) => e.target.style.background = '#f8f9fa'}
          >
            <span>📊</span>
            Tableau de bord
          </Link>
        </div>
      </div>

      {/* Onglets */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto 2rem',
        width: '100%',
        padding: '0 2rem'
      }}>
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid #e9ecef' }}>
          <button
            onClick={() => setActiveTab('chapitres')}
            style={{
              padding: '0.8rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'chapitres' ? '3px solid #764ba2' : '3px solid transparent',
              color: activeTab === 'chapitres' ? '#764ba2' : '#666',
              fontWeight: activeTab === 'chapitres' ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '1.1rem'
            }}
          >
            📑 Chapitres
          </button>
          <button
            onClick={() => setActiveTab('contributeurs')}
            style={{
              padding: '0.8rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'contributeurs' ? '3px solid #764ba2' : '3px solid transparent',
              color: activeTab === 'contributeurs' ? '#764ba2' : '#666',
              fontWeight: activeTab === 'contributeurs' ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '1.1rem'
            }}
          >
            👥 Contributeurs
          </button>
          <button
            onClick={() => setActiveTab('config')}
            style={{
              padding: '0.8rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'config' ? '3px solid #764ba2' : '3px solid transparent',
              color: activeTab === 'config' ? '#764ba2' : '#666',
              fontWeight: activeTab === 'config' ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '1.1rem'
            }}
          >
            ⚙️ Configuration
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      <div style={{
        flex: 1,
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
        padding: '0 2rem 2rem'
      }}>
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

export default BookPage;