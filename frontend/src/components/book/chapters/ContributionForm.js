// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionForm.js
import React from 'react';

const ContributionForm = ({
  contributionText,
  setContributionText,
  photos,
  photoPreviews,
  onPhotoChange,
  onRemovePhoto,
  onSubmit,
  submitting
}) => {
  return (
    <div style={{
      background: '#f8f9fa',
      padding: '1.5rem',
      borderRadius: '10px',
      marginBottom: '2rem',
      border: '1px solid #e9ecef'
    }}>
      <h3 style={{ margin: '0 0 1rem', color: '#333' }}>MA CONTRIBUTION PERSONNELLE</h3>
      
      <textarea
        value={contributionText}
        onChange={(e) => setContributionText(e.target.value)}
        placeholder="Rédigez ici votre texte pour ce chapitre..."
        rows="6"
        style={{
          width: '100%',
          padding: '1rem',
          border: '1px solid #ddd',
          borderRadius: '5px',
          fontSize: '1rem',
          marginBottom: '1.5rem',
          resize: 'vertical'
        }}
      />

      <div style={{ marginBottom: '1.5rem' }}>
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
          style={{
            display: 'inline-block',
            padding: '0.8rem 2rem',
            background: 'white',
            border: '2px dashed #ccc',
            borderRadius: '5px',
            cursor: photos.length >= 2 ? 'not-allowed' : 'pointer',
            color: photos.length >= 2 ? '#999' : '#333',
            marginBottom: '1rem'
          }}
        >
          📷 Ajouter mes photos (max 2)
        </label>
        
        <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
          {photos.length}/2 photos
        </p>
      </div>

      {/* Aperçu des photos */}
      {photoPreviews.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {photoPreviews.map((preview, index) => (
            <div key={index} style={{ position: 'relative' }}>
              <img
                src={preview}
                alt={`Aperçu ${index + 1}`}
                style={{
                  width: '100%',
                  height: '100px',
                  objectFit: 'cover',
                  borderRadius: '5px'
                }}
              />
              <button
                onClick={() => onRemovePhoto(index)}
                style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  width: '25px',
                  height: '25px',
                  borderRadius: '50%',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer'
                }}
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
        style={{
          width: '100%',
          padding: '1rem',
          background: submitting || !contributionText.trim() ? '#ccc' : '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          fontSize: '1rem',
          fontWeight: 'bold',
          cursor: submitting || !contributionText.trim() ? 'not-allowed' : 'pointer'
        }}
      >
        {submitting ? 'Envoi en cours...' : 'ENREGISTRER MA CONTRIBUTION'}
      </button>
    </div>
  );
};

export default ContributionForm;