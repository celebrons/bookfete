// C:\Users\USER\bookfete\frontend\src\components\book\BookPage.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import BookConfig from './BookConfig';
import ChapterList from './ChapterList';
import BookConfigurator from '../create-book/BookConfigurator';
import Loading from '../common/Loading';

const BookPage = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('chapitres'); // 'chapitres', 'config', 'apercu'

  useEffect(() => {
    fetchBookData();
  }, [bookId]);

  const fetchBookData = async () => {
    try {
      setLoading(true);
      
      // Récupérer le livre
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError) throw bookError;
      setBook(bookData);

      // Récupérer les chapitres avec le comptage des contributions
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
      console.error('❌ Erreur chargement livre:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateBook = async (updates) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('books')
        .update(updates)
        .eq('id', bookId);

      if (error) throw error;
      setBook(prev => ({ ...prev, ...updates }));
      
    } catch (error) {
      console.error('❌ Erreur mise à jour:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateChapter = async (chapterId, updates) => {
    try {
      const { error } = await supabase
        .from('chapters')
        .update(updates)
        .eq('id', chapterId);

      if (error) throw error;
      
      setChapters(prev => prev.map(ch => 
        ch.id === chapterId ? { ...ch, ...updates } : ch
      ));
      
    } catch (error) {
      console.error('❌ Erreur mise à jour chapitre:', error);
    }
  };

  const addChapter = async () => {
    try {
      const newChapter = {
        book_id: bookId,
        title: `Nouveau chapitre ${chapters.length + 1}`,
        description: '',
        order_index: chapters.length,
        questions_ia: []
      };

      const { data, error } = await supabase
        .from('chapters')
        .insert([newChapter])
        .select()
        .single();

      if (error) throw error;
      
      // Ajouter le comptage de contributions vide
      data.contributions = [{ count: 0 }];
      setChapters(prev => [...prev, data]);
      
    } catch (error) {
      console.error('❌ Erreur ajout chapitre:', error);
    }
  };

  const deleteChapter = async (chapterId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce chapitre ?')) return;
    
    try {
      const { error } = await supabase
        .from('chapters')
        .delete()
        .eq('id', chapterId);

      if (error) throw error;
      setChapters(prev => prev.filter(ch => ch.id !== chapterId));
      
    } catch (error) {
      console.error('❌ Erreur suppression chapitre:', error);
    }
  };

  const getStats = () => {
    const totalContributions = chapters.reduce((acc, ch) => 
      acc + (ch.contributions?.[0]?.count || 0), 0);
    
    // À implémenter avec une vraie requête plus tard
    const totalInvites = 0;

    return {
      chapitres: chapters.length,
      contributions: totalContributions,
      invites: totalInvites
    };
  };

  if (loading) return <Loading message="Chargement du livre..." />;
  if (!book) return <div style={{ textAlign: 'center', padding: '2rem' }}>Livre non trouvé</div>;

  const stats = getStats();

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* En-tête avec retour */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '0.5rem 1rem',
              background: '#f8f9fa',
              border: '1px solid #ddd',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            ← Retour
          </button>
          <div>
            <h1 style={{ margin: 0 }}>{book.title}</h1>
            <p style={{ margin: '0.5rem 0 0', color: '#666' }}>
              Créé le {new Date(book.created_at).toLocaleDateString('fr-FR')}
              {saving && <span style={{ marginLeft: '1rem', color: '#ffc107' }}>💾 Sauvegarde...</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Stats rapides */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#764ba2' }}>
            {stats.chapitres}
          </div>
          <div style={{ color: '#666' }}>chapitres</div>
        </div>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffc107' }}>
            {stats.contributions}
          </div>
          <div style={{ color: '#666' }}>contributions</div>
        </div>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#17a2b8' }}>
            {stats.invites}
          </div>
          <div style={{ color: '#666' }}>invités</div>
        </div>
      </div>

      {/* Onglets */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '2rem',
        borderBottom: '2px solid #eee',
        paddingBottom: '0.5rem'
      }}>
        <button
          onClick={() => setActiveTab('chapitres')}
          style={{
            padding: '0.8rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'chapitres' ? '3px solid #764ba2' : 'none',
            color: activeTab === 'chapitres' ? '#764ba2' : '#666',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: activeTab === 'chapitres' ? '600' : '400'
          }}
        >
          📖 Chapitres ({stats.chapitres})
        </button>
        <button
          onClick={() => setActiveTab('config')}
          style={{
            padding: '0.8rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'config' ? '3px solid #764ba2' : 'none',
            color: activeTab === 'config' ? '#764ba2' : '#666',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: activeTab === 'config' ? '600' : '400'
          }}
        >
          ⚙️ Configuration
        </button>
        <button
          onClick={() => setActiveTab('apercu')}
          style={{
            padding: '0.8rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'apercu' ? '3px solid #764ba2' : 'none',
            color: activeTab === 'apercu' ? '#764ba2' : '#666',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: activeTab === 'apercu' ? '600' : '400'
          }}
        >
          👁️ Aperçu
        </button>
      </div>

      {/* Contenu des onglets */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'chapitres' && (
          <ChapterList
            chapters={chapters}
            bookId={bookId}
            onUpdateChapter={updateChapter}
            onDeleteChapter={deleteChapter}
            onAddChapter={addChapter}
          />
        )}

        {activeTab === 'config' && (
		  <BookConfigurator
			initialBook={book}
			onSave={(bookId) => {
			  fetchBookData();
			}}
		  />
		)}

        {activeTab === 'apercu' && (
          <div style={{
            background: 'white',
            padding: '3rem',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>👁️</span>
            <h2 style={{ marginBottom: '1rem' }}>Aperçu du livre</h2>
            <p style={{ color: '#666', marginBottom: '2rem' }}>
              Cette fonctionnalité sera disponible prochainement.
              Vous pourrez visualiser votre livre avant de le commander.
            </p>
            <button
              disabled
              style={{
                padding: '1rem 2rem',
                background: '#ccc',
                color: '#666',
                border: 'none',
                borderRadius: '5px',
                fontSize: '1rem',
                cursor: 'not-allowed'
              }}
            >
              Générer un aperçu (bientôt)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookPage;