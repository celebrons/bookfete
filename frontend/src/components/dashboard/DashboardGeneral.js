// C:\Users\USER\bookfete\frontend\src\components\dashboard\DashboardGeneral.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import BookCard from './BookCard';
import Loading from '../common/Loading';

const DashboardGeneral = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [books, setBooks] = useState([]);
  const [archivedBooks, setArchivedBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  
  // Stats globales
  const [stats, setStats] = useState({
    enCours: { count: 0, chapitres: 0, contributions: 0 },
    termines: { count: 0, chapitres: 0, contributions: 0 },
    archives: { count: 0, chapitres: 0, contributions: 0 }
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
    duration: 3,
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

      // Calculer les stats pour les livres en cours
      const enCoursLivres = booksData?.filter(b => b.statut === 'en_cours') || [];
      const terminesLivres = booksData?.filter(b => b.statut === 'termine') || [];
      
      let chapitresEnCours = 0;
      let contributionsEnCours = 0;
      let chapitresTermines = 0;
      let contributionsTermines = 0;

      // Calculer pour les livres en cours
      enCoursLivres.forEach(book => {
        chapitresEnCours += book.chapters?.[0]?.count || 0;
        book.contributions?.forEach(chapter => {
          contributionsEnCours += chapter.contributions?.[0]?.count || 0;
        });
      });

      // Calculer pour les livres terminés
      terminesLivres.forEach(book => {
        chapitresTermines += book.chapters?.[0]?.count || 0;
        book.contributions?.forEach(chapter => {
          contributionsTermines += chapter.contributions?.[0]?.count || 0;
        });
      });

      // Stats pour les archives
      let chapitresArchives = 0;
      let contributionsArchives = 0;
      archivedData?.forEach(book => {
        chapitresArchives += book.chapters?.[0]?.count || 0;
        book.contributions?.forEach(chapter => {
          contributionsArchives += chapter.contributions?.[0]?.count || 0;
        });
      });

      setStats({
        enCours: {
          count: enCoursLivres.length,
          chapitres: chapitresEnCours,
          contributions: contributionsEnCours
        },
        termines: {
          count: terminesLivres.length,
          chapitres: chapitresTermines,
          contributions: contributionsTermines
        },
        archives: {
          count: archivedData?.length || 0,
          chapitres: chapitresArchives,
          contributions: contributionsArchives
        }
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
      
      const autoDeleteDate = new Date();
      autoDeleteDate.setMonth(autoDeleteDate.getMonth() + months);

      const { error } = await supabase
        .from('books')
        .update({
          status: 'archive',
          archived_at: new Date().toISOString(),
          auto_delete_at: autoDeleteDate.toISOString()
        })
        .eq('id', bookId);

      if (error) throw error;

      const archivedBook = books.find(b => b.id === bookId);
      
      // Mettre à jour les stats avant de déplacer le livre
      const newStats = { ...stats };
      
      if (archivedBook.statut === 'en_cours') {
        newStats.enCours.count -= 1;
        newStats.enCours.chapitres -= archivedBook.chapters?.[0]?.count || 0;
        // Note: on ne peut pas facilement soustraire les contributions ici
      } else if (archivedBook.statut === 'termine') {
        newStats.termines.count -= 1;
        newStats.termines.chapitres -= archivedBook.chapters?.[0]?.count || 0;
      }
      
      newStats.archives.count += 1;
      // On ajoutera les chapitres/contributions lors du prochain rechargement
      
      setStats(newStats);
      setBooks(prev => prev.filter(b => b.id !== bookId));
      setArchivedBooks(prev => [{ ...archivedBook, status: 'archive' }, ...prev]);

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

      const restoredBook = archivedBooks.find(b => b.id === bookId);
      
      // Mettre à jour les stats
      const newStats = { ...stats };
      newStats.archives.count -= 1;
      
      if (restoredBook.statut === 'en_cours') {
        newStats.enCours.count += 1;
      } else if (restoredBook.statut === 'termine') {
        newStats.termines.count += 1;
      }
      
      setStats(newStats);
      setArchivedBooks(prev => prev.filter(b => b.id !== bookId));
      setBooks(prev => [{ ...restoredBook, status: 'actif' }, ...prev]);

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
      
      const { data: chapters, error: chaptersError } = await supabase
        .from('chapters')
        .select('id')
        .eq('book_id', bookId);

      if (chaptersError) throw chaptersError;

      const chapterIds = chapters.map(ch => ch.id);

      if (chapterIds.length > 0) {
        const { error: contributionsError } = await supabase
          .from('contributions')
          .delete()
          .in('chapter_id', chapterIds);

        if (contributionsError) throw contributionsError;

        const { error: invitesError } = await supabase
          .from('chapter_invites')
          .delete()
          .in('chapter_id', chapterIds);

        if (invitesError) throw invitesError;
      }

      const { error: deleteChaptersError } = await supabase
        .from('chapters')
        .delete()
        .eq('book_id', bookId);

      if (deleteChaptersError) throw deleteChaptersError;

      const { error: contributorsError } = await supabase
        .from('book_contributors')
        .delete()
        .eq('book_id', bookId);

      if (contributorsError) throw contributorsError;

      const { error: bookError } = await supabase
        .from('books')
        .delete()
        .eq('id', bookId);

      if (bookError) throw bookError;

      const isActive = books.some(b => b.id === bookId);
      
      if (isActive) {
        const deletedBook = books.find(b => b.id === bookId);
        setBooks(prev => prev.filter(b => b.id !== bookId));
        
        const newStats = { ...stats };
        if (deletedBook.statut === 'en_cours') {
          newStats.enCours.count -= 1;
        } else if (deletedBook.statut === 'termine') {
          newStats.termines.count -= 1;
        }
        setStats(newStats);
        
      } else {
        setArchivedBooks(prev => prev.filter(b => b.id !== bookId));
        setStats(prev => ({
          ...prev,
          archives: {
            ...prev.archives,
            count: prev.archives.count - 1
          }
        }));
      }

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
          <h1 style={{ margin: '0 0 0.5rem', color: '#333', fontSize: '2rem' }}>
            Bonjour {user?.user_metadata?.full_name || user?.email} 🎉
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            Gérez vos livres et suivez leur avancement
          </p>
        </div>

        {/* Statistiques épurées */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          {/* Livres en cours */}
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.8rem' }}>📖</span>
              <span style={{ fontSize: '1.2rem', fontWeight: '500', color: '#333' }}>
                {stats.enCours.count} livre{stats.enCours.count > 1 ? 's' : ''} en cours
              </span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#666', marginLeft: '2.6rem' }}>
              <span>📑 {stats.enCours.chapitres} chapitre{stats.enCours.chapitres > 1 ? 's' : ''}</span>
              <span>💬 {stats.enCours.contributions} contribution{stats.enCours.contributions > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Livres terminés */}
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.8rem' }}>✅</span>
              <span style={{ fontSize: '1.2rem', fontWeight: '500', color: '#333' }}>
                {stats.termines.count} livre{stats.termines.count > 1 ? 's' : ''} terminé{stats.termines.count > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#666', marginLeft: '2.6rem' }}>
              <span>📑 {stats.termines.chapitres} chapitre{stats.termines.chapitres > 1 ? 's' : ''}</span>
              <span>💬 {stats.termines.contributions} contribution{stats.termines.contributions > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Livres archivés */}
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.8rem' }}>📦</span>
              <span style={{ fontSize: '1.2rem', fontWeight: '500', color: '#333' }}>
                {stats.archives.count} livre{stats.archives.count > 1 ? 's' : ''} archivé{stats.archives.count > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#666', marginLeft: '2.6rem' }}>
              <span>📑 {stats.archives.chapitres} chapitre{stats.archives.chapitres > 1 ? 's' : ''}</span>
              <span>💬 {stats.archives.contributions} contribution{stats.archives.contributions > 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link
            to="/create-book"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.8rem 1.5rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '500',
              fontSize: '0.95rem',
              boxShadow: '0 4px 10px rgba(118, 75, 162, 0.2)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.transform = 'translateY(-1px)'}
            onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
          >
            <span>✨</span>
            Nouveau livre
          </Link>

          {stats.archives.count > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              style={{
                padding: '0.8rem 1.5rem',
                background: showArchived ? '#764ba2' : 'white',
                color: showArchived ? 'white' : '#333',
                border: '1px solid #e9ecef',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.95rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <span>📦</span>
              {showArchived ? 'Masquer archives' : `Archives (${stats.archives.count})`}
            </button>
          )}
        </div>

        {/* Livres actifs */}
        {!showArchived && (
          <div>
            <h2 style={{ marginBottom: '1.5rem', color: '#333', fontSize: '1.3rem', fontWeight: '500' }}>
              📚 Mes livres
            </h2>
            
            {books.length === 0 ? (
              <div style={{
                background: 'white',
                padding: '3rem',
                borderRadius: '10px',
                textAlign: 'center',
                color: '#666',
                border: '1px dashed #e9ecef'
              }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📖</span>
                <h3 style={{ fontWeight: '400', marginBottom: '0.5rem' }}>Vous n'avez pas encore de livre</h3>
                <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>Créez votre premier livre pour commencer</p>
                <Link
                  to="/create-book"
                  style={{
                    padding: '0.8rem 2rem',
                    background: '#764ba2',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '0.95rem'
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
            <h2 style={{ marginBottom: '1.5rem', color: '#666', fontSize: '1.3rem', fontWeight: '500' }}>
              📦 Livres archivés
            </h2>
            
            {archivedBooks.length === 0 ? (
              <div style={{
                background: 'white',
                padding: '3rem',
                borderRadius: '10px',
                textAlign: 'center',
                color: '#666',
                border: '1px dashed #e9ecef'
              }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📦</span>
                <h3 style={{ fontWeight: '400', marginBottom: '0.5rem' }}>Aucun livre archivé</h3>
                <p style={{ fontSize: '0.9rem' }}>Les livres que vous archivez apparaîtront ici</p>
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
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginBottom: '1rem' }}>Archiver le livre</h3>
            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
              Voulez-vous archiver "{archiveModal.bookTitle}" ?
            </p>
            <select
              value={archiveModal.duration}
              onChange={(e) => setArchiveModal({ ...archiveModal, duration: parseInt(e.target.value) })}
              style={{
                width: '100%',
                padding: '0.8rem',
                marginBottom: '1.5rem',
                border: '1px solid #ddd',
                borderRadius: '8px'
              }}
            >
              <option value={3}>3 mois</option>
              <option value={6}>6 mois</option>
              <option value={12}>1 an</option>
            </select>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={closeArchiveModal}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleArchiveBook}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  background: '#ffc107',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Archiver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de suppression */}
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
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#dc3545' }}>Supprimer définitivement ?</h3>
            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
              Êtes-vous sûr de vouloir supprimer "{deleteModal.bookTitle}" ? Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={closeDeleteModal}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteBook}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardGeneral;