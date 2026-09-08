import React from 'react';

// Confirmation affichee avant d'ouvrir la generation automatique
// UNIQUEMENT si l'utilisateur a deja construit au moins une page a la main
// (voir BookAtelierLuxe.js: hasManualWork) — jamais pour un livre encore
// vierge, ou il n'y a rien a rassurer. Le bouton "Passer en mode
// automatique" (plutot que "Generer automatiquement") + cette etape
// intermediaire evitent l'impression que l'action va ecraser ce qui vient
// d'etre fait a la main — impression fausse (les pages verrouillees
// survivent toujours a une generation, voir bookContentService.replaceBookPages)
// mais legitime a couper court explicitement, pas seulement a corriger en
// petit caracteres.
function AtelierConfirmSwitchDialog({ isOpen, onCancel, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div className="atelier-modal-backdrop" onClick={onCancel}>
      <div className="atelier-modal atelier-confirm-modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="atelier-modal-title">Passer en mode automatique ?</h2>
        <p className="atelier-hint">
          Celebrons va proposer une nouvelle organisation de votre livre à partir de vos contenus. Les pages que
          vous avez déjà construites à la main restent intactes — seules les pages encore automatiques seront
          réorganisées.
        </p>
        <div className="atelier-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Conserver mon travail
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
}

export default AtelierConfirmSwitchDialog;
