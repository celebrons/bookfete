import React from 'react';
import { Link } from 'react-router-dom';
import Tooltip from '../ui/Tooltip';
import {
  IconArchive,
  IconRestore,
  IconDelete
} from './DashboardIcons';
import {
  getBookLifecycleConfig,
  getBookLifecycleStatusFromBook
} from '../../utils/bookLifecycle';
import {
  getJourneyPrimaryAction,
  getJourneyStatusConfig,
  resolveBookJourneyStatus
} from '../../utils/clientJourney';
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
  const lifecycleConfig = getBookLifecycleConfig(getBookLifecycleStatusFromBook(book));
  const latestOrder = book?.latestOrder || null;
  const journeyStatus = resolveBookJourneyStatus({ book, latestOrder });
  const journeyConfig = getJourneyStatusConfig(journeyStatus);
  const primaryAction = getJourneyPrimaryAction(journeyStatus, latestOrder);
  const chaptersCount = book.chapters?.[0]?.count || 0;
  const contributionsCount = book.contributions?.reduce(
    (acc, chapter) => acc + (chapter.contributions?.[0]?.count || 0),
    0
  ) || 0;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
  };
  const resolvePrimaryActionPath = () => {
    if (primaryAction.key === 'follow_order' || primaryAction.key === 'open_orders') {
      return '/orders';
    }
    if (
      primaryAction.key === 'open_checkout'
      || primaryAction.key === 'pay_pending_order'
      || primaryAction.key === 'follow_pdf_generation'
      || primaryAction.key === 'download_pdf'
      || primaryAction.key === 'relaunch_order'
    ) {
      return `/book/${book.id}/checkout`;
    }
    return `/book/${book.id}`;
  };

  return (
    <article className="card dashboard-book-card">
      <div className="dashboard-book-top">
        <span
          className={`dashboard-book-status ${journeyConfig.tone || lifecycleConfig.tone}`}
          title={lifecycleConfig.label}
        >
          {journeyConfig.label || lifecycleConfig.label}
        </span>

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
                className="dashboard-mini-action is-icon"
                type="button"
                aria-label="Archiver ce livre"
              >
                <IconArchive />
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
                className="dashboard-mini-action is-icon"
                type="button"
                aria-label="Restaurer ce livre"
              >
                <IconRestore />
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
              className="dashboard-mini-action is-icon is-danger"
              type="button"
              aria-label="Supprimer ce livre"
            >
              <IconDelete />
            </button>
          </Tooltip>
        </div>
      </div>

      <Link to={`/book/${book.id}`} className="dashboard-book-link">
        <div className="dashboard-book-hero-minimal">
          <div>
            <h3 className="dashboard-book-title">{book.title}</h3>
            <p className="dashboard-book-date">Cree le {formatDate(book.created_at)}</p>
          </div>
        </div>

        <p className="dashboard-book-summary">
          {chaptersCount} chapitres · {contributionsCount} contributions
        </p>

        <div className="dashboard-book-meta-inline">
          <span>{book.finition || 'Classique'}</span>
          <span>{book.papier || 'Mat'}</span>
          <span>{book.event_type || 'Generique'}</span>
        </div>
      </Link>

      {!showRestore && (
        <div className="dashboard-book-primary">
          <Link to={resolvePrimaryActionPath()} className="dashboard-book-primary-btn">
            <span className="dashboard-book-primary-label">{primaryAction.label}</span>
            <span className="dashboard-book-primary-note">{primaryAction.note}</span>
          </Link>
        </div>
      )}

      {autoDeleteDate && (
        <div className="dashboard-book-delete-note">
          Suppression auto: {formatDate(autoDeleteDate)}
        </div>
      )}
    </article>
  );
};

export default BookCardLuxe;
