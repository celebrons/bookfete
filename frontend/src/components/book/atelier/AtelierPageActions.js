import React, { useEffect, useRef, useState } from 'react';

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

function AtelierPageActions({
  pageNumber,
  totalPages,
  onMoveToPosition,
  movingPage,
  onClearPage,
  hasContent
}) {
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

  // Voir AtelierLayoutPanel avant deplacement : Entree valide puis provoque
  // une perte de focus, qui validerait une seconde fois.
  const committedRef = useRef(null);
  const [positionError, setPositionError] = useState('');

  const commitPosition = (value) => {
    const wanted = Number(value);
    if (wanted === pageNumber) { setPositionError(''); return; }
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > totalPages) {
      setPositionError(`Entrez un numéro entre 1 et ${totalPages}.`);
      setPositionDraft(String(pageNumber));
      return;
    }
    if (committedRef.current === wanted) return;
    committedRef.current = wanted;
    setPositionError('');
    onMoveToPosition(wanted);
  };

  const canMove = Boolean(onMoveToPosition) && pageNumber != null && totalPages > 1;
  const canClear = Boolean(onClearPage) && hasContent;
  if (!canMove && !canClear) return null;

  return (
    // stopPropagation : la page entiere est cliquable (elle se selectionne),
    // un clic sur ces boutons ne doit pas la traverser.
    <div
      className="atelier-page-actions"
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
    >
      {canMove && (
        <div className="atelier-page-action">
          <button
            type="button"
            className={`atelier-page-action-btn ${open === 'move' ? 'is-open' : ''}`}
            onClick={() => setOpen(open === 'move' ? null : 'move')}
            title={`Déplacer cette page dans le livre (actuellement page ${pageNumber} sur ${totalPages})`}
            aria-label="Déplacer cette page dans le livre"
            aria-expanded={open === 'move'}
            disabled={movingPage}
          >
            <MoveIcon />
          </button>

          {open === 'move' && (
            <div className="atelier-page-popover">
              <span className="atelier-page-popover-title">Position dans le livre</span>
              <div className="atelier-page-position-row">
                <button
                  type="button"
                  className="atelier-page-position-step"
                  onClick={() => onMoveToPosition(pageNumber - 1)}
                  disabled={movingPage || pageNumber <= 1}
                  title="Avancer cette page d'un cran vers le début"
                  aria-label="Avancer cette page d'un cran vers le début"
                >
                  ◀
                </button>
                <span className="atelier-page-position-field">
                  page
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
                      committedRef.current = null;
                      setPositionError('');
                      setPositionDraft(event.target.value);
                    }}
                    onBlur={(event) => commitPosition(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitPosition(event.currentTarget.value);
                        event.currentTarget.blur();
                      }
                      if (event.key === 'Escape') {
                        setPositionDraft(String(pageNumber));
                        committedRef.current = null;
                      }
                    }}
                    aria-label={`Position de cette page (1 à ${totalPages})`}
                  />
                  sur {totalPages}
                </span>
                <button
                  type="button"
                  className="atelier-page-position-step"
                  onClick={() => onMoveToPosition(pageNumber + 1)}
                  disabled={movingPage || pageNumber >= totalPages}
                  title="Reculer cette page d'un cran vers la fin"
                  aria-label="Reculer cette page d'un cran vers la fin"
                >
                  ▶
                </button>
              </div>
              <p className={`atelier-page-popover-hint ${positionError ? 'is-error' : ''}`}>
                {positionError || (movingPage
                  ? 'Déplacement en cours…'
                  : 'Les autres pages se décalent. Vous pouvez aussi glisser la vignette dans la bande du bas.')}
              </p>
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
            title="Vider cette page"
            aria-label="Vider cette page"
            aria-expanded={open === 'clear'}
          >
            <ClearIcon />
          </button>

          {/* Confirmation conservee a l'identique : le geste reste en deux
              temps, seul son emplacement change. */}
          {open === 'clear' && (
            <div className="atelier-page-popover">
              <span className="atelier-page-popover-title">Vider cette page ?</span>
              <p className="atelier-page-popover-hint">
                Les souvenirs restent dans votre bibliothèque à gauche, seule la page est vidée.
              </p>
              <div className="atelier-page-popover-actions">
                <button
                  type="button"
                  className="atelier-page-popover-cancel"
                  onClick={() => setOpen(null)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="atelier-page-popover-confirm"
                  onClick={() => { setOpen(null); onClearPage(); }}
                >
                  Vider
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
