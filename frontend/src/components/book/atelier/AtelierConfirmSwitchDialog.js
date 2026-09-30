import React from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('atelier');
  if (!isOpen) return null;

  return (
    <div className="atelier-modal-backdrop" onClick={onCancel}>
      <div className="atelier-modal atelier-confirm-modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="atelier-modal-title">{t('confirmSwitch.title')}</h2>
        <p className="atelier-hint">
          {t('confirmSwitch.body')}
        </p>
        <div className="atelier-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            {t('confirmSwitch.keep')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {t('confirmSwitch.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AtelierConfirmSwitchDialog;
