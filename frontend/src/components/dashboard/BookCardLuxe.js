import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Tooltip from '../ui/Tooltip';
import {
  IconArchive,
  IconRestore,
  IconDelete,
  IconMore
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Ferme le menu "autres actions" au clic en dehors — evite d'avoir a
  // rajouter un overlay plein ecran juste pour ce petit panneau.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // book.participants : embed leger (status uniquement, voir
  // DashboardGeneralLuxe.js) — juste de quoi afficher le resume "N/M
  // participants" sans un appel reseau supplementaire par carte.
  const collectiveParticipants = book.participants || [];
  const isCollectiveActivated = Boolean(book.collective_activated_at);
  const collectiveCompletedCount = collectiveParticipants.filter((p) => p.status === 'completed').length;
  const collectiveTotalCount = collectiveParticipants.length;

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
  // Jour/mois seulement (ex. "22/09"), pour la ligne meta unique de la carte
  // — la maquette de reference n'y affiche jamais l'annee.
  const formatShortDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
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

          {/* Une seule action toujours visible (le statut) ; archiver,
              restaurer et supprimer — les actions occasionnelles — passent
              dans ce menu plutot que d'etre affichees en permanence sous
              forme de boutons icones (retour utilisateur 2026-09-28 : "des
              carres et des chiffres partout"). */}
          <div className="dashboard-book-menu" ref={menuRef}>
            <button
              type="button"
              className={`dashboard-mini-action is-icon dashboard-book-menu-btn ${menuOpen ? 'is-open' : ''}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label="Autres actions"
            >
              <IconMore />
            </button>

            {menuOpen && (
              <div className="dashboard-book-menu-panel" onClick={(event) => event.stopPropagation()}>
                {/* "Partager le lien" garde une place ici, pour les tests
                    uniquement (retour utilisateur 2026-09-28) : l'invitation
                    par email reelle (voir "Inviter"/"Gerer le collectif" en
                    pied de carte) est desormais l'action mise en avant, le
                    lien anonyme reste disponible en repli. Menu laisse
                    OUVERT apres le clic (pas de setMenuOpen(false)) pour que
                    la confirmation "Lien copie !" reste visible. */}
                {!showRestore && !isSoloProject && book.share_token && (
                  <button type="button" onClick={handleShareLink}>
                    {shareCopied ? 'Lien copié !' : 'Partager le lien'}
                  </button>
                )}

                {showArchive && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setMenuOpen(false);
                      onArchive();
                    }}
                  >
                    <IconArchive /> Archiver
                  </button>
                )}

                {showRestore && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setMenuOpen(false);
                      onRestore();
                    }}
                  >
                    <IconRestore /> Restaurer
                  </button>
                )}

                <button
                  type="button"
                  className="is-danger"
                  onClick={(event) => {
                    event.preventDefault();
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  <IconDelete /> Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Directement vers l'atelier (pas vers la fiche livre/onglet Edition,
          qui n'est plus qu'un lanceur redondant) : le premier clic depuis le
          dashboard doit amener au travail, jamais a un ecran intermediaire. */}
      <Link to={`/book/${book.id}/atelier`} className="dashboard-book-link">
        <div className="dashboard-book-hero-minimal">
          <div>
            {/* Repli : un livre peut legitimement n'avoir pas encore de titre
                — il ne se saisit plus qu'a l'etape couverture (2026-09-15). */}
            <h3 className="dashboard-book-title">{book.title || 'Livre sans titre'}</h3>
            <p
              className="dashboard-book-date"
              title={isSoloProject ? 'Projet solo : vous ajoutez vous-meme photos et textes' : 'Projet groupe : vos proches contribuent via un lien'}
            >
              {isSoloProject ? 'Solo' : 'Groupe'}
            </p>
          </div>
        </div>

        <p className="dashboard-book-summary">
          {souvenirsCount > 0 && <>{souvenirsCount} souvenir{souvenirsCount > 1 ? 's' : ''} · </>}
          {photosCount} photo{photosCount > 1 ? 's' : ''}
          {!isSoloProject ? ' reçue' + (photosCount > 1 ? 's' : '') : ''}
          {book.page_count ? ` · ${book.page_count} pages` : ''}
          {book.updated_at ? ` · modifié le ${formatShortDate(book.updated_at)}` : ''}
        </p>
      </Link>

      {showActivateModal && (
        <CollectiveActivateModal
          book={book}
          onClose={() => setShowActivateModal(false)}
          onActivated={() => navigate(`/book/${book.id}/collectif`)}
        />
      )}

      {!showRestore && (
        <div className="dashboard-book-footer">
          <Link to={resolvePrimaryActionPath()} className="dashboard-book-primary-btn">
            {primaryAction.label}
          </Link>
          {/* Invitation reelle (email Brevo) mise en avant a la place de
              "Partager" (retour utilisateur 2026-09-28) — le lien anonyme
              reste disponible dans le menu "..." pour les tests. */}
          {!isSoloProject && (
            isCollectiveActivated ? (
              <button
                type="button"
                className="dashboard-book-share-link"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  navigate(`/book/${book.id}/collectif`);
                }}
              >
                Gérer le collectif ({collectiveCompletedCount}/{collectiveTotalCount})
              </button>
            ) : (
              <button
                type="button"
                className="dashboard-book-share-link"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShowActivateModal(true);
                }}
              >
                Inviter
              </button>
            )
          )}
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
