import React from 'react';

// Verification automatique au clic sur "Terminer mon livre" — calculee a
// partir des donnees deja chargees dans l'atelier (voir BookAtelierLuxe.js:
// buildFinishStats), aucun nouvel appel reseau. Jamais bloquant : meme avec
// des emplacements vides, l'utilisateur peut choisir de voir son livre quand
// meme (voir cahier des charges : "Pas de blocage inutile").
function AtelierFinishModal({ isOpen, onClose, stats, onContinue }) {
  if (!isOpen || !stats) return null;

  const isReady = stats.incompletePages === 0;

  return (
    <div className="atelier-modal-backdrop" onClick={onClose}>
      <div className="atelier-modal" onClick={(event) => event.stopPropagation()}>
        <div className="atelier-modal-head">
          <h2 className="atelier-modal-title">
            {isReady ? 'Votre livre est prêt à être prévisualisé' : 'Presque prêt'}
          </h2>
          <button type="button" className="atelier-modal-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <ul className="atelier-finish-checklist">
          <li className="is-ok">✓ {stats.photosCount} photo{stats.photosCount > 1 ? 's' : ''} utilisée{stats.photosCount > 1 ? 's' : ''}</li>
          <li className="is-ok">✓ {stats.souvenirsCount} souvenir{stats.souvenirsCount > 1 ? 's' : ''} utilisé{stats.souvenirsCount > 1 ? 's' : ''}</li>
          <li className="is-ok">✓ {stats.pagesCreated} page{stats.pagesCreated > 1 ? 's' : ''} créée{stats.pagesCreated > 1 ? 's' : ''}</li>
          {isReady ? (
            <li className="is-ok">✓ Toutes les pages sont complètes</li>
          ) : (
            <li className="is-warning">⚠️ {stats.incompletePages} page{stats.incompletePages > 1 ? 's' : ''} ne {stats.incompletePages > 1 ? 'sont' : 'est'} pas encore complète{stats.incompletePages > 1 ? 's' : ''}</li>
          )}
        </ul>

        <div className="atelier-modal-actions">
          {isReady ? (
            <button type="button" className="btn btn-primary" onClick={onContinue}>
              Voir mon livre →
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Corriger dans l'atelier
              </button>
              <button type="button" className="btn btn-primary" onClick={onContinue}>
                Voir quand même
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AtelierFinishModal;
