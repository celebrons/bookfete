// C:\Users\USER\bookfete\frontend\src\components\dashboard\DashboardGeneral.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import BookCard from './BookCard';
import StatsCards from './StatsCards';
import Loading from '../common/Loading';

const DashboardGeneral = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [books, setBooks] = useState([]);
  const [archivedBooks, setArchivedBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [stats, setStats] = useState({
    enCours: 0,
    termines: 0,
    archives: 0,
    totalChapitres: 0,
    totalContributions: 0
  });

  // États pour les modals
  const [deleteModal, setDeleteModal] = useState({
    show: false,
    bookId: null,
    bookTitle: '',
    deleting: false
  });

  const [archiveModal, setArchiveModal] = useState({
    show: false,
    bookId: null,
    bookTitle: '',
    duration: 3, // 3 mois par défaut
    archiving: false
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
      
      // Charger les livres actifs
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
        .eq('status', 'actif')
        .order('created_at', { ascending: false });

      if (booksError) throw booksError;

      // Charger les livres archivés
      const { data: archivedData, error: archivedError } = await supabase
        .from('books')
        .select(`
          *,
          chapters:chapters(count),
          contributions:chapters(
            contributions(count)
          )
        `)
        .eq('owner_id', userId)
        .eq('status', 'archive')
        .order('archived_at', { ascending: false });

      if (archivedError) throw archivedError;

      setBooks(booksData || []);
      setArchivedBooks(archivedData || []);

      // Calculer les stats
      const enCours = booksData?.filter(b => b.statut === 'en_cours').length || 0;
      const termines = booksData?.filter(b => b.statut === 'termine').length || 0;
      const archives = archivedData?.length || 0;
      
      let totalChapitres = 0;
      let totalContributions = 0;

      [...(booksData || []), ...(archivedData || [])].forEach(book => {
        totalChapitres += book.chapters?.[0]?.count || 0;
        book.contributions?.forEach(chapter => {
          totalContributions += chapter.contributions?.[0]?.count || 0;
        });
      });

      setStats({
        enCours,
        termines,
        archives,
        totalChapitres,
        totalContributions
      });

    } catch (error) {
      console.error('Erreur chargement livres:', error);
    } finally {
      setLoading(false);
    }
  };

  const openArchiveModal = (bookId, bookTitle) => {
    setArchiveModal({
      show: true,
      bookId,
      bookTitle,
      duration: 3,
      archiving: false
    });
  };

  const closeArchiveModal = () => {
    setArchiveModal({
      show: false,
      bookId: null,
      bookTitle: '',
      duration: 3,
      archiving: false
    });
  };

  const handleArchiveBook = async () => {
    if (!archiveModal.bookId) return;

    setArchiveModal(prev => ({ ...prev, archiving: true }));

    try {
      const bookId = archiveModal.bookId;
      const months = archiveModal.duration;
      
      // Calculer la date de suppression automatique
      const autoDeleteDate = new Date();
      autoDeleteDate.setMonth(autoDeleteDate.getMonth() + months);

      // Archiver le livre
      const { error } = await supabase
        .from('books')
        .update({
          status: 'archive',
          archived_at: new Date().toISOString(),
          auto_delete_at: autoDeleteDate.toISOString()
        })
        .eq('id', bookId);

      if (error) throw error;

      // Mettre à jour les listes
      const archivedBook = books.find(b => b.id === bookId);
      setBooks(prev => prev.filter(b => b.id !== bookId));
      setArchivedBooks(prev => [{ ...archivedBook, status: 'archive' }, ...prev]);
      
      // Mettre à jour les stats
      setStats(prev => ({
        ...prev,
        enCours: prev.enCours - 1,
        archives: prev.archives + 1
      }));

      closeArchiveModal();
      alert(`✅ Livre archivé pour ${months} mois. Il sera automatiquement supprimé le ${autoDeleteDate.toLocaleDateString('fr-FR')}.`);
      
    } catch (error) {
      console.error('❌ Erreur archivage:', error);
      alert(`Erreur lors de l'archivage: ${error.message}`);
      setArchiveModal(prev => ({ ...prev, archiving: false }));
    }
  };

  const handleRestoreBook = async (bookId) => {
    try {
      const { error } = await supabase
        .from('books')
        .update({
          status: 'actif',
          archived_at: null,
          auto_delete_at: null
        })
        .eq('id', bookId);

      if (error) throw error;

      // Mettre à jour les listes
      const restoredBook = archivedBooks.find(b => b.id === bookId);
      setArchivedBooks(prev => prev.filter(b => b.id !== bookId));
      setBooks(prev => [{ ...restoredBook, status: 'actif' }, ...prev]);
      
      // Mettre à jour les stats
      setStats(prev => ({
        ...prev,
        enCours: prev.enCours + 1,
        archives: prev.archives - 1
      }));

      alert('✅ Livre restauré avec succès');
      
    } catch (error) {
      console.error('❌ Erreur restauration:', error);
      alert(`Erreur lors de la restauration: ${error.message}`);
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
      const bookId = deleteModal.bookId;
      
      // 1. Récupérer tous les chapitres
      const { data: chapters, error: chaptersError } = await supabase
        .from('chapters')
        .select('id')
        .eq('book_id', bookId);

      if (chaptersError) throw chaptersError;

      const chapterIds = chapters.map(ch => ch.id);

      // 2. Supprimer les contributions
      if (chapterIds.length > 0) {
        const { error: contributionsError } = await supabase
          .from('contributions')
          .delete()
          .in('chapter_id', chapterIds);

        if (contributionsError) throw contributionsError;

        // 3. Supprimer les invitations
        const { error: invitesError } = await supabase
          .from('chapter_invites')
          .delete()
          .in('chapter_id', chapterIds);

        if (invitesError) throw invitesError;
      }

      // 4. Supprimer les chapitres
      const { error: deleteChaptersError } = await supabase
        .from('chapters')
        .delete()
        .eq('book_id', bookId);

      if (deleteChaptersError) throw deleteChaptersError;

      // 5. Supprimer les contributeurs du livre
      const { error: contributorsError } = await supabase
        .from('book_contributors')
        .delete()
        .eq('book_id', bookId);

      if (contributorsError) throw contributorsError;

      // 6. Enfin, supprimer le livre
      const { error: bookError } = await supabase
        .from('books')
        .delete()
        .eq('id', bookId);

      if (bookError) throw bookError;

      // Mettre à jour la liste
      setArchivedBooks(prev => prev.filter(b => b.id !== bookId));
      
      // Mettre à jour les stats
      setStats(prev => ({
        ...prev,
        archives: prev.archives - 1
      }));

      closeDeleteModal();
      alert('✅ Livre supprimé définitivement');
      
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      alert(`Erreur lors de la suppression: ${error.message}`);
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

        {/* Statistiques */}
        <StatsCards stats={stats} />

        {/* Actions rapides */}
        <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
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

          {stats.archives > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              style={{
                padding: '1rem 2rem',
                background: showArchived ? '#764ba2' : '#f8f9fa',
                color: showArchived ? 'white' : '#333',
                border: '1px solid #e9ecef',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <span>📦</span>
              {showArchived ? 'Masquer les archives' : `Voir les archives (${stats.archives})`}
            </button>
          )}
        </div>

        {/* Livres actifs */}
        {!showArchived && (
          <div>
            <h2 style={{ marginBottom: '1.5rem', color: '#333' }}>📚 Mes livres</h2>
            
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
                    onArchive={() => openArchiveModal(book.id, book.title)}
                    onDelete={() => openDeleteModal(book.id, book.title)}
                    showArchive={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Livres archivés */}
        {showArchived && (
          <div>
            <h2 style={{ marginBottom: '1.5rem', color: '#666' }}>📦 Livres archivés</h2>
            
            {archivedBooks.length === 0 ? (
              <div style={{
                background: 'white',
                padding: '3rem',
                borderRadius: '10px',
                textAlign: 'center',
                color: '#666'
              }}>
                <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>📦</span>
                <h3>Aucun livre archivé</h3>
                <p>Les livres que vous archivez apparaîtront ici</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: '1.5rem',
                opacity: 0.8
              }}>
                {archivedBooks.map(book => (
                  <BookCard 
                    key={book.id} 
                    book={book} 
                    onRestore={() => handleRestoreBook(book.id)}
                    onDelete={() => openDeleteModal(book.id, book.title)}
                    showRestore={true}
                    autoDeleteDate={book.auto_delete_at}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal d'archivage */}
      {archiveModal.show && (
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
            <div style={{
              width: '60px',
              height: '60px',
              background: '#ffc107',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              fontSize: '2rem',
              color: 'white'
            }}>
              📦
            </div>

            <h2 style={{ textAlign: 'center', marginBottom: '1rem', color: '#333' }}>
              Archiver ce livre ?
            </h2>

            <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#666' }}>
              Le livre <strong>"{archiveModal.bookTitle}"</strong> sera déplacé dans les archives.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Durée d'archivage avant suppression automatique :
              </label>
              <select
                value={archiveModal.duration}
                onChange={(e) => setArchiveModal({ ...archiveModal, duration: parseInt(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              >
                <option value={3}>3 mois</option>
                <option value={6}>6 mois</option>
                <option value={12}>1 an</option>
              </select>
            </div>

            <div style={{
              background: '#fff3cd',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              color: '#856404',
              fontSize: '0.9rem'
            }}>
              <p style={{ margin: 0 }}>
                ⚠️ Après cette période, le livre sera définitivement supprimé.
                Vous pourrez le restaurer à tout moment depuis les archives.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={closeArchiveModal}
                disabled={archiveModal.archiving}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: archiveModal.archiving ? 'not-allowed' : 'pointer',
                  opacity: archiveModal.archiving ? 0.5 : 1
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleArchiveBook}
                disabled={archiveModal.archiving}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: archiveModal.archiving ? '#ccc' : '#ffc107',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: archiveModal.archiving ? 'not-allowed' : 'pointer',
                  opacity: archiveModal.archiving ? 0.5 : 1
                }}
              >
                {archiveModal.archiving ? 'Archivage...' : 'Archiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de suppression (identique à avant) */}
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

            <h2 style={{ textAlign: 'center', marginBottom: '1rem', color: '#333' }}>
              Supprimer définitivement ?
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