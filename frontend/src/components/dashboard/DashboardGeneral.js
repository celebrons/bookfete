// C:\Users\USER\bookfete\frontend\src\components\dashboard\DashboardGeneral.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import BookCard from './BookCard';
import StatsCards from './StatsCards';  // ← CORRIGÉ
import Loading from '../common/Loading';

const DashboardGeneral = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    enCours: 0,
    termines: 0,
    totalChapitres: 0,
    totalContributions: 0
  });

  // État pour le modal de suppression
  const [deleteModal, setDeleteModal] = useState({
    show: false,
    bookId: null,
    bookTitle: '',
    deleting: false
  });

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }
      setUser(user);
      loadUserBooks(user.id);
    } catch (error) {
      console.error('Erreur:', error);
      navigate('/login');
    }
  };

  const loadUserBooks = async (userId) => {
    try {
      setLoading(true);
      
      // Charger les livres
      const { data: booksData, error: booksError } = await supabase
        .from('books')
        .select(`
          *,
          chapters:chapters(count),
          contributions:chapters(
            contributions(count)
          )
        `)
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (booksError) throw booksError;

      setBooks(booksData || []);

      // Calculer les stats
      const enCours = booksData?.filter(b => b.statut === 'en_cours').length || 0;
      const termines = booksData?.filter(b => b.statut === 'termine').length || 0;
      
      let totalChapitres = 0;
      let totalContributions = 0;

      booksData?.forEach(book => {
        totalChapitres += book.chapters?.[0]?.count || 0;
        book.contributions?.forEach(chapter => {
          totalContributions += chapter.contributions?.[0]?.count || 0;
        });
      });

      setStats({
        enCours,
        termines,
        totalChapitres,
        totalContributions
      });

    } catch (error) {
      console.error('Erreur chargement livres:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteModal = (bookId, bookTitle) => {
    setDeleteModal({
      show: true,
      bookId,
      bookTitle,
      deleting: false
    });
  };

  const closeDeleteModal = () => {
    setDeleteModal({
      show: false,
      bookId: null,
      bookTitle: '',
      deleting: false
    });
  };

  const handleDeleteBook = async () => {
    if (!deleteModal.bookId) return;

    setDeleteModal(prev => ({ ...prev, deleting: true }));

    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', deleteModal.bookId);

      if (error) throw error;

      // Mettre à jour la liste
      setBooks(prev => prev.filter(b => b.id !== deleteModal.bookId));
      
      // Mettre à jour les stats
      setStats(prev => ({
        ...prev,
        enCours: prev.enCours - 1
      }));

      closeDeleteModal();
      
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      alert('Erreur lors de la suppression du livre');
      setDeleteModal(prev => ({ ...prev, deleting: false }));
    }
  };

  if (loading) return <Loading message="Chargement de votre bibliothèque..." />;

  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      backgroundColor: '#f5f5f5',
      padding: '2rem'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* En-tête */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ margin: '0 0 0.5rem', color: '#333' }}>
            Bonjour {user?.user_metadata?.full_name || user?.email} 🎉
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            Gérez vos livres et suivez l'avancement des contributions
          </p>
        </div>

        {/* Statistiques - UTILISE STATSCARDS */}
        <StatsCards stats={stats} />

        {/* Actions rapides */}
        <div style={{ marginBottom: '2rem' }}>
          <Link
            to="/create-book"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '1rem 2rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              boxShadow: '0 10px 20px rgba(118, 75, 162, 0.3)',
              transition: 'all 0.3s'
            }}
            onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
          >
            <span>✨</span>
            Créer un nouveau livre
          </Link>
        </div>

        {/* Liste des livres */}
        <div>
          <h2 style={{ marginBottom: '1.5rem', color: '#333' }}>📚 Ma bibliothèque</h2>
          
          {books.length === 0 ? (
            <div style={{
              background: 'white',
              padding: '3rem',
              borderRadius: '10px',
              textAlign: 'center',
              color: '#666'
            }}>
              <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>📖</span>
              <h3>Vous n'avez pas encore de livre</h3>
              <p style={{ marginBottom: '2rem' }}>Créez votre premier livre pour commencer</p>
              <Link
                to="/create-book"
                style={{
                  padding: '1rem 2rem',
                  background: '#764ba2',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '5px'
                }}
              >
                Créer un livre
              </Link>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '1.5rem'
            }}>
              {books.map(book => (
                <BookCard 
                  key={book.id} 
                  book={book} 
                  onDelete={() => openDeleteModal(book.id, book.title)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmation de suppression */}
      {deleteModal.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '16px',
            maxWidth: '450px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            {/* Icône d'avertissement */}
            <div style={{
              width: '60px',
              height: '60px',
              background: '#dc3545',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              fontSize: '2rem',
              color: 'white'
            }}>
              ⚠️
            </div>

            <h2 style={{ 
              textAlign: 'center', 
              marginBottom: '1rem',
              color: '#333'
            }}>
              Supprimer ce livre ?
            </h2>

            <div style={{
              background: '#fff3cd',
              border: '1px solid #ffeeba',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              color: '#856404'
            }}>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>
                ⚠️ Attention ! Cette action est irréversible.
              </p>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                La suppression du livre <strong>"{deleteModal.bookTitle}"</strong> entraînera la perte définitive de :
              </p>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.5rem' }}>
                <li>Tous ses chapitres</li>
                <li>Toutes les invitations envoyées</li>
                <li>Toutes les contributions reçues</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={closeDeleteModal}
                disabled={deleteModal.deleting}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: deleteModal.deleting ? 'not-allowed' : 'pointer',
                  opacity: deleteModal.deleting ? 0.5 : 1
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteBook}
                disabled={deleteModal.deleting}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: deleteModal.deleting ? '#ccc' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: deleteModal.deleting ? 'not-allowed' : 'pointer',
                  opacity: deleteModal.deleting ? 0.5 : 1
                }}
              >
                {deleteModal.deleting ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardGeneral;