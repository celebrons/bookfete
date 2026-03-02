// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionFormLuxe.js
import React from 'react';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const ContributionFormLuxe = ({
  contributionText,
  setContributionText,
  photos,
  photoPreviews,
  uploadedPhotoUrls,
  onPhotoChange,
  onRemovePhoto,
  onSubmit,
  submitting,
  hasContributed,
  onEdit,
  existingPhotos = [],
  isFinalized,
  onFinalize,
  contributionId,
  chapterTitle
}) => {

  console.log('🔵 ===== ContributionFormLuxe =====');
  console.log('🔵 hasContributed:', hasContributed);
  console.log('🔵 isFinalized:', isFinalized);
  console.log('🔵 uploadedPhotoUrls:', uploadedPhotoUrls);

  // Si l'utilisateur a déjà contribué (brouillon ou finalisé)
  if (hasContributed) {
    return (
      <div className="contribution-thanks">
        <div className="thanks-icon">{isFinalized ? '✅' : '📝'}</div>
        <h3 className="thanks-title">
          {isFinalized ? 'Contribution finalisée !' : 'Brouillon sauvegardé'}
        </h3>
        <p style={{ color: 'var(--text-light)', marginBottom: 'var(--space-lg)' }}>
          {isFinalized 
            ? 'Votre contribution a été validée définitivement.'
            : 'Votre contribution est sauvegardée en brouillon. Validez-la définitivement quand vous serez prêt.'}
        </p>

        {/* Aperçu du message */}
        {contributionText && (
          <div className="message-preview">
            <div className="message-preview-header">
              <span style={{ color: 'var(--gold)' }}>📝</span>
              <span className="label-gold">Votre message</span>
            </div>
            <div className="message-preview-content">
              "{contributionText}"
            </div>
          </div>
        )}

        {/* Aperçu des photos uploadées */}
        {uploadedPhotoUrls.length > 0 && (
          <div className="photos-preview">
            <div className="photos-preview-header">
              <span style={{ color: 'var(--gold)' }}>📸</span>
              <span className="label-gold">Photos ({uploadedPhotoUrls.length})</span>
            </div>
            <div className="photo-grid">
              {uploadedPhotoUrls.map((url, idx) => (
                <div key={idx} className="photo-item">
                  <img src={url} alt={`Photo ${idx + 1}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {!isFinalized ? (
          <div className="contribution-actions">
            <button onClick={onEdit} className="btn btn-outline">
              ✏️ Modifier
            </button>
            <button onClick={onFinalize} className="btn btn-primary" style={{ background: 'var(--gold)' }}>
              ✅ Valider définitivement
            </button>
          </div>
        ) : (
          <div className="finalized-message">
            <p style={{ color: '#28a745', fontWeight: '600' }}>
              ✓ Contribution finalisée - Elle sera incluse dans le livre
            </p>
          </div>
        )}
      </div>
    );
  }

  // Formulaire de contribution (actif - pas encore de contribution)
  return (
    <div className="contribution-form">
      <div className="contribution-header">
        <h3>MA CONTRIBUTION PERSONNELLE</h3>
        <Tooltip text="Rédigez votre message. Vous pourrez le modifier plus tard tant qu'il n'est pas validé définitivement.">
          <span style={{ color: 'var(--gold)', cursor: 'help' }}>ⓘ</span>
        </Tooltip>
      </div>
      
      <textarea
        value={contributionText}
        onChange={(e) => setContributionText(e.target.value)}
        placeholder="Rédigez ici votre texte pour ce chapitre..."
        rows="6"
        className="contribution-textarea"
      />

      {/* Photos déjà uploadées */}
      {uploadedPhotoUrls.length > 0 && (
        <div className="existing-photos">
          <span className="label-gold">Photos uploadées</span>
          <div className="photo-grid">
            {uploadedPhotoUrls.map((url, index) => (
              <div key={index} className="photo-item" style={{ border: '2px solid var(--gold)' }}>
                <img src={url} alt={`Photo ${index + 1}`} />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(index)}
                  className="photo-remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload nouvelles photos */}
      <div className="photo-upload">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onPhotoChange}
          id="photo-upload"
          style={{ display: 'none' }}
          disabled={photos.length >= 2}
        />
        
        <label
          htmlFor="photo-upload"
          className="photo-upload-label"
          style={{
            opacity: photos.length >= 2 ? 0.5 : 1,
            cursor: photos.length >= 2 ? 'not-allowed' : 'pointer'
          }}
        >
          📷 Ajouter des photos (max 2)
        </label>
        
        <p className="photo-count">
          {photos.length}/2 photos
        </p>
      </div>

      {/* Aperçu des nouvelles photos */}
      {photoPreviews.length > 0 && (
        <div className="photo-grid">
          {photoPreviews.map((preview, index) => (
            <div key={index} className="photo-item">
              <img src={preview} alt={`Aperçu ${index + 1}`} />
              <button
                type="button"
                onClick={() => onRemovePhoto(index)}
                className="photo-remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={submitting || !contributionText.trim()}
        className="btn-save"
      >
        {submitting ? 'Enregistrement...' : '💾 Enregistrer le brouillon'}
      </button>
      
      <p className="contribution-note">
        ℹ️ Votre contribution sera sauvegardée en brouillon. Vous pourrez la modifier jusqu'à la validation définitive.
      </p>
    </div>
  );
};

export default ContributionFormLuxe;