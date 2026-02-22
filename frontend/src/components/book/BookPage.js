// C:\Users\USER\bookfete\frontend\src\components\book\BookPage.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import ChapterList from './ChapterList';
import BookConfig from './BookConfig'; // ← À REMETTRE
import Loading from '../common/Loading';

const BookPage = () => {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chapitres'); // 'chapitres', 'config', 'apercu'

  useEffect(() => {
    loadBookAndChapters();
  }, [bookId]);

  const loadBookAndChapters = async () => {
    try {
      setLoading(true);
      
      // Charger le livre
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError) throw bookError;
      setBook(bookData);

      // Charger les chapitres avec le compteur de contributions
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

      // Mettre à jour l'état local
      setChapters(prev => prev.map(ch => 
        ch.id === chapterId ? { ...ch, ...updates } : ch
      ));

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

  if (!book) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Livre non trouvé</h2>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f5f5'
    }}>
      {/* En-tête du livre */}
      <div style={{
        background: 'white',
        padding: '1.5rem 2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '2rem'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 0.5rem' }}>{book.title}</h1>
          <div style={{ display: 'flex', gap: '1rem', color: '#666' }}>
            <span>📖 {book.finition || 'Classique'}</span>
            <span>📄 {book.papier || 'Mat'}</span>
            <span>✍️ {book.style_narratif || 'Factuel'}</span>
          </div>
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
          <button
            onClick={() => setActiveTab('apercu')}
            style={{
              padding: '0.8rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'apercu' ? '3px solid #764ba2' : '3px solid transparent',
              color: activeTab === 'apercu' ? '#764ba2' : '#666',
              fontWeight: activeTab === 'apercu' ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '1.1rem'
            }}
          >
            👁️ Aperçu
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
        
        {activeTab === 'config' && (
          <BookConfig
            book={book}
            onUpdateBook={handleUpdateBook}
          />
        )}
        
        {activeTab === 'apercu' && (
          <div style={{
            background: 'white',
            borderRadius: '10px',
            padding: '2rem',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            minHeight: '600px'
          }}>
            <h2 style={{ marginBottom: '2rem' }}>Aperçu du livre</h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2rem'
            }}>
              {/* Aperçu couverture */}
              <div>
                <h3 style={{ color: '#b8924a' }}>Couverture</h3>
                <div style={{
                  background: book.cover_config?.color || '#8B4513',
                  height: '200px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontFamily: book.cover_config?.font || 'Playfair Display',
                  padding: '1rem',
                  textAlign: 'center'
                }}>
                  {book.cover_config?.title || book.title}
                </div>
              </div>

              {/* Aperçu chapitres */}
              <div>
                <h3 style={{ color: '#764ba2' }}>Chapitres</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {chapters.slice(0, 3).map((ch, i) => (
                    <li key={ch.id} style={{
                      padding: '0.5rem',
                      borderBottom: '1px solid #eee'
                    }}>
                      {i+1}. {ch.title}
                    </li>
                  ))}
                  {chapters.length > 3 && (
                    <li style={{ padding: '0.5rem', color: '#999' }}>
                      ... et {chapters.length - 3} autres
                    </li>
                  )}
                </ul>
              </div>

              {/* Aperçu 4ème couverture */}
              <div style={{ gridColumn: 'span 2' }}>
                <h3 style={{ color: '#17a2b8' }}>4ème couverture</h3>
                <div style={{
                  background: book.back_cover_config?.color || '#f5f5f5',
                  padding: '2rem',
                  borderRadius: '5px',
                  border: '1px solid #ddd'
                }}>
                  <p><strong>Contributors:</strong> {chapters.reduce((acc, ch) => acc + (ch.contributions?.[0]?.count || 0), 0)}</p>
                  {book.back_cover_config?.custom_text && (
                    <p style={{ fontStyle: 'italic' }}>"{book.back_cover_config.custom_text}"</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookPage;