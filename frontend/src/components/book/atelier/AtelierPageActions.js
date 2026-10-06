import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Actions qui portent sur LA PAGE elle-meme — la deplacer dans le livre, la
// vider — posees au coin bas droit de la page en cours de modification, en
// vis-a-vis de l'oeil "voir a l'echelle" qui occupe deja le coin haut droit.
//
// Elles vivaient dans le panneau de droite (2026-09-13), ou elles se
// melangeaient au travail de mise en page. La regle est desormais nette : le
// panneau sert a COMPOSER, la page porte ce qui AGIT SUR ELLE.
//
// Chaque pictogramme OUVRE le reglage complet, il ne le remplace pas. C'est
// volontaire : quelques heures plus tot, le deplacement de page n'existait
// que sous forme d'un glisser-deposer sans libelle, et il etait inutilisable
// ("je ne comprends pas le deplacement .. complique"). Un pictogramme seul
// aurait refait exactement la meme erreur.

function MoveIcon() {
  // Une page avec deux fleches : on deplace la page, on ne deplace pas dans
  // la page.
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="5.5" y="2.5" width="7" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 5.5 L0.8 8 L3 10.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.2 5.5 L15.2 10.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 4.5 H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.3 4.5 V3.2 A0.7 0.7 0 0 1 7 2.5 H9 A0.7 0.7 0 0 1 9.7 3.2 V4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.3 4.5 L5 13 A0.8 0.8 0 0 0 5.8 13.7 H10.2 A0.8 0.8 0 0 0 11 13 L11.7 4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

// Trois cases inegales : evoque une mise en page (des emplacements), pas un
// simple quadrillage — a distinguer du pictogramme "Pages" de la barre
// d'outils (AtelierToolsBar), qui lui evoque une pile de pages.
function LayoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8.3 1.5 V14.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 8.7 H8.3" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
    </svg>
  );
}

function AtelierPageActions({
  pageNumber,
  totalPages,
  onMoveToPosition,
  movingPage,
  onClearPage,
  hasContent,
  // Deuxieme chemin vers le tiroir "Mise en page" (refonte visuelle
  // 2026-09-26, §6 : "selectionner/survoler la page -> afficher une petite
  // action 'Modifier la mise en page' -> ouvrir un panneau contextuel").
  // Contrairement a Deplacer/Vider, ce bouton n'ouvre PAS un volet local
  // ici : il declenche directement le tiroir externe (AtelierDrawer, voir
  // BookAtelierLuxe.js) — un reglage complet, deja construit, pas besoin
  // d'un second popover qui ferait doublon. Absent -> pas de 3e icone,
  // comportement d'avant inchange.
  onOpenLayoutDrawer
}) {
  const { t } = useTranslation('atelier');
  // Un seul volet ouvert a la fois : deux petits panneaux superposes dans un
  // coin seraient illisibles.
  const [open, setOpen] = useState(null); // 'move' | 'clear' | null
  const rootRef = useRef(null);

  const [positionDraft, setPositionDraft] = useState('');
  useEffect(() => { setPositionDraft(pageNumber != null ? String(pageNumber) : ''); }, [pageNumber]);

  // Change de page : tout volet ouvert devient sans objet.
  useEffect(() => { setOpen(null); }, [pageNumber]);

  // Clic en dehors : referme. Meme comportement que les autres confirmations
  // de l'atelier — rien ne doit rester "arme" parce qu'on a clique ailleurs.
  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(null);
    };
    const handleKey = (event) => { if (event.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Retour utilisateur (2026-10-06) : "ajouter un petit bouton 'valider' au
  // moment de deplacer une page" — avant, TOUT (perte de focus, Entree, les
  // fleches ◀/▶) deplacait la page immediatement, sans jamais pouvoir
  // revoir/annuler la position avant qu'elle ne parte. Desormais, saisir un
  // numero ou cliquer ◀/▶ ne fait que PROPOSER une position (positionDraft) ;
  // seul le bouton Valider (confirmMove) declenche reellement onMoveToPosition
  // — meme principe en deux temps que "Vider cette page" juste en dessous.
  const [positionError, setPositionError] = useState('');

  // Pure : jamais appelee pendant le rendu avec un effet de bord. Renvoie
  // l'entier voulu, ou null si hors bornes.
  const validDraftValue = (value) => {
    const wanted = Number(value);
    return (Number.isInteger(wanted) && wanted >= 1 && wanted <= totalPages) ? wanted : null;
  };

  const adjustDraft = (delta) => {
    const base = validDraftValue(positionDraft) ?? pageNumber;
    const next = Math.min(totalPages, Math.max(1, base + delta));
    setPositionError('');
    setPositionDraft(String(next));
  };

  // Appelee a la perte de focus / Entree : valide et affiche une erreur le
  // cas echeant, mais ne commet JAMAIS le deplacement — seul Valider le fait.
  const validateDraft = (value) => {
    setPositionError(validDraftValue(value) === null ? t('pageActions.positionError', { total: totalPages }) : '');
  };

  const confirmMove = () => {
    const wanted = validDraftValue(positionDraft);
    if (wanted === null) { setPositionError(t('pageActions.positionError', { total: totalPages })); return; }
    if (wanted === pageNumber) { setOpen(null); return; }
    onMoveToPosition(wanted);
    setOpen(null);
  };

  const cancelMove = () => {
    setPositionDraft(String(pageNumber));
    setPositionError('');
    setOpen(null);
  };

  const pendingPosition = validDraftValue(positionDraft);
  const hasPendingChange = pendingPosition !== null && pendingPosition !== pageNumber;

  const canMove = Boolean(onMoveToPosition) && pageNumber != null && totalPages > 1;
  const canClear = Boolean(onClearPage) && hasContent;
  const canOpenLayout = Boolean(onOpenLayoutDrawer);
  if (!canMove && !canClear && !canOpenLayout) return null;

  return (
    // stopPropagation : la page entiere est cliquable (elle se selectionne),
    // un clic sur ces boutons ne doit pas la traverser.
    <div
      className="atelier-page-actions"
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
    >
      {canOpenLayout && (
        <div className="atelier-page-action">
          <button
            type="button"
            className="atelier-page-action-btn"
            onClick={onOpenLayoutDrawer}
            title={t('pageActions.editLayoutTitle')}
            aria-label={t('pageActions.editLayoutTitle')}
          >
            <LayoutIcon />
          </button>
        </div>
      )}

      {canMove && (
        <div className="atelier-page-action">
          <button
            type="button"
            className={`atelier-page-action-btn ${open === 'move' ? 'is-open' : ''}`}
            onClick={() => setOpen(open === 'move' ? null : 'move')}
            title={t('pageActions.moveTitle', { current: pageNumber, total: totalPages })}
            aria-label={t('pageActions.moveLabel')}
            aria-expanded={open === 'move'}
            disabled={movingPage}
          >
            <MoveIcon />
          </button>

          {open === 'move' && (
            <div className="atelier-page-popover">
              <span className="atelier-page-popover-title">{t('pageActions.positionTitle')}</span>
              <div className="atelier-page-position-row">
                <button
                  type="button"
                  className="atelier-page-position-step"
                  onClick={() => adjustDraft(-1)}
                  disabled={movingPage || (pendingPosition ?? pageNumber) <= 1}
                  title={t('pageActions.moveBackward')}
                  aria-label={t('pageActions.moveBackward')}
                >
                  ◀
                </button>
                <span className="atelier-page-position-field">
                  {t('pageActions.pagePrefix')}
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={positionDraft}
                    disabled={movingPage}
                    autoFocus
                    // Selectionne le numero au focus ET au clic. Sans ca,
                    // taper "1" l'AJOUTE au numero present ("2" -> "21"),
                    // donc une valeur hors bornes silencieusement refusee —
                    // defaut reel, mesure en pilotant l'application le
                    // 2026-09-13. Le clic compte autant que le focus : le
                    // champ etant deja focalise a l'ouverture du volet
                    // (autoFocus), cliquer dedans ne declenche AUCUN focus et
                    // la selection n'aurait jamais lieu.
                    onFocus={(event) => event.currentTarget.select()}
                    onClick={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      setPositionError('');
                      setPositionDraft(event.target.value);
                    }}
                    onBlur={(event) => validateDraft(event.target.value)}
                    onKeyDown={(event) => {
                      // Entree = raccourci clavier pour Valider (meme action
                      // que le bouton), jamais un chemin de validation a part.
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        confirmMove();
                      }
                      if (event.key === 'Escape') {
                        cancelMove();
                      }
                    }}
                    aria-label={t('pageActions.positionAriaLabel', { total: totalPages })}
                  />
                  {t('pageActions.pageSuffix', { total: totalPages })}
                </span>
                <button
                  type="button"
                  className="atelier-page-position-step"
                  onClick={() => adjustDraft(1)}
                  disabled={movingPage || (pendingPosition ?? pageNumber) >= totalPages}
                  title={t('pageActions.moveForward')}
                  aria-label={t('pageActions.moveForward')}
                >
                  ▶
                </button>
              </div>
              <p className={`atelier-page-popover-hint ${positionError ? 'is-error' : ''}`}>
                {positionError || (movingPage
                  ? t('pageActions.moving')
                  : (hasPendingChange ? t('pageActions.movePending', { position: pendingPosition }) : t('pageActions.moveHint')))}
              </p>
              {/* Deux temps, meme principe que "Vider cette page" ci-dessous :
                  rien ne part sans un clic explicite sur Valider (retour
                  utilisateur, 2026-10-06). */}
              <div className="atelier-page-popover-actions">
                <button
                  type="button"
                  className="atelier-page-popover-cancel"
                  onClick={cancelMove}
                  disabled={movingPage}
                >
                  {t('pageActions.cancel')}
                </button>
                <button
                  type="button"
                  className="atelier-page-popover-confirm"
                  onClick={confirmMove}
                  disabled={movingPage || !hasPendingChange}
                >
                  {t('pageActions.confirmMove')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canClear && (
        <div className="atelier-page-action">
          <button
            type="button"
            className={`atelier-page-action-btn is-danger ${open === 'clear' ? 'is-open' : ''}`}
            onClick={() => setOpen(open === 'clear' ? null : 'clear')}
            title={t('pageActions.clearTitle')}
            aria-label={t('pageActions.clearTitle')}
            aria-expanded={open === 'clear'}
          >
            <ClearIcon />
          </button>

          {/* Confirmation conservee a l'identique : le geste reste en deux
              temps, seul son emplacement change. */}
          {open === 'clear' && (
            <div className="atelier-page-popover">
              <span className="atelier-page-popover-title">{t('pageActions.clearConfirmTitle')}</span>
              <p className="atelier-page-popover-hint">
                {t('pageActions.clearHint')}
              </p>
              <div className="atelier-page-popover-actions">
                <button
                  type="button"
                  className="atelier-page-popover-cancel"
                  onClick={() => setOpen(null)}
                >
                  {t('pageActions.cancel')}
                </button>
                <button
                  type="button"
                  className="atelier-page-popover-confirm"
                  onClick={() => { setOpen(null); onClearPage(); }}
                >
                  {t('pageActions.clear')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AtelierPageActions;
