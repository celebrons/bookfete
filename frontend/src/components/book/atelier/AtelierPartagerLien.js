import React, { useState } from 'react';
import './AtelierPartagerLien.css';

// Inviter des proches, DEPUIS l'atelier (2026-09-22).
//
// Le lien de partage n'existait que sur la carte du livre, au tableau de
// bord. Or on ne pense pas a inviter quand on regarde une liste de livres :
// on y pense quand on compose et qu'on voit les emplacements vides.
//
// Retour utilisateur : « en arrivant dans l'interface de composition, on ne
// voit pas de bouton de partage... il faut revenir au tableau de bord. Ce
// n'est pas un reflexe naturel. Moi-meme je cherchais ou etait le bouton. »
//
// Le meme lien, au meme endroit que le travail. On ne deplace rien : la
// carte du tableau de bord garde le sien.
//
// Copie dans le presse-papiers, avec repli : `navigator.clipboard` n'existe
// pas hors contexte securise, et echoue silencieusement dans certains
// navigateurs. On affiche alors le lien en clair, selectionnable — mieux
// vaut un lien a copier a la main qu'un bouton qui ne fait rien.
function AtelierPartagerLien({ shareToken, recipientName }) {
  const [copie, setCopie] = useState(false);
  const [lienVisible, setLienVisible] = useState(false);

  if (!shareToken) return null;

  const lien = `${window.location.origin}/participer/${shareToken}`;

  const partager = async () => {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch (_error) {
      setLienVisible(true);
    }
  };

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
      <button type="button" className="btn btn-outline atelier-partage-btn" onClick={partager}>
        {copie ? '✓ Lien copié' : '🔗 Inviter des proches'}
      </button>
      {lienVisible && (
        <input
          type="text"
          className="input-luxe atelier-partage-lien"
          value={lien}
          readOnly
          onFocus={(event) => event.target.select()}
        />
      )}
    </div>
  );
}

export default AtelierPartagerLien;
