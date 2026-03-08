import React from 'react';
import { Link } from 'react-router-dom';
import Tooltip from '../ui/Tooltip';
import {
  IconArchive,
  IconRestore,
  IconDelete,
  IconChapter,
  IconContribution,
  IconBook
} from './DashboardIcons';
import {
  getBookLifecycleConfig,
  getBookLifecycleStatusFromBook
} from '../../utils/bookLifecycle';
import './DashboardLuxe.css';

const BookCardLuxe = ({
  book,
  onArchive,
  onDelete,
  onRestore,
  showArchive = false,
  showRestore = false,
  autoDeleteDate
}) => {
  const lifecycleStatus = getBookLifecycleStatusFromBook(book);
  const lifecycleConfig = getBookLifecycleConfig(lifecycleStatus);
  const contributionsCount = book.contributions?.reduce(
    (acc, chapter) => acc + (chapter.contributions?.[0]?.count || 0),
    0
  ) || 0;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <article className="card dashboard-book-card">
      <div className="dashboard-book-top">
        <span className={`dashboard-book-status ${lifecycleConfig.tone}`}>{lifecycleConfig.label}</span>

        <div className="dashboard-book-tools">
          {autoDeleteDate && (
            <Tooltip text={`Suppression auto le ${formatDate(autoDeleteDate)}`}>
              <span className="dashboard-book-auto-delete-chip">Auto</span>
            </Tooltip>
          )}

          {showArchive && (
            <Tooltip text="Archiver ce livre">
              <button
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onArchive();
                }}
                className="dashboard-mini-action"
                type="button"
              >
                <IconArchive />
                <span>Archiver</span>
              </button>
            </Tooltip>
          )}

          {showRestore && (
            <Tooltip text="Restaurer ce livre">
              <button
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRestore();
                }}
                className="dashboard-mini-action"
                type="button"
              >
                <IconRestore />
                <span>Restaurer</span>
              </button>
            </Tooltip>
          )}

          <Tooltip text="Supprimer definitivement">
            <button
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete();
              }}
              className="dashboard-mini-action is-danger"
              type="button"
            >
              <IconDelete />
              <span>Supprimer</span>
            </button>
          </Tooltip>
        </div>
      </div>

      <Link to={`/book/${book.id}`} className="dashboard-book-link">
        <div className="dashboard-book-hero">
          <div className="dashboard-book-icon-wrap">
            <IconBook className="dashboard-book-icon" />
          </div>
          <div>
            <h3 className="dashboard-book-title">{book.title}</h3>
            <p className="dashboard-book-date">Cree le {formatDate(book.created_at)}</p>
          </div>
        </div>

        <div className="dashboard-book-stats">
          <div className="dashboard-book-stat-item">
            <div className="dashboard-book-stat-label">Chapitres</div>
            <div className="dashboard-book-stat-value">
              <IconChapter />
              <span>{book.chapters?.[0]?.count || 0}</span>
            </div>
          </div>

          <div className="dashboard-book-stat-item">
            <div className="dashboard-book-stat-label">Contributions</div>
            <div className="dashboard-book-stat-value">
              <IconContribution />
              <span>{contributionsCount}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-book-meta">
          <span className="dashboard-book-meta-pill">{book.finition || 'Classique'}</span>
          <span className="dashboard-book-meta-pill">{book.papier || 'Mat'}</span>
          <span className="dashboard-book-meta-pill">{book.event_type || 'Generique'}</span>
        </div>
      </Link>

      {autoDeleteDate && (
        <div className="dashboard-book-delete-note">
          Suppression auto: {formatDate(autoDeleteDate)}
        </div>
      )}
    </article>
  );
};

export default BookCardLuxe;
