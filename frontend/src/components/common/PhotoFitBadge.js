import React from 'react';
import './PhotoFitBadge.css';

// Badge d'avertissement de qualite d'impression (cahier des charges v2,
// §2/§4) — 3 etats visuels : AUCUN (statut 'ok' ou inconnu : rien n'est
// rendu, critere d'acceptation n°1 "une photo bien cadree et haute
// resolution ne declenche aucun avertissement visible"), AMBRE ('limite')
// et ROUGE/CORAIL ('insuffisant'). Le texte d'explication (une phrase,
// jamais le mot "DPI") vient du moteur (photoQuality.js/FIT_DISPLAY),
// jamais reecrit ici — une seule formulation dans toute l'application.
//
// `size` : 'sm' pour une incrustation sur la page, 'md' pour une liste
// (ecran recapitulatif). `as` : 'span' par defaut ; passer 'div' quand le
// badge ne doit pas etre imbrique dans du texte.
function PhotoFitBadge({ fit, size = 'sm', className = '' }) {
  if (!fit || !fit.severity) return null;

  return (
    <span
      className={`photo-fit-badge is-${fit.severity} is-${size} ${className}`.trim()}
      title={fit.label}
      aria-label={fit.label}
      role="img"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.8 2.6 20.2h18.8L12 3.8Z" />
        <path d="M12 10v4" />
        <path d="M12 17.4v.2" />
      </svg>
    </span>
  );
}

export default PhotoFitBadge;
