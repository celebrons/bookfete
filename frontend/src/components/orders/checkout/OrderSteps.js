import React from 'react';
import './OrderSteps.css';

// Frise des etapes du parcours de commande (2026-09-11) : produit -> adresse
// -> paiement -> suivi. L'etape "adresse" disparait purement et simplement
// pour une commande PDF (rien a livrer) : la frise montre alors 3 etapes, pas
// une 4e grisee qui ne sera jamais atteinte.
//
// Purement presentatif : c'est BookCheckoutLuxe.js qui decide de l'etape
// courante (derivee de l'etat REEL de la commande, pas d'une navigation
// libre) et de ce qui est cliquable.
function OrderSteps({ steps, currentStep, onGoToStep }) {
  return (
    <ol className="order-steps">
      {steps.map((step, index) => {
        const isDone = index < currentStep;
        const isCurrent = index === currentStep;
        const canGo = Boolean(onGoToStep) && isDone;
        const Tag = canGo ? 'button' : 'span';

        return (
          <li
            key={step.key}
            className={`order-step ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}
          >
            <Tag
              {...(canGo ? { type: 'button', onClick: () => onGoToStep(index) } : {})}
              className="order-step-inner"
            >
              <span className="order-step-index" aria-hidden="true">{isDone ? '✓' : index + 1}</span>
              <span className="order-step-label">{step.label}</span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}

export default OrderSteps;
