import React from 'react';

// Explications de prise en main de l'atelier — affichees par defaut a la
// premiere visite (voir BookAtelierLuxe.js: SEEN_KEY en localStorage,
// jamais reaffiche automatiquement une fois ferme), reouvrables ensuite via
// le bouton "?" du header. Volontairement une carte compacte plutot qu'une
// fenetre modale bloquante : l'atelier reste utilisable derriere.
//
// Reecrites pour la refonte visuelle du 2026-09-26 : "A gauche"/"A droite"
// decrivaient des colonnes fixes qui n'existent plus — la bibliotheque et
// la mise en page vivent desormais dans des tiroirs ouverts a la demande
// (voir AtelierToolsBar.js/AtelierDrawer.js), et le mode automatique n'est
// plus un bouton visible en permanence.
//
// Reecrites a nouveau le meme jour, apres la deuxieme passe de finition
// (retour utilisateur : "mets a jour le contenu de l'aide pour qu'il
// s'adapte a tout ce qu'on a modifie") : la navigation de page est devenue
// tres discrete (‹ N / M ›, plus de gros boutons Couverture/Precedente/
// Suivante/4e) — sans explication, l'acces a la couverture/4e depuis le
// tiroir Pages n'a plus rien d'evident. Nouvelle 5e carte dediee.
const STEPS = [
  {
    icon: '🖼️',
    title: 'Vos photos',
    text: 'Cliquez sur "Photos" en haut pour ouvrir votre bibliothèque, y ajouter des photos et des textes.'
  },
  {
    icon: '🖱️',
    title: 'Glissez-déposez',
    text: 'Glissez un souvenir dans un emplacement de la page — ou cliquez dessus puis cliquez l\'emplacement.'
  },
  {
    icon: '▦',
    title: 'Mise en page',
    text: 'Cliquez sur "Mise en page" (ou sur l\'icône posée sur la page) pour choisir la mise en page de la page affichée, juste à côté du livre.'
  },
  {
    icon: '↔',
    title: 'Naviguer dans les pages',
    text: 'Les flèches ‹ › sous le livre font tourner les pages une à une. Pour aller directement à une page, à la couverture ou à la 4e de couverture, ouvrez "Pages".'
  },
  {
    icon: '✨',
    title: 'Mode automatique',
    text: 'Ou laissez Celebrons composer tout le livre ("Composer automatiquement", en haut), puis ajustez les pages que vous voulez à la main.'
  }
];

function AtelierOnboarding({ onDismiss }) {
  return (
    <div className="atelier-onboarding">
      <button type="button" className="atelier-onboarding-close" onClick={onDismiss} aria-label="Fermer">×</button>
      <p className="atelier-onboarding-title">Comment construire votre livre</p>
      <div className="atelier-onboarding-steps">
        {STEPS.map((step) => (
          <div key={step.title} className="atelier-onboarding-step">
            <span className="atelier-onboarding-step-icon" aria-hidden="true">{step.icon}</span>
            <div>
              <p className="atelier-onboarding-step-title">{step.title}</p>
              <p className="atelier-onboarding-step-text">{step.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AtelierOnboarding;
