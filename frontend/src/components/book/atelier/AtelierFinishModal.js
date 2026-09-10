import React, { useEffect, useState } from 'react';
import { getPrintQualityCheck } from '../../../services/compositionApi';

// Verification automatique au clic sur "Terminer mon livre" — calculee a
// partir des donnees deja chargees dans l'atelier (voir BookAtelierLuxe.js:
// buildFinishStats), aucun nouvel appel reseau POUR CETTE PARTIE. Jamais
// bloquant : meme avec des emplacements vides, l'utilisateur peut choisir
// de voir son livre quand meme (voir cahier des charges : "Pas de blocage
// inutile").
//
// Qualite photo (cahier des charges "PhotoSlot", 2026-09-10, §20/21) :
// SEULE exception a "aucun nouvel appel reseau" — un unique appel a
// GET /print-quality-check, declenche a l'OUVERTURE de cette modale (pas a
// chaque rendu), pour la meme raison qu'elle n'est evaluee nulle part
// ailleurs sans donnees serveur fiables (mm reels par slot/format). Jamais
// bloquant non plus : n'affecte jamais `isReady`/le bouton "Voir mon
// livre" — juste une ligne d'information en plus, avec un lien pour aller
// directement corriger si souhaite.
function AtelierFinishModal({ isOpen, onClose, stats, onContinue, bookId, onViewPage }) {
  const [qualityCheck, setQualityCheck] = useState(null);

  useEffect(() => {
    if (!isOpen || !bookId) {
      setQualityCheck(null);
      return;
    }
    let cancelled = false;
    getPrintQualityCheck(bookId)
      .then((result) => { if (!cancelled) setQualityCheck(result); })
      .catch(() => {}); // silencieux : jamais bloquant, juste pas de ligne qualite affichee
    return () => { cancelled = true; };
  }, [isOpen, bookId]);

  if (!isOpen || !stats) return null;

  const isReady = stats.incompletePages === 0;
  const lowQualityCount = qualityCheck?.lowQualityPhotos?.length || 0;
  const firstLowQualityPage = qualityCheck?.lowQualityPhotos?.[0]?.pageIndex;

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
          {qualityCheck && (
            lowQualityCount === 0 ? (
              <li className="is-ok">✓ Qualité photo vérifiée</li>
            ) : (
              <li className="is-warning">
                ⚠️ {lowQualityCount} photo{lowQualityCount > 1 ? 's' : ''} pourraient être moins nette{lowQualityCount > 1 ? 's' : ''}
                {onViewPage && firstLowQualityPage != null && (
                  <>
                    {' — '}
                    <button
                      type="button"
                      className="atelier-finish-quality-link"
                      onClick={() => { onClose(); onViewPage(firstLowQualityPage); }}
                    >
                      Voir les photos concernées
                    </button>
                  </>
                )}
              </li>
            )
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
