import React, { useEffect } from 'react';

// Apercu plein ecran d'UNE photo a sa vraie resolution (retour utilisateur,
// 2026-09-11 : "un petit oeil... pour voir la photo en taille reelle") —
// utilise l'URL de l'ORIGINAL (item.url, jamais retaille, voir
// storageService.js), jamais la version telle qu'elle apparait dans la
// page (object-fit:cover + eventuel recadrage, voir pageRenderer.js) : le
// but est de juger la photo elle-meme, pas son rendu final dans le livre.
// Meme mecanique de fermeture (clic en dehors/Echap, defilement bloque)
// que AtelierBookView.js's "Voir a l'echelle" — reutilisable depuis
// n'importe quel ecran de l'atelier, pas specifique aux pages interieures.
function AtelierPhotoLightbox({ url, onClose }) {
  useEffect(() => {
    if (!url) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div className="atelier-photo-lightbox-backdrop" onClick={onClose}>
      <button
        type="button"
        className="atelier-photo-lightbox-close"
        onClick={onClose}
        aria-label="Fermer"
      >
        ×
      </button>
      {/* stopPropagation : un clic SUR la photo (ex. pour la regarder de
          plus pres, il n'y a pas de zoom ici) ne doit pas fermer le calque —
          seul un clic sur le fond ou la croix ferme. */}
      <img
        src={url}
        alt=""
        className="atelier-photo-lightbox-img"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export default AtelierPhotoLightbox;
