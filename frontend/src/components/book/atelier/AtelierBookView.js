import React, { useEffect, useState } from 'react';

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
// "Taille reelle" (barre de navigation, toujours visible) ouvre le meme
// contenu (meme srcDoc, aucun nouvel appel reseau) dans un calque plein
// ecran, dimensionne en VRAIE taille d'impression (mm reels convertis en
// px, TOUJOURS a l'echelle 1 — jamais retassee/reduite/agrandie) — quitte a
// devoir defiler si l'ecran est plus petit que le format. Repli deliberé
// sur cette version apres 2 tentatives de "remplir l'ecran" (retour
// utilisateur : la mise a l'echelle, meme corrigee, "ne convenait pas") —
// voir RealSizePage plus bas pour l'historique complet.

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

// isSelected = "c'est la page en cours de modification" (celle que
// draftLayoutSlug/draftSlotItemIds decrivent). Differenciation forte
// deliberee (badge + assombrissement de l'autre page) pour qu'il soit
// impossible de deposer par erreur sur la mauvaise page d'un double-page.
function PagePane({ html, pageLabel, isSelected, onSelect, selectable, overlay, aspectRatio }) {
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
      {overlay}
      {selectable && isSelected && (
        <span className="atelier-page-pane-editing-badge">✎ Page en cours de modification</span>
      )}
      {isInactive && (
        <span className="atelier-page-pane-inactive-hint">Cliquer pour modifier</span>
      )}
      <span className="atelier-page-pane-label">{pageLabel}</span>
    </div>
  );
}

// Alignees sur backend/services/composition/coverFormat.js (COVER_FORMATS)
// — a garder synchronisees a la main si l'un des deux change. "Voir en
// taille reelle" n'a de sens que si la taille affichee EST la vraie taille
// du format choisi — un livret affiche a la taille d'un standard serait
// trompeur, pas juste approximatif.
const FORMAT_DIMENSIONS_MM = {
  livret: { widthMm: 170, heightMm: 170 }, // carre, voir coverFormat.js
  standard: { widthMm: 220, heightMm: 280 },
  luxe: { widthMm: 240, heightMm: 320 }
};

// Conversion physique standard (96dpi de reference), la meme que celle
// implicitement appliquee par l'unite CSS `mm` utilisee avant ce calcul JS.
const PX_PER_MM = 96 / 25.4;

