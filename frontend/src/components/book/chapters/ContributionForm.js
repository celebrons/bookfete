// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionForm.js
import React, { useState } from 'react';
import Tooltip from '../../ui/Tooltip';

const ContributionForm = ({
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

  console.log('📦 ContributionForm - hasContributed:', hasContributed);
  console.log('📦 ContributionForm - existingPhotos:', existingPhotos);
  console.log('📦 ContributionForm - contributionText:', contributionText);

  // Si l'utilisateur a déjà contribué et n'est pas en mode édition
  if (hasContributed) {
    console.log('✅ Affichage du mode "Merci pour votre contribution"');
    return (
      <div style={{
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
        padding: '2rem',
        borderRadius: '16px',
        border: '1px solid #28a745',
        marginBottom: '2rem',
        boxShadow: '0 4px 12px rgba(40, 167, 69, 0.1)'
      }}>
        {/* En-tête */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            background: '#28a745',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.8rem',
            color: 'white'
          }}>
            ✅
          </div>
          <div>
            <h3 style={{ margin: '0 0 0.3rem', color: '#28a745', fontSize: '1.3rem' }}>
              Contribution enregistrée !
            </h3>
            <p style={{ margin: 0, color: '#666', fontSize: '0.95rem' }}>
              Votre message a bien été ajouté à ce chapitre
            </p>
          </div>
        </div>

        {/* Aperçu du message */}
        {contributionText && (
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            border: '1px solid #e9ecef'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
              color: '#666'
            }}>
              <span style={{ fontSize: '1.1rem' }}>📝</span>
              <span style={{ fontWeight: '500' }}>Votre message :</span>
            </div>
            <p style={{
              margin: 0,
              color: '#333',
              fontSize: '1rem',
              lineHeight: '1.6',
              fontStyle: 'italic',
              padding: '0.5rem 1rem',
              background: '#f8f9fa',
              borderRadius: '8px',
              borderLeft: '4px solid #28a745'
            }}>
              "{contributionText}"
            </p>
          </div>
        )}

        {/* Aperçu des photos */}
        {existingPhotos.length > 0 && (
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            border: '1px solid #e9ecef'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
              color: '#666'
            }}>
              <span style={{ fontSize: '1.1rem' }}>📸</span>
              <span style={{ fontWeight: '500' }}>Photos jointes ({existingPhotos.length}) :</span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '1rem'
            }}>
              {existingPhotos.map((url, idx) => (
                <div key={idx} style={{
                  position: 'relative',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                }}>
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    style={{
                      width: '100%',
                      height: '120px',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    padding: '0.3rem',
                    textAlign: 'center',
                    fontSize: '0.8rem'
                  }}>
                    Photo {idx + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message si pas de photos */}
        {existingPhotos.length === 0 && (
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            border: '1px solid #e9ecef',
            textAlign: 'center',
            color: '#999'
          }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🖼️</span>
            <p style={{ margin: 0 }}>Aucune photo jointe</p>
          </div>
        )}

        {/* Bouton Modifier */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => {
              console.log('🖱️ Clic sur Modifier');
              setShowEditConfirm(true);
            }}
            style={{
              padding: '1rem 3rem',
              background: '#ffc107',
              color: '#333',
              border: 'none',
              borderRadius: '50px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1.1rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.8rem',
              boxShadow: '0 4px 12px rgba(255, 193, 7, 0.3)',
              transition: 'all 0.3s'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 8px 16px rgba(255, 193, 7, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 12px rgba(255, 193, 7, 0.3)';
            }}
          >
            <span>✏️</span>
            Modifier ma contribution
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#999' }}>
            Vous pourrez modifier votre message et vos photos
          </p>
        </div>

        {/* Modal de confirmation pour modification */}
        {showEditConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '16px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}>
              <div style={{
                width: '50px',
                height: '50px',
                background: '#ffc107',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                fontSize: '1.8rem',
                color: '#333'
              }}>
                ✏️
              </div>
              <h3 style={{ textAlign: 'center', marginBottom: '1rem', color: '#333' }}>
                Modifier votre contribution ?
              </h3>
              <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#666' }}>
                Votre précédente contribution sera remplacée par la nouvelle.
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowEditConfirm(false)}
                  style={{
                    padding: '0.8rem 2rem',
                    background: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    flex: 1,
                    fontSize: '0.95rem'
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    setShowEditConfirm(false);
                    onEdit();
                  }}
                  style={{
                    padding: '0.8rem 2rem',
                    background: '#ffc107',
                    color: '#333',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    flex: 1,
                    fontSize: '0.95rem'
                  }}
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
  console.log('📝 Affichage du formulaire de contribution');
  return (
    <div style={{
      background: '#f8f9fa',
      padding: '2rem',
      borderRadius: '16px',
      marginBottom: '2rem',
      border: '1px solid #e9ecef'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem', 
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ margin: 0, color: '#333' }}>MA CONTRIBUTION PERSONNELLE</h3>
        <Tooltip text="Répondez aux questions en une seule fois. Vous ne pourrez plus modifier après validation.">
          <span style={{ color: '#666', cursor: 'help', fontSize: '1.2rem' }}>ⓘ</span>
        </Tooltip>
      </div>
      
      <textarea
        value={contributionText}
        onChange={(e) => setContributionText(e.target.value)}
        placeholder="Rédigez ici votre texte pour ce chapitre..."
        rows="6"
        style={{
          width: '100%',
          padding: '1rem',
          border: '2px solid #e9ecef',
          borderRadius: '12px',
          fontSize: '1rem',
          marginBottom: '1.5rem',
          resize: 'vertical',
          fontFamily: 'inherit'
        }}
      />

      {/* Photos existantes (affichées en mode édition) */}
      {existingPhotos.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#333' }}>
            Photos déjà jointes :
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            {existingPhotos.map((url, index) => (
              <div key={index} style={{ position: 'relative' }}>
                <img
                  src={url}
                  alt={`Photo existante ${index + 1}`}
                  style={{
                    width: '100%',
                    height: '100px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '2px solid #28a745'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  background: '#28a745',
                  color: 'white',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem'
                }}>
                  ✓
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>
            Ces photos seront conservées. Pour les supprimer, soumettez une nouvelle contribution sans elles.
          </p>
        </div>
      )}

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
            borderRadius: '50px',
            cursor: photos.length >= 2 ? 'not-allowed' : 'pointer',
            color: photos.length >= 2 ? '#999' : '#333',
            marginBottom: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (photos.length < 2) {
              e.target.style.background = '#f3e8ff';
              e.target.style.borderColor = '#764ba2';
            }
          }}
          onMouseLeave={(e) => {
            if (photos.length < 2) {
              e.target.style.background = 'white';
              e.target.style.borderColor = '#ccc';
            }
          }}
        >
          📷 Ajouter des photos supplémentaires (max 2)
        </label>
        
        <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
          {photos.length}/2 nouvelles photos
        </p>
      </div>

      {/* Aperçu des nouvelles photos */}
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
                  borderRadius: '8px'
                }}
              />
              <button
                onClick={() => onRemovePhoto(index)}
                style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
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
          borderRadius: '50px',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          cursor: submitting || !contributionText.trim() ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s',
          boxShadow: submitting || !contributionText.trim() ? 'none' : '0 4px 12px rgba(40, 167, 69, 0.3)'
        }}
        onMouseEnter={(e) => {
          if (!submitting && contributionText.trim()) {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 8px 16px rgba(40, 167, 69, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!submitting && contributionText.trim()) {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
          }
        }}
      >
        {submitting ? 'Envoi en cours...' : 'VALIDER MA CONTRIBUTION'}
      </button>
      
      <p style={{ 
        marginTop: '1rem', 
        fontSize: '0.85rem', 
        color: '#dc3545', 
        textAlign: 'center',
        fontStyle: 'italic'
      }}>
        ⚠️ Une fois validée, votre contribution ne pourra plus être modifiée directement.
        Un bouton "Modifier" apparaîtra si vous changez d'avis.
      </p>
    </div>
  );
};

export default ContributionForm;