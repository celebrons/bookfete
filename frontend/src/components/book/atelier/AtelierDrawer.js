import React, { useEffect } from 'react';

// TIROIR GENERIQUE (refonte visuelle 2026-09-25).
//
// Jusqu'ici, la bibliotheque de photos, la mise en page et la pellicule de
// pages vivaient chacune dans une colonne PERMANENTE de la grille de
// l'atelier — visibles meme quand on ne s'en sert pas. La demande est
// explicite : "le livre est au centre, les outils sont secondaires et
// contextuels... je clique sur ce dont j'ai besoin, le panneau apparait, je
// ferme, le livre reprend tout l'espace".
//
// Ce composant est la coquille commune aux trois tiroirs (Photos, Mise en
// page, Pages, voir BookAtelierLuxe.js) : il n'enveloppe que la PRESENTATION
// (position, fond, fermeture) — le contenu reste exactement les composants
// existants (AtelierSidebar, AtelierLayoutPanel/AtelierCoverPanel,
// AtelierPageFilmstrip), montes tels quels, sans qu'un seul de ces fichiers
// n'ait besoin de connaitre l'existence du tiroir qui le contient.
//
// EN POSITION FIXE, PAS DANS LA GRILLE : c'est ce qui garantit que le livre
// ne retrecit jamais quand un tiroir s'ouvre (exigence explicite de la
// demande) — le tiroir se pose PAR-DESSUS, il ne partage pas la largeur
// disponible avec la colonne centrale.
//
// `side` : 'left' (Photos), 'right' (Mise en page), 'bottom' (Pages — une
// pellicule de vignettes veut de la largeur, pas une colonne etroite).
function AtelierDrawer({ side = 'right', isOpen, onClose, title, subtitle, children }) {
  // Echap pour fermer + bloque le defilement de la page derriere — meme
  // convention que le visualiseur plein ecran deja etabli dans ce projet
  // (AtelierBookView.js/BookPreviewFinalLuxe.js), sans reprendre SA classe
  // (has-fullscreen-viewer masque en plus l'en-tete du site, deja absent sur
  // cette route depuis la refonte de Layout.js — la reprendre ici n'aurait
  // aucun effet utile, seulement un nom trompeur).
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={`atelier-drawer-backdrop is-${side}`} onClick={onClose}>
      <div
        className={`atelier-drawer atelier-drawer-${side}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="atelier-drawer-head">
          <div className="atelier-drawer-head-text">
            <span className="atelier-drawer-title">{title}</span>
            {subtitle && <span className="atelier-drawer-subtitle">{subtitle}</span>}
          </div>
          <button type="button" className="atelier-drawer-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="atelier-drawer-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export default AtelierDrawer;
