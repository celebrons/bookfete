import React from 'react';
import './PhotoFitBadge.css';

// Badge d'avertissement de qualite d'impression (cahier des charges v2,
// §2/§4) — DEUX etats depuis le 2026-09-20 : AUCUN (statut 'ok', 'limite',
// ou inconnu) et ROUGE/CORAIL ('insuffisant'). L'ambre existait pour
// 'limite' ; voir la fonction ci-dessous pour la raison de son retrait.
//
// Le texte d'explication (une phrase, jamais le mot "DPI") vient du moteur
// (photoQuality.js/FIT_DISPLAY), jamais reecrit ici — une seule
// formulation dans toute l'application.
//
// `size` : 'sm' pour une incrustation sur la page, 'md' pour une liste
// (ecran recapitulatif). `as` : 'span' par defaut ; passer 'div' quand le
// badge ne doit pas etre imbrique dans du texte.
function PhotoFitBadge({ fit, size = 'sm', className = '' }) {
  // ALLEGEMENT DU 2026-09-20 : plus de badge ambre.
  //
  // 'limite' (150-250 dpi) signalait une photo qui s'imprime tres bien.
  // Sur un livre fait de photos de telephone, presque chaque page portait
  // un triangle d'avertissement : le livre avait l'air rate avant meme
  // d'exister. Retour utilisateur : « j'ai peur que ca dissuade
  // l'utilisateur de continuer ».
  //
  // Seul 'insuffisant' (< 150 dpi, severite 'danger') alerte encore. Le
  // statut 'limite' reste calcule et stocke (content.photoFit) : pour le
  // remettre a l'ecran, il suffit de reaccepter 'warning' ici et dans
  // backend/routes/composition.js (print-quality-check).
  if (!fit || fit.severity !== 'danger') return null;

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
