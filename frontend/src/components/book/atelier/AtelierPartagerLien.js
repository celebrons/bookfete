import React from 'react';
import './AtelierPartagerLien.css';

// Inviter des proches, DEPUIS l'atelier (2026-09-22).
//
// Le lien de partage n'existait que sur la carte du livre, au tableau de
// bord. Or on ne pense pas a inviter quand on regarde une liste de livres :
// on y pense quand on compose et qu'on voit les emplacements vides.
//
// MIS A JOUR (retour utilisateur, 2026-09-28) : renvoie desormais vers
// l'ECRAN D'INVITATION reel (activation du mode collectif, ou sa gestion si
// deja active) plutot que de copier un lien anonyme dans le presse-papiers —
// meme bascule que sur la carte du tableau de bord (BookCardLuxe.js) :
// l'invitation par email reelle (Brevo) merite desormais la place mise en
// avant. `onInvite` est fourni par BookAtelierLuxe.js, qui decide d'ouvrir
// la modale d'activation ou de naviguer vers /collectif selon
// `book.collective_activated_at`.
function AtelierPartagerLien({ isActivated, recipientName, onInvite }) {
  return (
    <div className="atelier-partage">
      <div className="atelier-partage-texte">
        <strong>Album collectif</strong>
        <span>
          {recipientName
            ? `Invitez vos proches à déposer leurs photos pour ${recipientName}.`
            : 'Invitez vos proches à déposer leurs photos et leurs mots.'}
        </span>
      </div>
      <button type="button" className="btn btn-outline atelier-partage-btn" onClick={onInvite}>
        {isActivated ? '👥 Gérer le collectif' : '🔗 Inviter des proches'}
      </button>
    </div>
  );
}

export default AtelierPartagerLien;
