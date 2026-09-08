import React from 'react';

// Explications de prise en main de l'atelier — affichees par defaut a la
// premiere visite (voir BookAtelierLuxe.js: SEEN_KEY en localStorage,
// jamais reaffiche automatiquement une fois ferme), reouvrables ensuite via
// le bouton "?" du header. Volontairement une carte compacte plutot qu'une
// fenetre modale bloquante : l'atelier reste utilisable derriere.
const STEPS = [
  {
    icon: '🖼️',
    title: 'Mes souvenirs',
    text: "A gauche : ajoutez vos photos et vos textes (bouton \"+ Ajouter\")."
  },
  {
    icon: '🖱️',
    title: 'Glissez-déposez',
    text: 'Glissez un souvenir dans un emplacement de la page — ou cliquez dessus puis cliquez l\'emplacement.'
  },
  {
    icon: '▦',
    title: 'Mise en page',
    text: 'A droite : choisissez la mise en page de la page affichée au centre.'
  },
  {
    icon: '✨',
    title: 'Mode automatique',
    text: 'Ou laissez Celebrons composer tout le livre, puis ajustez les pages que vous voulez à la main.'
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
