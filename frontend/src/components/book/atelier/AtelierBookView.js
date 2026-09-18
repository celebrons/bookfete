import React, { useEffect, useState } from 'react';
import { PageZoomStage, ZoomControls } from '../../common/PageZoomStage';

// Colonne centrale de l'atelier : le livre sous forme de vraies pages, en
// double-page — feuilletage COUVERTURE -> pages interieures -> 4E DE
// COUVERTURE (cahier des charges §11 : les couvertures restent gerees par
// leur systeme dedie, jamais traitees comme des pages ordinaires, mais on
// peut les feuilleter ici comme le reste du livre).
//
// Chaque page affichee est un iframe pointant sur le rendu serveur reel
// (meme moteur que le PDF final, voir compositionApi.fetchInteriorPagePreviewHtml/
// fetchCoverPreviewHtml) : jamais une maquette cote client — l'utilisateur
// voit exactement ce qu'il obtiendra. Le plateau de travail, lui, affiche
// les pages retassees pour tenir dans l'espace disponible (partage avec les
// colonnes gauche/droite) — pas a l'echelle reelle d'impression. Le bouton
// "Voir à l'échelle" (barre de navigation, toujours visible) ouvre le meme
// contenu (meme srcDoc, aucun nouvel appel reseau) dans un calque plein
// ecran base sur PageZoomStage (voir common/PageZoomStage.js) : le livre
// garde TOUJOURS ses vraies proportions, mis a l'echelle automatiquement
// pour remplir l'espace disponible (jamais de scrollbar, jamais deforme),
// avec un zoom/panoramique libre par-dessus cet ajustement — refonte
// complete du 2026-09-09 ("cahier des charges REFONTE UX DES APERCUS"), qui
// remplace l'ancienne mecanique "taille reelle stricte + defilement" (voir
// l'historique detaille dans PageZoomStage.js et la memoire du projet).

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </svg>
  );
}

// Calque cliquable pose sur la couverture/4e de couverture (retour
// utilisateur, 2026-09-10 : "permettre de modifier la photo... en cliquant
// sur l'image... idealement modifier directement sur les pages") — meme
// principe que AtelierPageOverlay.js pour les pages interieures (selection
// dans "Mes souvenirs" puis clic pour assigner), mais un seul grand
// emplacement (toute la page), pas une grille de slots. L'iframe en dessous
// a pointer-events:none (BookAtelierLuxe.css), le clic passe donc
// naturellement a travers jusqu'ici.
function CoverPhotoOverlay({ onAssign, selectedSidebarItem, onAdjust, hasPhoto }) {
  if (!onAssign) return null;
  const isPhotoSelected = selectedSidebarItem?.kind === 'photo';
  const hint = isPhotoSelected
    ? 'Cliquer pour utiliser cette photo'
    : 'Sélectionnez une photo dans "Mes souvenirs", puis cliquez ici';
  return (
    <div
      className={`atelier-cover-photo-overlay ${isPhotoSelected ? 'is-armed' : ''}`}
      onClick={(event) => { event.stopPropagation(); if (isPhotoSelected) onAssign(selectedSidebarItem.id); }}
      title={hint}
    >
      <span className="atelier-cover-photo-overlay-hint">{hint}</span>
      {/* Recadrer la photo de couverture. Un BOUTON a part, pas un clic sur
          l'image : le clic sur l'image sert deja a REMPLACER la photo quand
          une est selectionnee dans "Mes souvenirs", et les deux gestes ne
          peuvent pas partager le meme declencheur.
          Jusqu'au 2026-09-15, la couverture etait toujours recadree au centre
          sans aucun recours — « il faut pouvoir ajuster la photo de la 4e de
          couverture, la photo est tronquee ». */}
      {onAdjust && hasPhoto && !isPhotoSelected && (
        <button
          type="button"
          className="atelier-cover-adjust-btn"
          onClick={(event) => { event.stopPropagation(); onAdjust(); }}
          title="Ajuster le cadrage de cette photo"
        >
          <CropIcon />
          Ajuster le cadrage
        </button>
      )}
    </div>
  );
}

function CropIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 2v13.5A1.5 1.5 0 0 0 8 17h13.5" />
      <path d="M2.5 6.5H16A1.5 1.5 0 0 1 17.5 8v13.5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// isSelected = "c'est la page en cours de modification" (celle que
