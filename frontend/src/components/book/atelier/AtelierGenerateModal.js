import React, { useEffect, useState } from 'react';
import { ATELIER_MOODS } from './atelierMoods';

// Point d'entree de la generation automatique depuis l'atelier (remplace le
// role de l'etape 4 de l'ancien assistant /composer) : choisir une ambiance
// puis generer — decision utilisateur actee, pas de comparaison cote-a-cote
// des 5 ambiances.
function AtelierGenerateModal({
  isOpen,
  onClose,
  onGenerate,
  isGenerating,
  error,
  estimatedPages,
  loadingEstimate,
  minPages = 16
}) {
  const [selectedMood, setSelectedMood] = useState('classique');
  // Le moteur automatique ne repete jamais une photo/un texte pour "boucher
  // les trous" — un contenu trop maigre pour atteindre le palier minimum
  // produirait donc un livre visiblement incomplet. Bloque plutot que de
  // generer quand meme (l'estimation echouee/en cours ne bloque jamais,
  // seule une estimation reelle et insuffisante le fait).
  const insufficientContent = estimatedPages != null && estimatedPages < minPages;

  // Echap pour fermer + bloque le defilement derriere, meme principe que la
  // loupe plein ecran de BookCoverDesignerLuxe.js.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isGenerating) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isGenerating, onClose]);

  if (!isOpen) return null;

  return (
    <div className="atelier-modal-backdrop" onClick={() => !isGenerating && onClose()}>
      <div className="atelier-modal" onClick={(event) => event.stopPropagation()}>
        <div className="atelier-modal-head">
          <h2 className="atelier-modal-title">Generer automatiquement</h2>
          <button type="button" className="atelier-modal-close" onClick={onClose} disabled={isGenerating} aria-label="Fermer">×</button>
        </div>
        <p className="atelier-hint">
          Choisissez une ambiance : Celebrons compose tout le livre d'un coup a partir de vos souvenirs, chaque
          photo et chaque texte utilise une seule fois. Vous pourrez ensuite ajuster n'importe quelle page a la
          main, ou regenerer avec une autre ambiance.
        </p>

        {loadingEstimate && <p className="atelier-hint">Verification du contenu...</p>}

        {insufficientContent && (
          <div className="wizard-error">
            Il faut ajouter du contenu pour arriver à {minPages} pages minimum (votre contenu actuel remplit
            environ {estimatedPages} page{estimatedPages > 1 ? 's' : ''}) — Celebrons ne repete jamais une photo
            ou un texte pour combler l'espace. Ajoutez des photos ou des souvenirs dans "Mes souvenirs", puis
            reessayez.
          </div>
        )}

        <div className={`atelier-mood-grid ${insufficientContent ? 'is-disabled' : ''}`}>
          {ATELIER_MOODS.map((mood) => (
            <button
              key={mood.id}
              type="button"
              className={`atelier-mood-card ${selectedMood === mood.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedMood(mood.id)}
              disabled={isGenerating || insufficientContent}
            >
              <span className="atelier-mood-card-label">{mood.label}</span>
              <span className="atelier-mood-card-description">{mood.description}</span>
            </button>
          ))}
        </div>

        {error && <div className="wizard-error">{error}</div>}

        <div className="atelier-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isGenerating}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onGenerate(selectedMood)}
            disabled={isGenerating || insufficientContent || loadingEstimate}
          >
            {isGenerating ? 'Generation...' : 'Generer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AtelierGenerateModal;
