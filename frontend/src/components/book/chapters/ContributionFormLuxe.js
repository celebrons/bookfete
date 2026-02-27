// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionFormLuxe.js
import React, { useState } from 'react';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const ContributionFormLuxe = ({
  contributionText,
  setContributionText,
  photos,
  photoPreviews,
  onPhotoChange,
  onRemovePhoto,
  onSubmit,
  submitting,
  hasContributed,
  onEdit,
  existingPhotos = []
}) => {
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  // Si l'utilisateur a déjà contribué et n'est pas en mode édition
  if (hasContributed) {
    return (
      <div className="contribution-thanks">
        <div className="thanks-icon">✅</div>
        <h3 className="thanks-title">Contribution enregistrée !</h3>
        <p style={{ color: 'var(--text-light)', marginBottom: 'var(--space-lg)' }}>
          Votre message a bien été ajouté à ce chapitre
        </p>

        {/* Aperçu du message */}
        {contributionText && (
          <div className="card" style={{ marginBottom: 'var(--space-lg)', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
              <span style={{ color: 'var(--gold)' }}>📝</span>
              <span className="label-gold">Votre message</span>
            </div>
            <p style={{
              fontStyle: 'italic',
              padding: 'var(--space-md)',
              background: 'var(--silk)',
              borderRadius: 'var(--radius)',
              borderLeft: '4px solid var(--gold)'
            }}>
              "{contributionText}"
            </p>
          </div>
        )}

        {/* Aperçu des photos */}
        {existingPhotos.length > 0 && (
          <div className="card" style={{ marginBottom: 'var(--space-lg)', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
              <span style={{ color: 'var(--gold)' }}>📸</span>
              <span className="label-gold">Photos jointes ({existingPhotos.length})</span>
            </div>
            <div className="photo-grid">
              {existingPhotos.map((url, idx) => (
                <div key={idx} className="photo-item">
                  <img src={url} alt={`Photo ${idx + 1}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bouton Modifier */}
        <button
          onClick={() => setShowEditConfirm(true)}
          className="btn btn-outline"
          style={{ padding: '12px 32px' }}
        >
          <span>✏️</span>
          Modifier ma contribution
        </button>

        {/* Modal de confirmation pour modification */}
        {showEditConfirm && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
              <div className="thanks-icon" style={{ background: 'var(--gold)', marginBottom: 'var(--space-lg)' }}>✏️</div>
              <h3 className="modal-title">Modifier votre contribution ?</h3>
              <p className="modal-text">
                Votre précédente contribution sera remplacée par la nouvelle.
              </p>
              <div className="modal-actions">
                <button
                  onClick={() => setShowEditConfirm(false)}
                  className="modal-btn modal-btn-secondary"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    setShowEditConfirm(false);
                    onEdit();
                  }}
                  className="modal-btn modal-btn-primary"
                >
                  Modifier
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Formulaire de contribution (actif)
  return (
    <div className="contribution-form">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--ink)' }}>
          MA CONTRIBUTION PERSONNELLE
        </h3>
        <Tooltip text="Répondez aux questions en une seule fois. Vous ne pourrez plus modifier après validation.">
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

      {/* Photos existantes (affichées en mode édition) */}
      {existingPhotos.length > 0 && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <span className="label-gold" style={{ marginBottom: 'var(--space-sm)' }}>
            Photos déjà jointes
          </span>
          <div className="photo-grid">
            {existingPhotos.map((url, index) => (
              <div key={index} className="photo-item" style={{ border: '2px solid var(--gold)' }}>
                <img src={url} alt={`Photo existante ${index + 1}`} />
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  background: 'var(--gold)',
                  color: 'white',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px'
                }}>
                  ✓
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: 'var(--space-xs)' }}>
            Ces photos seront conservées. Pour les supprimer, soumettez une nouvelle contribution sans elles.
          </p>
        </div>
      )}

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
          📷 Ajouter des photos supplémentaires (max 2)
        </label>
        
        <p style={{ margin: 'var(--space-xs) 0 0', fontSize: '12px', color: 'var(--text-light)' }}>
          {photos.length}/2 nouvelles photos
        </p>
      </div>

      {/* Aperçu des nouvelles photos */}
      {photoPreviews.length > 0 && (
        <div className="photo-grid">
          {photoPreviews.map((preview, index) => (
            <div key={index} className="photo-item">
              <img src={preview} alt={`Aperçu ${index + 1}`} />
              <button
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
        className="btn-submit"
      >
        {submitting ? 'Envoi en cours...' : 'VALIDER MA CONTRIBUTION'}
      </button>
      
      <p style={{ 
        marginTop: 'var(--space-md)', 
        fontSize: '11px', 
        color: 'var(--text-light)', 
        textAlign: 'center',
        fontStyle: 'italic'
      }}>
        ⚠️ Une fois validée, votre contribution ne pourra plus être modifiée directement.
        Un bouton "Modifier" apparaîtra si vous changez d'avis.
      </p>
    </div>
  );
};

export default ContributionFormLuxe;