// draftLayoutSlug/draftSlotItemIds decrivent). Differenciation forte
// deliberee (badge + assombrissement de l'autre page) pour qu'il soit
// impossible de deposer par erreur sur la mauvaise page d'un double-page.
function PagePane({ html, pageLabel, isSelected, onSelect, selectable, overlay, aspectRatio, onExpand, actions }) {
  const isInactive = selectable && !isSelected;
  return (
    <div
      className={`atelier-page-pane ${selectable ? 'is-selectable' : ''} ${isSelected ? 'is-selected' : ''} ${isInactive ? 'is-inactive' : ''}`}
      onClick={selectable ? onSelect : undefined}
      title={isInactive ? 'Cliquer pour modifier cette page' : undefined}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {html ? (
        <iframe title={pageLabel} srcDoc={html} className="atelier-page-frame" />
      ) : (
        <div className="atelier-page-placeholder" />
      )}
      {/* "Voir a l'echelle", pose sur LA PAGE et non sur le plateau.
          Auparavant il vivait au coin haut droit de .atelier-book-stage :
          en double-page, ce coin est celui de la page de DROITE, donc loin
          de la page qu'on est en train de modifier — et hors champ des que
          la colonne centrale rogne le plateau. L'utilisateur ne le trouvait
          plus ("l'oeil de l'apercu en haut de page n'apparait tjrs pas").
          Ici il est toujours sur la page regardee. */}
      {onExpand && html && (
        <button
          type="button"
          className="atelier-book-stage-eye"
          onClick={(event) => { event.stopPropagation(); onExpand(); }}
          title="Voir à l'échelle — proportions et dimensions d'impression respectées"
          aria-label="Voir à l'échelle"
        >
          <EyeIcon />
        </button>
      )}
      {overlay}
      {/* Actions sur la page (deplacer / vider) — coin bas droit, en
          vis-a-vis de l'oeil. Uniquement sur la page en cours de
          modification : les poser sur les deux pages d'un double-page
          encombrerait pour rien et rendrait ambigu ce sur quoi elles
          agissent. */}
      {selectable && isSelected && actions}
      {/* « Page en cours de modification » se lisait comme un travail du
          SYSTEME — l utilisateur pouvait croire qu une operation tournait en
          arriere-plan et qu il fallait attendre. On s adresse donc a lui
          directement : c est LUI qui modifie cette page (2026-09-18). */}
      {selectable && isSelected && (
        <span className="atelier-page-pane-editing-badge">✎ Vous modifiez cette page</span>
      )}
      {isInactive && (
        <span className="atelier-page-pane-inactive-hint">Cliquer pour modifier</span>
      )}
      <span className="atelier-page-pane-label">{pageLabel}</span>
    </div>
  );
}

// Alignees sur backend/services/composition/coverFormat.js (COVER_FORMATS)
// — a garder synchronisees a la main si l'un des deux change. "Voir a
// l'echelle" n'a de sens que si les PROPORTIONS affichees sont celles du
// format choisi — un livret affiche avec les proportions d'un standard
// serait trompeur, pas juste approximatif.
// 2026-09-09 : realigne sur le catalogue reel Gelato — voir le commentaire
// d'en-tete de backend/services/composition/coverFormat.js (source de
// verite) pour le detail. Luxe partage desormais le meme gabarit que
// Standard (21x28cm) — seule la couverture (rigide) differe.
const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 200, heightMm: 200 }, // carre, voir coverFormat.js
  standard: { widthMm: 210, heightMm: 280 },
  luxe: { widthMm: 210, heightMm: 280 }
};

// Conversion physique standard (96dpi de reference) — sert uniquement a
// donner a PageZoomStage des dimensions de CONTENU coherentes entre elles
// (le rapport largeur/hauteur compte, pas la justesse physique a l'ecran :
// voir le renommage "Voir a l'echelle", cahier des charges §3 — "22cm CSS
// ne correspond pas forcement a 22cm physiques selon le DPI de l'ecran").
const PX_PER_MM = 96 / 25.4;

// Interstice entre les deux pages d'une double-page — sert aussi de largeur
// a la "tranche" decorative (.atelier-zoom-spine) qui simule la reliure.
const SPREAD_GAP_PX = 16;

