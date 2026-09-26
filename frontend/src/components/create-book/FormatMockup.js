import React from 'react';

// SILHOUETTE DE LIVRE, PAS UNE PHOTO (refonte visuelle 2026-09-26, §3 :
// "une grande carte par format... mockup du livre").
//
// Un SVG pur plutot qu'une photographie ou un rendu 3D : aucun asset a
// produire ni a maintenir pour 3 formats, et surtout des PROPORTIONS
// REELLES — calculees depuis les vraies dimensions du produit
// (widthMm/heightMm, deja fournies par GET /orders/formats, voir
// CreateBookSansIA.js) plutot qu'une image generique identique pour les
// trois cartes. Le Livret (carre, 20x20) se distingue donc naturellement du
// Standard/Luxe (portrait, 21x28) — la silhouette EST l'information, pas
// une decoration à cote d'elle.
//
// Volontairement minimal : couverture unie + tranche doree, rien de plus.
// Une texture ou un degrade tenterait d'imiter une vraie photo de produit
// et ferait paraitre les deux autres cartes injustement nues.
const HAUTEUR_VUE = 84;

function FormatMockup({ widthMm, heightMm }) {
  const ratio = Number(widthMm) > 0 && Number(heightMm) > 0 ? widthMm / heightMm : 210 / 280;
  const largeurVue = Math.round(HAUTEUR_VUE * ratio);
  const tranche = Math.max(3, Math.round(largeurVue * 0.055));

  return (
    <svg
      className="format-choice-mockup"
      width={largeurVue}
      height={HAUTEUR_VUE}
      viewBox={`0 0 ${largeurVue} ${HAUTEUR_VUE}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="0.5" y="0.5"
        width={largeurVue - 1} height={HAUTEUR_VUE - 1}
        rx="2.5"
        fill="#fffdf8"
        stroke="rgba(36, 31, 24, 0.22)"
      />
      <path
        d={`M0.5 2.5 A2 2 0 0 1 2.5 0.5 H${tranche} V${HAUTEUR_VUE - 0.5} H2.5 A2 2 0 0 1 0.5 ${HAUTEUR_VUE - 2.5} Z`}
        fill="var(--gold, #b8924a)"
      />
    </svg>
  );
}

export default FormatMockup;
