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
//
// `hint` (optionnel) : une explication qui n'a pas besoin d'etre visible en
// permanence (§10 de la demande : "reduire fortement les textes d'aide
// permanents... utiliser plutot... tooltips, aide au survol") — posee comme
// infobulle native sur le titre plutot qu'affichee en texte sous lui.
//
// `variant` (retour utilisateur, 2026-09-26 — capture d'ecran a l'appui) :
//
//   'modal' (defaut, Mise en page/Pages) — fond plein ecran qui capture
//   TOUS les clics, ferme au clic dehors. Sans consequence ici : ces deux
//   tiroirs ont leur propre mini-apercu manipulable EN INTERNE (voir
//   LayoutFormatMiniature), ils n'ont jamais besoin que la vraie page
//   reste cliquable pendant qu'ils sont ouverts.
//
//   'rail' (Photos) — PAS DE FOND. « Je ne peux pas glisser de photo dans
//   la page » : le fond plein ecran du mode modal, meme transparent,
//   INTERCEPTE tout glisser-deposer et tout clic sur la page en dessous —
//   exactement le geste central de cette bibliotheque. En mode rail, le
//   panneau est un simple element du flux normal, pose a cote du livre
//   (voir BookAtelierLuxe.js : desormais un ENFANT de .atelier-workspace,
//   pas un calque fixe) : rien ne se pose par-dessus le livre, qui reste
//   entierement visible ET cliquable/receveur de glisser-deposer pendant
//   que le tiroir est ouvert. Sur petit ecran (<640px, voir le CSS), il n'y
//   a de toute facon pas la place pour les deux a la fois : il redevient
//   alors un panneau plein ecran classique, memes gestes qu'un modal.
function AtelierDrawer({ side = 'right', variant = 'modal', isOpen, onClose, title, subtitle, hint, children }) {
  const isRail = variant === 'rail';

  // Echap pour fermer. Le blocage du defilement de page derriere (mode
  // modal existant) n'a plus lieu d'etre en mode rail : rien ne recouvre
  // la page, il n'y a donc rien a proteger d'un defilement accidentel.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    if (isRail) {
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose, isRail]);

  if (!isOpen) return null;

  const panel = (
    <div
      className={`atelier-drawer atelier-drawer-${side} ${isRail ? 'is-rail' : ''}`}
      onClick={isRail ? undefined : (event) => event.stopPropagation()}
      role={isRail ? undefined : 'dialog'}
      aria-modal={isRail ? undefined : true}
      aria-label={title}
    >
      <div className="atelier-drawer-head">
        <div className="atelier-drawer-head-text">
          <span className="atelier-drawer-title" title={hint}>{title}</span>
          {subtitle && <span className="atelier-drawer-subtitle">{subtitle}</span>}
        </div>
        <button type="button" className="atelier-drawer-close" onClick={onClose} aria-label="Fermer">×</button>
      </div>
      <div className="atelier-drawer-body">
        {children}
      </div>
    </div>
  );

  // Mode rail : PAS de fond englobant — le panneau est renvoye TEL QUEL,
  // l'appelant le place directement dans le flux (voir BookAtelierLuxe.js).
  // Un fond ne reapparait qu'en CSS, sous 640px (voir .atelier-drawer-rail
  // dans BookAtelierLuxe.css), la ou il n'y a de toute facon plus de livre
  // visible a cote pour justifier de le laisser cliquable.
  if (isRail) return panel;

  return (
    <div className={`atelier-drawer-backdrop is-${side}`} onClick={onClose}>
      {panel}
    </div>
  );
}

export default AtelierDrawer;