function AtelierBookView({
  viewKind, // 'cover' | 'spread' | 'back-cover'
  loading,
  singleHtml,
  leftHtml,
  rightHtml,
  leftPageNumber,
  rightPageNumber,
  totalPages,
  selectedSide,
  onSelectSide,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
  navLabel,
  // Incrustation de glisser-deposer directe (voir AtelierPageOverlay) —
  // n'affiche jamais que sur le cote actuellement selectionne : c'est lui
  // seul que draftLayoutSlug/draftSlotItemIds (BookAtelierLuxe.js)
  // decrivent, deposer sur l'autre cote modifierait la mauvaise page.
  overlay,
  // Actions posees sur la page en cours de modification (deplacer / vider) —
  // voir AtelierPageActions. Un noeud deja construit par l'appelant, comme
  // `overlay` : cette vue ne connait pas ces mecaniques, elle leur donne
  // seulement une place.
  pageActions,
  // Format d'impression choisi (book.print_format) : determine les vraies
  // proportions affichees par "Voir a l'echelle" — absent ou inconnu replie
  // sur "standard", jamais une erreur.
  printFormat,
  // Assignation directe de la photo de couverture/4e en cliquant sur l'image
  // (voir CoverPhotoOverlay ci-dessus) — absent -> aucun calque affiche
  // (repli neutre, ex. si jamais utilise sans cette fonctionnalite branchee).
  onAssignCoverPhoto,
  // Recadrage de la photo de couverture (facultatif : sans lui, aucun bouton
  // n'apparait et le comportement d'avant est inchange).
  onAdjustCoverPhoto,
  coverHasPhoto,
  // Sauts directs aux deux extremites du livre. Facultatifs : sans eux, la
  // barre se comporte exactement comme avant.
  onGoToCover,
  onGoToBackCover,
  selectedSidebarItem
}) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [zoom, setZoom] = useState('fit');
  const formatDimensions = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;
  // Meme ratio que "Voir a l'echelle", applique cette fois au plateau
  // reduit (.atelier-page-pane) : le rendu de la page (pageRenderer.js)
  // s'etire toujours en 100vw/100vh dans son iframe, donc c'est la forme de
  // CE conteneur qui doit porter le vrai ratio du format choisi, sinon le
  // plateau parait identique quel que soit le format (meme bug que l'Apercu
  // final, corrige ici pour rester coherent).
  const pageAspectRatio = `${formatDimensions.widthMm} / ${formatDimensions.heightMm}`;

  // Echap pour fermer + bloque le defilement de la page derriere, meme
  // principe deja etabli pour AtelierGenerateModal/l'ancienne loupe de
  // BookCoverDesignerLuxe.js. Masque aussi l'en-tete global (retour
  // utilisateur : "ça fait gagner de l'espace") via une classe sur <body>
  // (voir Layout.css : body.has-fullscreen-viewer .site-header) — l'en-tete
  // vit tout en haut de l'arbre (Layout.js, hors de portee directe d'ici),
  // c'est le seul point d'accroche simple sans faire remonter un etat React
  // jusque-la pour un besoin purement cosmetique.
  useEffect(() => {
    if (!isFullscreenOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreenOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('has-fullscreen-viewer');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('has-fullscreen-viewer');
    };
  }, [isFullscreenOpen]);

  const hasContentToExpand = viewKind === 'spread' ? Boolean(leftHtml || rightHtml) : Boolean(singleHtml);

  // Dimensions NATURELLES (mm -> px) transmises a PageZoomStage — c'est LUI
  // qui calcule l'echelle d'ajustement et l'applique globalement (voir
  // common/PageZoomStage.js). Une double-page complete additionne les deux
  // pages ET l'interstice entre elles : PageZoomStage doit connaitre la
  // largeur REELLE du duo pour calculer un ajustement correct, pas juste
  // celle d'une page.
  const pageWidthPx = formatDimensions.widthMm * PX_PER_MM;
  const pageHeightPx = formatDimensions.heightMm * PX_PER_MM;
  const isSpreadWithBothPages = viewKind === 'spread' && rightPageNumber != null;
  const contentWidthPx = isSpreadWithBothPages ? pageWidthPx * 2 + SPREAD_GAP_PX : pageWidthPx;
  const contentHeightPx = pageHeightPx;

  // Cle de remontage : change a chaque page/vue differente, pour (1)
  // reinitialiser le panoramique (PageZoomStage.resetPanKey, voir ce
  // fichier) et (2) rejouer la transition douce d'apparition
  // (.atelier-zoom-page-change, cahier des charges §7 "transition douce
  // lors du changement de page").
  const pageChangeKey = viewKind === 'spread' ? `spread-${leftPageNumber}` : viewKind;

  return (
    <div className="atelier-book-view">
      <div className="atelier-book-stage">
        {/* Le raccourci "Voir à l'échelle" (retour utilisateur : "un petit
            oeil sur le coin haut droit du livre") est desormais rendu DANS
            chaque page (voir PagePane) plutot qu'ici, au coin du plateau —
            voir le commentaire de PagePane pour la raison. Le bouton
            permanent de la barre de navigation ci-dessous reste inchange :
            deux acces au meme calque, l'un explicite en bas, l'un rapide et
            discret sur la page elle-meme. */}

        {loading && <p className="atelier-hint atelier-book-loading">Chargement de la page...</p>}

        {viewKind === 'cover' && (
          <PagePane
            html={singleHtml}
            pageLabel="Couverture"
            selectable={false}
            aspectRatio={pageAspectRatio}
            onExpand={() => setIsFullscreenOpen(true)}
            overlay={(
              <CoverPhotoOverlay
                onAssign={onAssignCoverPhoto ? (itemId) => onAssignCoverPhoto('front', itemId) : null}
                selectedSidebarItem={selectedSidebarItem}
                onAdjust={onAdjustCoverPhoto ? () => onAdjustCoverPhoto('front') : null}
                hasPhoto={coverHasPhoto}
              />
            )}
          />
        )}

        {viewKind === 'back-cover' && (
          <PagePane
            html={singleHtml}
            pageLabel="4e de couverture"
            selectable={false}
            aspectRatio={pageAspectRatio}
            onExpand={() => setIsFullscreenOpen(true)}
            overlay={(
              <CoverPhotoOverlay
                onAssign={onAssignCoverPhoto ? (itemId) => onAssignCoverPhoto('back', itemId) : null}
                selectedSidebarItem={selectedSidebarItem}
                onAdjust={onAdjustCoverPhoto ? () => onAdjustCoverPhoto('back') : null}
                hasPhoto={coverHasPhoto}
              />
            )}
          />
        )}

        {viewKind === 'spread' && (
          <div className="atelier-spread">
            <PagePane
              html={leftHtml}
              pageLabel={`Page ${leftPageNumber}`}
              selectable
              isSelected={selectedSide === 'left'}
              onSelect={() => onSelectSide('left')}
              overlay={selectedSide === 'left' ? overlay : null}
              actions={pageActions}
              aspectRatio={pageAspectRatio}
              onExpand={() => setIsFullscreenOpen(true)}
            />
            {rightPageNumber != null && (
              <PagePane
                html={rightHtml}
                pageLabel={`Page ${rightPageNumber}`}
                selectable
                isSelected={selectedSide === 'right'}
                onSelect={() => onSelectSide('right')}
                overlay={selectedSide === 'right' ? overlay : null}
                actions={pageActions}
                aspectRatio={pageAspectRatio}
                onExpand={() => setIsFullscreenOpen(true)}
              />
            )}
          </div>
        )}
      </div>

      <div className="atelier-book-nav">
        <div className="atelier-book-nav-side" aria-hidden="true" />
        <div className="atelier-book-nav-controls">
          {/* Sauts directs aux deux extremites. Sans eux, atteindre la 4e d'un
              livre de 30 pages demandait 16 clics, et autant pour revenir
              (retour utilisateur 2026-09-15 : « on est obliges de feuilleter
              tout l'album »). La pellicule du bas offre deja ces deux cibles,
              mais elle defile : sur un livre long elles en sortent. */}
          {onGoToCover && (
            <button
              type="button"
              className="btn btn-outline atelier-book-nav-jump"
              onClick={onGoToCover}
              disabled={!canGoPrevious}
              title="Aller à la couverture"
            >
              ⇤ Couverture
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={onPrevious} disabled={!canGoPrevious}>
            ← precedente
          </button>
          <span className="atelier-book-nav-label">
            {navLabel}{totalPages ? ` / ${totalPages}` : ''}
          </span>
          <button type="button" className="btn btn-outline" onClick={onNext} disabled={!canGoNext}>
            suivante →
          </button>
          {onGoToBackCover && (
            <button
              type="button"
              className="btn btn-outline atelier-book-nav-jump"
              onClick={onGoToBackCover}
              disabled={!canGoNext}
              title="Aller à la 4e de couverture"
            >
              4e ⇥
            </button>
          )}
        </div>
        {/* Deplace hors du coin de page (retour utilisateur : "le rendre
            plus visible/permanent renforcerait la confiance avant Terminer
            mon livre") — reste maintenant a la meme place quelle que soit
            la vue (couverture/interieur/4e), au lieu de flotter par-dessus
            le contenu d'une seule page. */}
        <div className="atelier-book-nav-side atelier-book-nav-side-end">
          <button
            type="button"
            className="atelier-realsize-toggle-btn"
            onClick={() => setIsFullscreenOpen(true)}
            disabled={!hasContentToExpand}
            title="Voir à l'échelle — proportions et dimensions d'impression respectées"
          >
            <ExpandIcon />
            <span>Voir à l'échelle</span>
          </button>
        </div>
      </div>

      {isFullscreenOpen && hasContentToExpand && (
        // Fermeture au clic n'importe ou DANS le calque (retour utilisateur :
        // "il faut qu'il disparaisse... lorsque je clique a cote", jusqu'ici
        // impossible car .atelier-realsize-panel stoppait la propagation et
        // occupait 100% du calque — cliquer "a cote" de la page revenait donc
        // toujours a cliquer DANS le panneau). Plus de stopPropagation nulle
        // part : un clic sur la page reelle elle-meme ne ferme jamais quand
        // meme, car c'est un <iframe> — son contenu est un document separe,
        // un clic dedans ne remonte jamais jusqu'ici (et un clic qui suit un
        // panoramique est avale par PageZoomStage lui-meme). La croix reste
        // geree en plus (redondant avec le clic sur le calque, mais
        // explicite/accessible).
        <div className="atelier-realsize-backdrop" onClick={() => setIsFullscreenOpen(false)}>
          {/* Pas de stopPropagation ICI (deliberement — voir le commentaire
              plus haut) : un clic sur le calque en dehors du livre doit
              toujours fermer, y compris sur l'espace vide autour du livre
              a l'interieur du plateau de zoom. Seuls les CONTROLES
              cliquables du bas (nav/zoom, ci-dessous) stoppent la
              propagation individuellement — sans ca, cliquer sur "Suivante"
              ou "+" fermerait aussi le calque. */}
          <div className="atelier-realsize-panel">
            <div className="atelier-realsize-head">
              <span>
                {navLabel} — Voir à l'échelle
                {/* Cahier des charges §3 : "taille reelle" est trompeur sur
                    ecran (22cm CSS != 22cm physiques selon le DPI) — cette
                    formule remplace l'ancien affichage brut des mm. */}
                <span className="atelier-realsize-hint"> · Proportions et dimensions d'impression respectées</span>
              </span>
              <button
                type="button"
                className="atelier-modal-close"
                onClick={() => setIsFullscreenOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="atelier-realsize-stage-wrap">
              <PageZoomStage
                contentWidthPx={contentWidthPx}
                contentHeightPx={contentHeightPx}
                zoom={zoom}
                onZoomChange={setZoom}
                resetPanKey={pageChangeKey}
              >
                {viewKind === 'spread' ? (
                  <div className="atelier-zoom-spread atelier-zoom-page-change" key={pageChangeKey}>
                    {leftHtml ? (
                      <iframe title={`Page ${leftPageNumber}`} srcDoc={leftHtml} className="atelier-zoom-frame" />
                    ) : (
                      <div className="atelier-page-placeholder" />
                    )}
                    {isSpreadWithBothPages && <span className="atelier-zoom-spine" aria-hidden="true" />}
                    {rightPageNumber != null && (
                      rightHtml ? (
                        <iframe title={`Page ${rightPageNumber}`} srcDoc={rightHtml} className="atelier-zoom-frame" />
                      ) : (
                        <div className="atelier-page-placeholder" />
                      )
                    )}
                  </div>
                ) : (
                  <div className="atelier-zoom-single atelier-zoom-page-change" key={pageChangeKey}>
                    {singleHtml ? (
                      <iframe
                        title={viewKind === 'cover' ? 'Couverture' : '4e de couverture'}
                        srcDoc={singleHtml}
                        className="atelier-zoom-frame"
                      />
                    ) : (
                      <div className="atelier-page-placeholder" />
                    )}
                  </div>
                )}
              </PageZoomStage>
            </div>

            {/* Naviguer/zoomer sans quitter le calque (retour utilisateur :
                "il faut des fleches pour naviguer lorsque on est dessus") —
                memes onPrevious/onNext que la barre de navigation
                principale. stopPropagation sur tout le bloc (pas bouton par
                bouton) : sans lui, cliquer "Suivante" ou "+" fermerait
                aussi le calque (voir le commentaire plus haut sur la
                fermeture au clic exterieur). */}
            <div className="atelier-realsize-footer" onClick={(event) => event.stopPropagation()}>
              <div className="atelier-realsize-nav">
                <button type="button" className="btn btn-outline" onClick={onPrevious} disabled={!canGoPrevious}>
                  ‹ Précédente
                </button>
                <span className="atelier-realsize-nav-label">{navLabel}</span>
                <button type="button" className="btn btn-outline" onClick={onNext} disabled={!canGoNext}>
                  Suivante ›
                </button>
              </div>
              <ZoomControls zoom={zoom} onZoomChange={setZoom} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AtelierBookView;
