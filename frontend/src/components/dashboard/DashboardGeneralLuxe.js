import React, { useEffect, useState } from 'react';
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
import {
  getBookLifecycleStatusFromBook,
  isBookLifecycleAtLeast
} from '../../utils/bookLifecycle';
import '../../styles/luxe-theme.css';
import './DashboardLuxe.css';

const DashboardGeneralLuxe = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [books, setBooks] = useState([]);
  const [archivedBooks, setArchivedBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [pageNotice, setPageNotice] = useState(null);

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

  const getBookContributionsCount = (book) => (
    (book?.contributions || []).reduce(
      (sum, chapter) => sum + (chapter.contributions?.[0]?.count || 0),
      0
    )
  );

  const isFinalizedBook = (book) => (
    isBookLifecycleAtLeast(getBookLifecycleStatusFromBook(book), 'finalized')
  );

  const showNotice = (message, type = 'info') => {
    setPageNotice({ message, type });
  };

  const dismissNotice = () => {
    setPageNotice(null);
  };

  const checkUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        navigate('/login');
        return;
      }
      setUser(authUser);
      loadUserBooks(authUser.id);
    } catch (error) {
      console.error('Erreur utilisateur dashboard:', error);
      navigate('/login');
    }
  };

  const loadUserBooks = async (userId) => {
    try {
      setLoading(true);

      const [activeBooksResult, archivedBooksResult, ordersResult] = await Promise.all([
        supabase
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
          .order('created_at', { ascending: false }),
        supabase
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
          .order('archived_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id, book_id, status, type, created_at, metadata')
          .eq('owner_id', userId)
          .order('created_at', { ascending: false })
      ]);

      if (activeBooksResult.error) throw activeBooksResult.error;
      if (archivedBooksResult.error) throw archivedBooksResult.error;
      if (ordersResult.error) throw ordersResult.error;

      const latestOrderByBook = new Map();
      (ordersResult.data || []).forEach((order) => {
        const bookKey = String(order?.book_id || '').trim();
        if (!bookKey || latestOrderByBook.has(bookKey)) {
          return;
        }
        latestOrderByBook.set(bookKey, order);
      });

      const attachLatestOrder = (bookList) => (
        (bookList || []).map((book) => ({
          ...book,
          latestOrder: latestOrderByBook.get(book.id) || null
        }))
      );

      const activeBooks = attachLatestOrder(activeBooksResult.data);
      const archivedBooksList = attachLatestOrder(archivedBooksResult.data);
      setBooks(activeBooks);
      setArchivedBooks(archivedBooksList);

      const enCoursLivres = activeBooks.filter((book) => !isFinalizedBook(book));
      const terminesLivres = activeBooks.filter((book) => isFinalizedBook(book));

      const aggregate = (bookList) => {
        let chapitres = 0;
        let contributions = 0;

        bookList.forEach((book) => {
          chapitres += book.chapters?.[0]?.count || 0;
          (book.contributions || []).forEach((chapter) => {
            contributions += chapter.contributions?.[0]?.count || 0;
          });
        });

        return { chapitres, contributions };
      };

      const enCoursAgg = aggregate(enCoursLivres);
      const terminesAgg = aggregate(terminesLivres);
      const archivesAgg = aggregate(archivedBooksList);

      setStats({
        enCours: {
          count: enCoursLivres.length,
          chapitres: enCoursAgg.chapitres,
          contributions: enCoursAgg.contributions
        },
        termines: {
          count: terminesLivres.length,
          chapitres: terminesAgg.chapitres,
          contributions: terminesAgg.contributions
        },
        archives: {
          count: archivedBooksList.length,
          chapitres: archivesAgg.chapitres,
          contributions: archivesAgg.contributions
        }
      });
    } catch (error) {
      console.error('Erreur chargement livres:', error);
      showNotice('Impossible de charger la bibliotheque.', 'error');
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
    setArchiveModal((prev) => ({ ...prev, archiving: true }));

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

      const archivedBook = books.find((book) => book.id === bookId);
      if (!archivedBook) {
        closeArchiveModal();
        await loadUserBooks(user.id);
        return;
      }

      const chaptersCount = archivedBook.chapters?.[0]?.count || 0;
      const contributionsCount = getBookContributionsCount(archivedBook);

      setStats((prev) => {
        const newStats = {
          enCours: { ...prev.enCours },
          termines: { ...prev.termines },
          archives: { ...prev.archives }
        };

        if (isFinalizedBook(archivedBook)) {
          newStats.termines.count -= 1;
          newStats.termines.chapitres -= chaptersCount;
          newStats.termines.contributions -= contributionsCount;
        } else {
          newStats.enCours.count -= 1;
          newStats.enCours.chapitres -= chaptersCount;
          newStats.enCours.contributions -= contributionsCount;
        }

        newStats.archives.count += 1;
        newStats.archives.chapitres += chaptersCount;
        newStats.archives.contributions += contributionsCount;

        return newStats;
      });
      setBooks((prev) => prev.filter((book) => book.id !== bookId));
      setArchivedBooks((prev) => [{ ...archivedBook, status: 'archive' }, ...prev]);

      closeArchiveModal();
      showNotice(
        `Livre archive pour ${months} mois. Suppression automatique le ${autoDeleteDate.toLocaleDateString('fr-FR')}.`,
        'success'
      );
    } catch (error) {
      console.error('Erreur archivage:', error);
      showNotice(`Erreur lors de l'archivage: ${error.message}`, 'error');
      setArchiveModal((prev) => ({ ...prev, archiving: false }));
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

      const restoredBook = archivedBooks.find((book) => book.id === bookId);
      if (!restoredBook) {
        await loadUserBooks(user.id);
        return;
      }

      const chaptersCount = restoredBook.chapters?.[0]?.count || 0;
      const contributionsCount = getBookContributionsCount(restoredBook);

      setStats((prev) => {
        const newStats = {
          enCours: { ...prev.enCours },
          termines: { ...prev.termines },
          archives: { ...prev.archives }
        };

        newStats.archives.count -= 1;
        newStats.archives.chapitres -= chaptersCount;
        newStats.archives.contributions -= contributionsCount;

        if (isFinalizedBook(restoredBook)) {
          newStats.termines.count += 1;
          newStats.termines.chapitres += chaptersCount;
          newStats.termines.contributions += contributionsCount;
        } else {
          newStats.enCours.count += 1;
          newStats.enCours.chapitres += chaptersCount;
          newStats.enCours.contributions += contributionsCount;
        }

        return newStats;
      });
      setArchivedBooks((prev) => prev.filter((book) => book.id !== bookId));
      setBooks((prev) => [{ ...restoredBook, status: 'actif' }, ...prev]);

      showNotice('Livre restaure avec succes.', 'success');
    } catch (error) {
      console.error('Erreur restauration:', error);
      showNotice(`Erreur lors de la restauration: ${error.message}`, 'error');
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
    setDeleteModal((prev) => ({ ...prev, deleting: true }));

    try {
      const bookId = deleteModal.bookId;

      const { data: chapters, error: chaptersError } = await supabase
        .from('chapters')
        .select('id')
        .eq('book_id', bookId);

      if (chaptersError) throw chaptersError;

      const chapterIds = (chapters || []).map((chapter) => chapter.id);

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

      const isActive = books.some((book) => book.id === bookId);

      if (isActive) {
        const deletedBook = books.find((book) => book.id === bookId);
        const chaptersCount = deletedBook?.chapters?.[0]?.count || 0;
        const contributionsCount = getBookContributionsCount(deletedBook);
        setBooks((prev) => prev.filter((book) => book.id !== bookId));
        setStats((prev) => {
          const newStats = {
            enCours: { ...prev.enCours },
            termines: { ...prev.termines },
            archives: { ...prev.archives }
          };

          if (isFinalizedBook(deletedBook)) {
            newStats.termines.count -= 1;
            newStats.termines.chapitres -= chaptersCount;
            newStats.termines.contributions -= contributionsCount;
          } else {
            newStats.enCours.count -= 1;
            newStats.enCours.chapitres -= chaptersCount;
            newStats.enCours.contributions -= contributionsCount;
          }

          return newStats;
        });
      } else {
        const deletedBook = archivedBooks.find((book) => book.id === bookId);
        const chaptersCount = deletedBook?.chapters?.[0]?.count || 0;
        const contributionsCount = getBookContributionsCount(deletedBook);
        setArchivedBooks((prev) => prev.filter((book) => book.id !== bookId));
        setStats((prev) => ({
          ...prev,
          archives: {
            ...prev.archives,
            count: prev.archives.count - 1,
            chapitres: prev.archives.chapitres - chaptersCount,
            contributions: prev.archives.contributions - contributionsCount
          }
        }));
      }

      closeDeleteModal();
      showNotice('Livre supprime definitivement.', 'success');
    } catch (error) {
      console.error('Erreur suppression:', error);
      showNotice(`Erreur lors de la suppression: ${error.message}`, 'error');
      setDeleteModal((prev) => ({ ...prev, deleting: false }));
    }
  };

  if (loading) return <Loading message="Chargement de votre bibliotheque..." />;

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        <div className="dashboard-hero">
          <div className="dashboard-header">
            <div className="dashboard-eyebrow">Bibliotheque personnelle</div>
            <h1>Bonjour {user?.user_metadata?.full_name || user?.email}</h1>
            <p>Gerez vos livres, suivez leur avancement et pilotez les actions prioritaires.</p>
          </div>

          <div className="quick-actions dashboard-header-actions">
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
        </div>

        {pageNotice?.message && (
          <div className={`dashboard-feedback-banner is-${pageNotice.type || 'info'}`}>
            <span>{pageNotice.message}</span>
            <button
              type="button"
              className="dashboard-feedback-close"
              onClick={dismissNotice}
              aria-label="Fermer le message"
            >
              x
            </button>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon"><IconBook /></span>
              <span className="stat-title">En cours</span>
            </div>
            <div className="stat-number">{stats.enCours.count}</div>
            <div className="stat-details">
              <span className="stat-detail-item"><IconChapter />{stats.enCours.chapitres}</span>
              <span className="stat-detail-item"><IconContribution />{stats.enCours.contributions}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon"><IconCheckCircle /></span>
              <span className="stat-title">Termines</span>
            </div>
            <div className="stat-number">{stats.termines.count}</div>
            <div className="stat-details">
              <span className="stat-detail-item"><IconChapter />{stats.termines.chapitres}</span>
              <span className="stat-detail-item"><IconContribution />{stats.termines.contributions}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon"><IconArchive /></span>
              <span className="stat-title">Archives</span>
            </div>
            <div className="stat-number">{stats.archives.count}</div>
            <div className="stat-details">
              <span className="stat-detail-item"><IconChapter />{stats.archives.chapitres}</span>
              <span className="stat-detail-item"><IconContribution />{stats.archives.contributions}</span>
            </div>
          </div>
        </div>

        {!showArchived && (
          <div className="dashboard-section-panel">
            <div className="section-title">
              <h2>Mes livres</h2>
              <span className="section-count">{books.length}</span>
            </div>

            {books.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><IconBook /></div>
                <h3>Vous n'avez pas encore de livre</h3>
                <p>Creez votre premier livre pour commencer.</p>
                <Link to="/create-book" className="btn-new">
                  <IconPlus />
                  Creer un livre
                </Link>
              </div>
            ) : (
              <div className="books-grid">
                {books.map((book) => (
                  <BookCardLuxe
                    key={book.id}
                    book={book}
                    onArchive={() => openArchiveModal(book.id, book.title)}
                    onDelete={() => openDeleteModal(book.id, book.title)}
                    showArchive
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {showArchived && (
          <div className="dashboard-section-panel">
            <div className="section-title">
              <h2>Livres archives</h2>
              <span className="section-count">{archivedBooks.length}</span>
            </div>

            {archivedBooks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><IconArchive /></div>
                <h3>Aucun livre archive</h3>
                <p>Les livres que vous archivez apparaitront ici.</p>
              </div>
            ) : (
              <div className="books-grid books-grid-archived">
                {archivedBooks.map((book) => (
                  <BookCardLuxe
                    key={book.id}
                    book={book}
                    onRestore={() => handleRestoreBook(book.id)}
                    onDelete={() => openDeleteModal(book.id, book.title)}
                    showRestore
                    autoDeleteDate={book.auto_delete_at}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {archiveModal.show && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-title">Archiver le livre</h3>
            <p className="modal-text">
              Voulez-vous archiver "{archiveModal.bookTitle}" ?
            </p>
            <select
              value={archiveModal.duration}
              onChange={(event) => setArchiveModal({ ...archiveModal, duration: parseInt(event.target.value, 10) })}
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
                disabled={archiveModal.archiving}
              >
                Annuler
              </button>
              <button
                onClick={handleArchiveBook}
                className="modal-btn modal-btn-archive"
                disabled={archiveModal.archiving}
              >
                {archiveModal.archiving ? 'Archivage...' : 'Archiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal.show && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-title modal-title-danger">Supprimer definitivement ?</h3>
            <p className="modal-text">
              Etes-vous sur de vouloir supprimer "{deleteModal.bookTitle}" ? Cette action est irreversible.
            </p>
            <div className="modal-actions">
              <button
                onClick={closeDeleteModal}
                className="modal-btn modal-btn-cancel"
                disabled={deleteModal.deleting}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteBook}
                className="modal-btn modal-btn-delete"
                disabled={deleteModal.deleting}
              >
                {deleteModal.deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardGeneralLuxe;
