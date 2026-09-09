import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import CollectiveActivateModal from './CollectiveActivateModal';
import './DashboardLuxe.css';

// Libelles humains des occasions (event_type) : book.event_type stocke le
// slug technique choisi a la creation (ex. "projet"), pas le libelle affiche
// dans ce meme formulaire (ex. "Fin de projet") — voir EVENT_TYPE_LABELS,
// backend/utils/bookCreationSchema.js (meme mapping, garder les deux
// synchronises). Slug inconnu -> affiche tel quel plutot que de disparaitre.
const EVENT_TYPE_LABELS = {
  anniversaire: 'Anniversaire',
  retraite: 'Retraite',
  depart: 'Depart',
  mariage: 'Mariage / Union',
  naissance: 'Naissance',
  voyage: 'Voyage / Vacances',
  projet: 'Fin de projet',
  famille: 'Reunion de famille',
  custom: 'Choix libre'
};
const resolveEventTypeLabel = (eventType) => (eventType ? (EVENT_TYPE_LABELS[eventType] || eventType) : 'Generique');

const BookCardLuxe = ({
  book,
  onArchive,
  onDelete,
  onRestore,
  showArchive = false,
  showRestore = false,
  autoDeleteDate
}) => {
  const navigate = useNavigate();
  const lifecycleConfig = getBookLifecycleConfig(getBookLifecycleStatusFromBook(book));
  const latestOrder = book?.latestOrder || null;
  const journeyStatus = resolveBookJourneyStatus({ book, latestOrder });
  const journeyConfig = getJourneyStatusConfig(journeyStatus);
  const primaryAction = getJourneyPrimaryAction(journeyStatus, latestOrder);
  const [shareCopied, setShareCopied] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);

  // book.participants : embed leger (status uniquement, voir
  // DashboardGeneralLuxe.js) — juste de quoi afficher le resume "N/M
  // participants" sans un appel reseau supplementaire par carte.
  const collectiveParticipants = book.participants || [];
  const isCollectiveActivated = Boolean(book.collective_activated_at);
  const collectiveCompletedCount = collectiveParticipants.filter((p) => p.status === 'completed').length;
  const collectiveTotalCount = collectiveParticipants.length;
  const collectiveDaysRemaining = book.collective_deadline
    ? Math.ceil((new Date(`${book.collective_deadline}T23:59:59`) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  // book_content_items (photos + textes), pas les anciens
  // chapters/contributions IA — voir DashboardGeneralLuxe.js.
  const contentItems = book.content_items || [];
  const photosCount = contentItems.filter((item) => item.kind === 'photo').length;
  const souvenirsCount = contentItems.filter((item) => item.kind === 'texte').length;

  const isSoloProject = (book.collection_mode || 'solo') === 'solo';

  const handleShareLink = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!book.share_token) return;
    const link = `${window.location.origin}/participer/${book.share_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (_err) {
      // Presse-papiers indisponible (permission/contexte non securise) :
      // pas bloquant, l'utilisateur peut toujours copier le lien depuis la
      // barre d'adresse s'il ouvre la page /participer/:token lui-meme.
    }
  };

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
    if (primaryAction.key === 'continue_editing') {
      // Directement vers l'atelier (pages, couverture, 4e) : c'est
      // desormais l'action d'edition principale (l'automatique reste
      // disponible en action secondaire, depuis l'atelier lui-meme).
      return `/book/${book.id}/atelier`;
    }
    return `/book/${book.id}`;
  };

  return (
    <article className="card dashboard-book-card">
      <div className="dashboard-book-top">
        <div className="dashboard-book-top-badges">
          <span
            className={`dashboard-book-status ${journeyConfig.tone || lifecycleConfig.tone}`}
            title={lifecycleConfig.label}
          >
            {journeyConfig.label || lifecycleConfig.label}
          </span>

          <Tooltip text={isSoloProject ? 'Projet solo : vous ajoutez vous-meme photos et textes' : 'Projet groupe : vos proches contribuent via un lien'}>
            <span className={`dashboard-book-mode-badge ${isSoloProject ? 'is-solo' : 'is-groupe'}`}>
              {isSoloProject ? 'Solo' : 'Groupe'}
            </span>
          </Tooltip>
        </div>

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

      {/* Directement vers l'atelier (pas vers la fiche livre/onglet Edition,
          qui n'est plus qu'un lanceur redondant) : le premier clic depuis le
          dashboard doit amener au travail, jamais a un ecran intermediaire. */}
      <Link to={`/book/${book.id}/atelier`} className="dashboard-book-link">
        <div className="dashboard-book-hero-minimal">
          <div>
            <h3 className="dashboard-book-title">{book.title}</h3>
            <p className="dashboard-book-date">Cree le {formatDate(book.created_at)}</p>
          </div>
        </div>

        <p className="dashboard-book-summary">
          {souvenirsCount} souvenir{souvenirsCount > 1 ? 's' : ''} · {photosCount} photo{photosCount > 1 ? 's' : ''}
          {!isSoloProject ? ' reçue' + (photosCount > 1 ? 's' : '') : ''}
          {book.page_count ? ` · ${book.page_count} pages` : ''}
        </p>

        <div className="dashboard-book-meta-inline">
          <span>{resolveEventTypeLabel(book.event_type)}</span>
          {book.updated_at && <span>Modifié le {formatDate(book.updated_at)}</span>}
        </div>
      </Link>

      {!showRestore && !isSoloProject && book.share_token && (
        <button type="button" className="dashboard-book-share-btn" onClick={handleShareLink}>
          {shareCopied ? 'Lien copié !' : '🔗 Partager le lien'}
        </button>
      )}

      {/* Mode collectif : couche additive au-dessus du lien de partage
          ci-dessus (jamais un remplacement) — invitations nominatives avec
          suivi, voir BookCollectiveLuxe.js/CollectiveActivateModal.js. */}
      {!showRestore && !isSoloProject && (
        <div className="dashboard-book-collective">
          {isCollectiveActivated ? (
            <>
              <div className="dashboard-book-collective-summary">
                <span>👥 {collectiveCompletedCount} / {collectiveTotalCount} participant{collectiveTotalCount > 1 ? 's' : ''}</span>
                {collectiveDaysRemaining != null && (
                  <span>{collectiveDaysRemaining >= 0
                    ? `⏳ ${collectiveDaysRemaining} jour${collectiveDaysRemaining > 1 ? 's' : ''} restant${collectiveDaysRemaining > 1 ? 's' : ''}`
                    : 'Collecte terminée'}
                  </span>
                )}
              </div>
              <Link
                to={`/book/${book.id}/collectif`}
                className="btn btn-outline dashboard-book-collective-btn"
                onClick={(event) => event.stopPropagation()}
              >
                Gérer le collectif
              </Link>
            </>
          ) : (
            <>
              <span className="dashboard-book-collective-label">👥 Mode collectif</span>
              <button
                type="button"
                className="btn btn-outline dashboard-book-collective-btn"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShowActivateModal(true);
                }}
              >
                Activer le mode collectif
              </button>
            </>
          )}
        </div>
      )}

      {showActivateModal && (
        <CollectiveActivateModal
          book={book}
          onClose={() => setShowActivateModal(false)}
          onActivated={() => navigate(`/book/${book.id}/collectif`)}
        />
      )}

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
