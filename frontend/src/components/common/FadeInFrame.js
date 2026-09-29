import React, { useState } from 'react';
import './FadeInFrame.css';

// <iframe srcDoc=...> qui ne se revele qu'une fois SON CONTENU reellement
// pret (evenement `load`), pas au bout d'une duree devinee a l'avance —
// evite le flash/scintillement blanc (retour utilisateur, 2026-09-29 :
// "un effet bizarre... comme un flash... un scintillement" dans les deux
// previsualiseurs plein ecran, atelier et Apercu final, qui partagent tous
// deux PageZoomStage.js). Sans ca, l'iframe (fond blanc, voir
// .atelier-zoom-frame/.preview-final-zoom-frame) s'affiche des son
// montage — la transition d'ENTREE du conteneur autour de lui (deja en
// place, voir .atelier-zoom-page-change/.preview-final-zoom-page-change)
// finit donc de jouer sur un rectangle blanc, et la vraie page (photos,
// texte) surgit d'un coup par-dessus des que le navigateur a fini de la
// peindre — d'ou l'impression de flash.
//
// Remonte a chaque nouvelle page (meme `key` que l'element englobant, deja
// pose par les deux appelants) : `loaded` repart donc a false a chaque
// tour de page, ce qui est le but — chaque nouvelle page doit refaire sa
// propre entree.
function FadeInFrame({ className, ...props }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <iframe
      {...props}
      className={`fade-in-frame ${loaded ? 'is-loaded' : ''} ${className || ''}`.trim()}
      onLoad={() => setLoaded(true)}
    />
  );
}

export default FadeInFrame;
