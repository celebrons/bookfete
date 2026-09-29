import React from 'react';
import './AtelierPartagerLien.css';

// Album collectif, DEPUIS l'atelier (2026-09-22).
//
// Le lien de partage n'existait que sur la carte du livre, au tableau de
// bord. Or on ne pense pas a inviter quand on regarde une liste de livres :
// on y pense quand on compose et qu'on voit les emplacements vides.
//
// MIS A JOUR (retour utilisateur, 2026-09-29) : n'est plus qu'une carte
// D'INFORMATION, sans bouton — l'action ("Inviter" / "Gérer le collectif")
// a rejoint l'en-tete de l'atelier (voir handleInvite, BookAtelierLuxe.js),
// et avoir le MEME bouton ici en plus faisait doublon a l'ecran. Cette
// carte garde son role de premiere decouverte/explication pour qui compose
// et voit les emplacements vides, sans dupliquer l'action elle-meme.
function AtelierPartagerLien({ recipientName }) {
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
    </div>
  );
}

export default AtelierPartagerLien;
