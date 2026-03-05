// C:\Users\USER\bookfete\frontend\src\components\dashboard\DashboardGeneralLuxe.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import BookCardLuxe from './BookCardLuxe';
import Loading from '../common/Loading';
import { 
  IconBook, 
  IconCheckCircle, 
  IconArchive, 
  IconChapter, 
  IconContribution,
  IconPlus
} from './DashboardIcons';
import '../../styles/luxe-theme.css';
import './DashboardLuxe.css';

const DashboardGeneralLuxe = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [books, setBooks] = useState([]);
  const [archivedBooks, setArchivedBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  
  const [stats, setStats] = useState({
    enCours: { count: 0, chapitres: 0, contributions: 0 },
    termines: { count: 0, chapitres: 0, contributions: 0 },
    archives: { count: 0, chapitres: 0, contributions: 0 }
  });

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

      const enCoursLivres = booksData?.filter(b => b.statut === 'en_cours') || [];
      const terminesLivres = booksData?.filter(b => b.statut === 'termine') || [];
      
      let chapitresEnCours = 0;
      let contributionsEnCours = 0;
      let chapitresTermines = 0;
      let contributionsTermines = 0;

      enCoursLivres.forEach(book => {
        chapitresEnCours += book.chapters?.[0]?.count || 0;
        book.contributions?.forEach(chapter => {
          contributionsEnCours += chapter.contributions?.[0]?.count || 0;
        });
      });

      terminesLivres.forEach(book => {
        chapitresTermines += book.chapters?.[0]?.count || 0;
        book.contributions?.forEach(chapter => {
          contributionsTermines += chapter.contributions?.[0]?.count || 0;
        });
      });

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
      const newStats = { ...stats };
      
      if (archivedBook.statut === 'en_cours') {
        newStats.enCours.count -= 1;
        newStats.enCours.chapitres -= archivedBook.chapters?.[0]?.count || 0;
      } else if (archivedBook.statut === 'termine') {
        newStats.termines.count -= 1;
        newStats.termines.chapitres -= archivedBook.chapters?.[0]?.count || 0;
      }
      
      newStats.archives.count += 1;
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
    <div className="dashboard-container">
      <div className="dashboard-content">
        {/* En-tête */}
        <div className="dashboard-header">
          <h1>
            Bonjour {user?.user_metadata?.full_name || user?.email}
          </h1>
          <p>Gérez vos livres et suivez leur avancement</p>
        </div>

        {/* Statistiques avec icônes épurées */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon">
                <IconBook />
              </span>
              <span className="stat-title">En cours</span>
            </div>
            <div className="stat-number">{stats.enCours.count}</div>
            <div className="stat-details">
              <span className="stat-detail-item">
                <IconChapter />
                {stats.enCours.chapitres}
              </span>
              <span className="stat-detail-item">
                <IconContribution />
                {stats.enCours.contributions}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon">
                <IconCheckCircle />
              </span>
              <span className="stat-title">Terminés</span>
            </div>
            <div className="stat-number">{stats.termines.count}</div>
            <div className="stat-details">
              <span className="stat-detail-item">
                <IconChapter />
                {stats.termines.chapitres}
              </span>
              <span className="stat-detail-item">
                <IconContribution />
                {stats.termines.contributions}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon">
                <IconArchive />
              </span>
              <span className="stat-title">Archivés</span>
            </div>
            <div className="stat-number">{stats.archives.count}</div>
            <div className="stat-details">
              <span className="stat-detail-item">
                <IconChapter />
                {stats.archives.chapitres}
              </span>
              <span className="stat-detail-item">
                <IconContribution />
                {stats.archives.contributions}
              </span>
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="quick-actions">
          <Link to="/create-book" className="btn-new">
            <IconPlus />
            Nouveau livre
          </Link>

          <Link to="/admin/prompts" className="btn-admin">
            Prompts IA
          </Link>

          {stats.archives.count > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`btn-archive-toggle ${showArchived ? 'active' : ''}`}
            >
              <IconArchive />
              {showArchived ? 'Masquer archives' : `Archives (${stats.archives.count})`}
            </button>
          )}
        </div>

        {/* Livres actifs */}
        {!showArchived && (
          <div>
            <div className="section-title">
              <h2>📚 Mes livres</h2>
              <span className="section-count">{books.length}</span>
            </div>
            
            {books.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📖</div>
                <h3>Vous n'avez pas encore de livre</h3>
                <p>Créez votre premier livre pour commencer</p>
                <Link to="/create-book" className="btn-new" style={{ display: 'inline-block' }}>
                  <IconPlus />
                  Créer un livre
                </Link>
              </div>
            ) : (
              <div className="books-grid">
                {books.map(book => (
                  <BookCardLuxe 
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
            <div className="section-title">
              <h2>📦 Livres archivés</h2>
              <span className="section-count">{archivedBooks.length}</span>
            </div>
            
            {archivedBooks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📦</div>
                <h3>Aucun livre archivé</h3>
                <p>Les livres que vous archivez apparaîtront ici</p>
              </div>
            ) : (
              <div className="books-grid" style={{ opacity: 0.8 }}>
                {archivedBooks.map(book => (
                  <BookCardLuxe 
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
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-title">Archiver le livre</h3>
            <p className="modal-text">
              Voulez-vous archiver "{archiveModal.bookTitle}" ?
            </p>
            <select
              value={archiveModal.duration}
              onChange={(e) => setArchiveModal({ ...archiveModal, duration: parseInt(e.target.value) })}
              className="modal-select"
            >
              <option value={3}>3 mois</option>
              <option value={6}>6 mois</option>
              <option value={12}>1 an</option>
            </select>
            <div className="modal-actions">
              <button
                onClick={closeArchiveModal}
                className="modal-btn modal-btn-cancel"
              >
                Annuler
              </button>
              <button
                onClick={handleArchiveBook}
                className="modal-btn modal-btn-archive"
              >
                Archiver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de suppression */}
      {deleteModal.show && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-title" style={{ color: '#dc3545' }}>Supprimer définitivement ?</h3>
            <p className="modal-text">
              Êtes-vous sûr de vouloir supprimer "{deleteModal.bookTitle}" ? Cette action est irréversible.
            </p>
            <div className="modal-actions">
              <button
                onClick={closeDeleteModal}
                className="modal-btn modal-btn-cancel"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteBook}
                className="modal-btn modal-btn-delete"
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

export default DashboardGeneralLuxe;
