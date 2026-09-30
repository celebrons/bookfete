import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../services/supabaseClient';
import BookCardLuxe from './BookCardLuxe';
import Loading from '../common/Loading';
import {
  IconBook,
  IconArchive,
  IconPlus
} from './DashboardIcons';
import {
  getBookLifecycleStatusFromBook,
  isBookLifecycleAtLeast
} from '../../utils/bookLifecycle';
import '../../styles/luxe-theme.css';
import './DashboardLuxe.css';

const DashboardGeneralLuxe = () => {
  const { t, i18n } = useTranslation('dashboard');
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [books, setBooks] = useState([]);
  const [archivedBooks, setArchivedBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [pageNotice, setPageNotice] = useState(null);

  const [stats, setStats] = useState({
    enCours: { count: 0, photos: 0, contributions: 0 },
    termines: { count: 0, photos: 0, contributions: 0 },
    archives: { count: 0, photos: 0, contributions: 0 }
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

  const getBookPhotosCount = (book) => (book?.content_items || []).filter((item) => item.kind === 'photo').length;
  const getBookContributionsCount = (book) => new Set(
    (book?.content_items || []).map((item) => item.contribution_id).filter(Boolean)
  ).size;

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
            content_items:book_content_items(kind, contribution_id),
            participants:book_participants(status)
          `)
          .eq('owner_id', userId)
          .eq('status', 'actif')
          .order('created_at', { ascending: false }),
        supabase
          .from('books')
          .select(`
            *,
            content_items:book_content_items(kind, contribution_id),
            participants:book_participants(status)
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
        let photos = 0;
        let contributions = 0;

        bookList.forEach((book) => {
          photos += getBookPhotosCount(book);
          contributions += getBookContributionsCount(book);
        });

        return { photos, contributions };
      };

      const enCoursAgg = aggregate(enCoursLivres);
      const terminesAgg = aggregate(terminesLivres);
      const archivesAgg = aggregate(archivedBooksList);

      setStats({
        enCours: {
          count: enCoursLivres.length,
          photos: enCoursAgg.photos,
          contributions: enCoursAgg.contributions
        },
        termines: {
          count: terminesLivres.length,
          photos: terminesAgg.photos,
          contributions: terminesAgg.contributions
        },
        archives: {
          count: archivedBooksList.length,
          photos: archivesAgg.photos,
          contributions: archivesAgg.contributions
        }
      });
    } catch (error) {
      console.error('Erreur chargement livres:', error);
      showNotice(t('general.loadBooksFailed'), 'error');
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

      const photosCount = getBookPhotosCount(archivedBook);
      const contributionsCount = getBookContributionsCount(archivedBook);

      setStats((prev) => {
        const newStats = {
          enCours: { ...prev.enCours },
          termines: { ...prev.termines },
          archives: { ...prev.archives }
        };

        if (isFinalizedBook(archivedBook)) {
          newStats.termines.count -= 1;
          newStats.termines.photos -= photosCount;
          newStats.termines.contributions -= contributionsCount;
        } else {
          newStats.enCours.count -= 1;
          newStats.enCours.photos -= photosCount;
          newStats.enCours.contributions -= contributionsCount;
        }

        newStats.archives.count += 1;
        newStats.archives.photos += photosCount;
        newStats.archives.contributions += contributionsCount;

        return newStats;
      });
      setBooks((prev) => prev.filter((book) => book.id !== bookId));
      setArchivedBooks((prev) => [{ ...archivedBook, status: 'archive' }, ...prev]);

      closeArchiveModal();
      showNotice(
        t('general.archivedFor', { months, date: autoDeleteDate.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'fr-FR') }),
        'success'
      );
    } catch (error) {
      console.error('Erreur archivage:', error);
      showNotice(t('general.archiveFailed', { message: error.message }), 'error');
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

      const photosCount = getBookPhotosCount(restoredBook);
      const contributionsCount = getBookContributionsCount(restoredBook);

      setStats((prev) => {
        const newStats = {
          enCours: { ...prev.enCours },
          termines: { ...prev.termines },
          archives: { ...prev.archives }
        };

        newStats.archives.count -= 1;
        newStats.archives.photos -= photosCount;
        newStats.archives.contributions -= contributionsCount;

        if (isFinalizedBook(restoredBook)) {
          newStats.termines.count += 1;
          newStats.termines.photos += photosCount;
          newStats.termines.contributions += contributionsCount;
        } else {
          newStats.enCours.count += 1;
          newStats.enCours.photos += photosCount;
          newStats.enCours.contributions += contributionsCount;
        }

        return newStats;
      });
      setArchivedBooks((prev) => prev.filter((book) => book.id !== bookId));
      setBooks((prev) => [{ ...restoredBook, status: 'actif' }, ...prev]);

      showNotice(t('general.restoredSuccess'), 'success');
    } catch (error) {
      console.error('Erreur restauration:', error);
      showNotice(t('general.restoreFailed', { message: error.message }), 'error');
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

      // book_content_items et book_pages sont en "on delete cascade" sur
      // books.id (voir phase03_data_model.sql) : rien a nettoyer manuellement
      // pour ces deux tables. book_contributors, lui, reste un concept actif
      // (acces/droits sur le livre), donc toujours nettoye explicitement.
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
        const photosCount = getBookPhotosCount(deletedBook);
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
            newStats.termines.photos -= photosCount;
            newStats.termines.contributions -= contributionsCount;
          } else {
            newStats.enCours.count -= 1;
            newStats.enCours.photos -= photosCount;
            newStats.enCours.contributions -= contributionsCount;
          }

          return newStats;
        });
      } else {
        const deletedBook = archivedBooks.find((book) => book.id === bookId);
        const photosCount = getBookPhotosCount(deletedBook);
        const contributionsCount = getBookContributionsCount(deletedBook);
        setArchivedBooks((prev) => prev.filter((book) => book.id !== bookId));
        setStats((prev) => ({
          ...prev,
          archives: {
            ...prev.archives,
            count: prev.archives.count - 1,
            photos: prev.archives.photos - photosCount,
            contributions: prev.archives.contributions - contributionsCount
          }
        }));
      }

      closeDeleteModal();
      showNotice(t('general.deletedSuccess'), 'success');
    } catch (error) {
      console.error('Erreur suppression:', error);
      showNotice(t('general.deleteFailed', { message: error.message }), 'error');
      setDeleteModal((prev) => ({ ...prev, deleting: false }));
    }
  };

  if (loading) return <Loading message={t('general.loading')} />;

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        <div className="dashboard-toolbar">
          <div className="dashboard-header">
            <div className="dashboard-eyebrow">{t('general.eyebrow')}</div>
            <h1>{t('general.greeting', { name: user?.user_metadata?.full_name || user?.email })}</h1>
            <p>{t('general.subtitle')}</p>
          </div>

          <div className="quick-actions dashboard-header-actions">
            <Link to="/create-book" className="btn-new">
              <IconPlus />
              {t('general.newBook')}
            </Link>

            {stats.archives.count > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived(!showArchived)}
                className={`btn-archive-toggle ${showArchived ? 'active' : ''}`}
              >
                {showArchived ? t('general.hideArchives') : t('general.archivesCount', { count: stats.archives.count })}
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
              aria-label={t('general.closeNotice')}
            >
              x
            </button>
          </div>
        )}

        {/* Une seule ligne de chiffres, au lieu de trois cartes avec icone +
            grand nombre + compteurs secondaires. Meme information de premier
            niveau (compte de livres par etat) ; le detail photos/contributions
            reste visible dans chaque carte livre, pas duplique ici (retour
            utilisateur 2026-09-28 : "des carres et des chiffres partout"). */}
        <div className="stats-line">
          <span className="stats-line-item"><strong>{stats.enCours.count}</strong> {t('general.statsInProgress')}</span>
          <span className="stats-line-sep">·</span>
          <span className="stats-line-item"><strong>{stats.termines.count}</strong> {t('general.statsFinished', { count: stats.termines.count })}</span>
          <span className="stats-line-sep">·</span>
          <span className="stats-line-item"><strong>{stats.archives.count}</strong> {t('general.statsArchived', { count: stats.archives.count })}</span>
        </div>

        {!showArchived && (
          <div className="dashboard-section-panel">
            <div className="section-title">
              <h2>{t('general.myBooks')}</h2>
              <span className="section-count">{books.length}</span>
            </div>

            {books.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><IconBook /></div>
                <h3>{t('general.noBooksYet')}</h3>
                <p>{t('general.createFirstBook')}</p>
                <Link to="/create-book" className="btn-new">
                  <IconPlus />
                  {t('general.createBook')}
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
              <h2>{t('general.archivedBooks')}</h2>
              <span className="section-count">{archivedBooks.length}</span>
            </div>

            {archivedBooks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><IconArchive /></div>
                <h3>{t('general.noArchivedBooks')}</h3>
                <p>{t('general.archivedBooksAppearHere')}</p>
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
            <h3 className="modal-title">{t('general.archiveModal.title')}</h3>
            <p className="modal-text">
              {t('general.archiveModal.confirm', { title: archiveModal.bookTitle })}
            </p>
            <select
              value={archiveModal.duration}
              onChange={(event) => setArchiveModal({ ...archiveModal, duration: parseInt(event.target.value, 10) })}
              className="modal-select"
            >
              <option value={3}>{t('general.archiveModal.duration3')}</option>
              <option value={6}>{t('general.archiveModal.duration6')}</option>
              <option value={12}>{t('general.archiveModal.duration12')}</option>
            </select>
            <div className="modal-actions">
              <button
                onClick={closeArchiveModal}
                className="modal-btn modal-btn-cancel"
                disabled={archiveModal.archiving}
              >
                {t('general.archiveModal.cancel')}
              </button>
              <button
                onClick={handleArchiveBook}
                className="modal-btn modal-btn-archive"
                disabled={archiveModal.archiving}
              >
                {archiveModal.archiving ? t('general.archiveModal.archiving') : t('general.archiveModal.archive')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal.show && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-title modal-title-danger">{t('general.deleteModal.title')}</h3>
            <p className="modal-text">
              {t('general.deleteModal.confirm', { title: deleteModal.bookTitle })}
            </p>
            <div className="modal-actions">
              <button
                onClick={closeDeleteModal}
                className="modal-btn modal-btn-cancel"
                disabled={deleteModal.deleting}
              >
                {t('general.deleteModal.cancel')}
              </button>
              <button
                onClick={handleDeleteBook}
                className="modal-btn modal-btn-delete"
                disabled={deleteModal.deleting}
              >
                {deleteModal.deleting ? t('general.deleteModal.deleting') : t('general.deleteModal.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardGeneralLuxe;