// Historique de cette fonction, dans l'ordre (pour ne pas refaire les memes
// aller-retours) :
//  1. Taille reelle stricte + defilement si trop grand pour l'ecran
//     (.atelier-realsize-stage en overflow:auto, scrollbar doree fine).
//  2. Retour utilisateur "je veux voir ca sans scroll" -> mise a l'echelle
//     JS pour tenir dans l'ecran, plafonnee a 1 (jamais plus grand que le
//     vrai format papier).
//  3. Retour utilisateur "tjrs petit" -> plafond retire, remplissait tout
//     l'ecran disponible (au-dela de la taille physique si besoin).
//  4. BUG TROUVE (capture d'ecran a l'appui) : donner directement une
//     largeur/hauteur reduite/agrandie a l'<iframe> ne "zoome" pas son
//     contenu comme une photo — le document interieur SE REDIMENSIONNE
//     (100vw/100vh redevient la taille de l'iframe), alors que le CSS de la
//     page (pageRenderer.js/frontCoverRenderer.js) dimensionne le texte en
//     `pt`/`mm`, des unites PHYSIQUES independantes de la taille de
//     l'iframe — un titre en 34pt reste 34pt, mais a l'interieur d'un
//     "100vh" retreci il prend proportionnellement plus de place et se
//     fait tronquer. Corrige avec transform:scale() (zoom optique reel,
//     jamais de reflow) plutot qu'un redimensionnement direct.
//  5. Retour utilisateur, apres avoir revu (4) corrigee : "ca ne me
//     convient pas [...] remettre les scroll discrets" — l'idee meme de
//     "remplir/reduire l'ecran" est abandonnee, retour a (1) ci-dessous.
//     Comme l'echelle est de nouveau TOUJOURS 1 ici, le bug de (4) ne peut
//     de toute facon plus se produire (rien n'est jamais redimensionne).
//     Le principe du correctif (4) — taille naturelle + transform:scale(),
//     jamais un redimensionnement direct de l'iframe — reste a reappliquer
//     si un futur calque doit reellement changer d'echelle
//     (BookPreviewFinalLuxe.js notamment a probablement le meme bug latent,
//     jamais signale ni verifie).
function RealSizePage({ html, label, widthPx, heightPx }) {
  return (
    <div className="atelier-realsize-page">
      <span className="atelier-realsize-page-label">{label}</span>
      {html ? (
        <iframe
          title={label}
          srcDoc={html}
          className="atelier-realsize-frame"
          style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
        />
      ) : (
        <div className="atelier-page-placeholder" />
      )}
    </div>
  );
}

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
  // Format d'impression choisi (book.print_format) : determine la vraie
  // taille affichee par "Voir en taille reelle" (RealSizePage) — absent
  // ou inconnu replie sur "standard", jamais une erreur.
  printFormat
}) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const realSizeDimensions = FORMAT_DIMENSIONS_MM[printFormat] || FORMAT_DIMENSIONS_MM.standard;
  // Meme ratio que "Voir en taille reelle", applique cette fois au plateau
  // reduit (.atelier-page-pane) : le rendu de la page (pageRenderer.js)
  // s'etire toujours en 100vw/100vh dans son iframe, donc c'est la forme de
  // CE conteneur qui doit porter le vrai ratio du format choisi, sinon le
  // plateau parait identique quel que soit le format (meme bug que l'Apercu
  // final, corrige ici pour rester coherent).
  const pageAspectRatio = `${realSizeDimensions.widthMm} / ${realSizeDimensions.heightMm}`;

  // Echap pour fermer + bloque le defilement de la page derriere, meme
  // principe deja etabli pour AtelierGenerateModal/l'ancienne loupe de
  // BookCoverDesignerLuxe.js.
  useEffect(() => {
    if (!isFullscreenOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreenOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreenOpen]);

  const hasContentToExpand = viewKind === 'spread' ? Boolean(leftHtml || rightHtml) : Boolean(singleHtml);

  // Taille reelle stricte (echelle 1, toujours) — voir l'historique complet
  // dans le commentaire de RealSizePage plus haut. Simple conversion
  // mm -> px, aucun calcul d'ajustement a l'ecran necessaire : la zone
  // defile (.atelier-realsize-stage, overflow:auto + scrollbar fine doree)
  // si le format ne tient pas entierement dans la fenetre.
  const realSizeWidthPx = realSizeDimensions.widthMm * PX_PER_MM;
  const realSizeHeightPx = realSizeDimensions.heightMm * PX_PER_MM;

  return (
    <div className="atelier-book-view">
      <div className="atelier-book-stage">
        {loading && <p className="atelier-hint atelier-book-loading">Chargement de la page...</p>}

        {viewKind === 'cover' && (
          <PagePane html={singleHtml} pageLabel="Couverture" selectable={false} aspectRatio={pageAspectRatio} />
        )}

        {viewKind === 'back-cover' && (
          <PagePane html={singleHtml} pageLabel="4e de couverture" selectable={false} aspectRatio={pageAspectRatio} />
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
              aspectRatio={pageAspectRatio}
            />
            {rightPageNumber != null && (
              <PagePane
                html={rightHtml}
                pageLabel={`Page ${rightPageNumber}`}
                selectable
                isSelected={selectedSide === 'right'}
                onSelect={() => onSelectSide('right')}
                overlay={selectedSide === 'right' ? overlay : null}
                aspectRatio={pageAspectRatio}
              />
            )}
          </div>
        )}
      </div>

      <div className="atelier-book-nav">
        <div className="atelier-book-nav-side" aria-hidden="true" />
        <div className="atelier-book-nav-controls">
          <button type="button" className="btn btn-outline" onClick={onPrevious} disabled={!canGoPrevious}>
            ← precedente
          </button>
          <span className="atelier-book-nav-label">
            {navLabel}{totalPages ? ` / ${totalPages}` : ''}
          </span>
          <button type="button" className="btn btn-outline" onClick={onNext} disabled={!canGoNext}>
            suivante →
          </button>
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
            title="Voir le rendu reel, taille d'impression"
          >
            <ExpandIcon />
            <span>Taille reelle</span>
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
        // un clic dedans ne remonte jamais jusqu'ici. La croix reste geree en
        // plus (redondant avec le clic sur le calque, mais explicite/accessible).
        <div className="atelier-realsize-backdrop" onClick={() => setIsFullscreenOpen(false)}>
          <div className="atelier-realsize-panel">
            <div className="atelier-realsize-head">
              <span>
                {navLabel} — taille reelle ({realSizeDimensions.widthMm} × {realSizeDimensions.heightMm} mm)
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
            <div className="atelier-realsize-stage">
              {viewKind === 'spread' ? (
                <>
                  <RealSizePage html={leftHtml} label={`Page ${leftPageNumber}`} widthPx={realSizeWidthPx} heightPx={realSizeHeightPx} />
                  {rightPageNumber != null && <RealSizePage html={rightHtml} label={`Page ${rightPageNumber}`} widthPx={realSizeWidthPx} heightPx={realSizeHeightPx} />}
                </>
              ) : (
                <RealSizePage html={singleHtml} label={viewKind === 'cover' ? 'Couverture' : '4e de couverture'} widthPx={realSizeWidthPx} heightPx={realSizeHeightPx} />
              )}
            </div>
            {/* Naviguer sans quitter le calque (retour utilisateur : "il faut
                des fleches pour naviguer lorsque on est dessus") — memes
                onPrevious/onNext que la barre de navigation principale.
                stopPropagation obligatoire : sans lui, le clic remonterait
                jusqu'au calque et le fermerait au lieu de changer de page
                (voir le commentaire plus haut sur la fermeture au clic). */}
            <div className="atelier-realsize-nav">
              <button
                type="button"
                className="btn btn-outline"
                onClick={(event) => { event.stopPropagation(); onPrevious(); }}
                disabled={!canGoPrevious}
              >
                ‹ Précédente
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={(event) => { event.stopPropagation(); onNext(); }}
                disabled={!canGoNext}
              >
                Suivante ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AtelierBookView;
