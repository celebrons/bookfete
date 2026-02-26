// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionForm.js
import React, { useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
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
  existingPhotos = [],
  chapterTitle,
  readOnly,
  isFinalized,
  onFinalize,
  contributionId
}) => {
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [localIsFinalized, setLocalIsFinalized] = useState(isFinalized || false);

  console.log('📦 ContributionForm - hasContributed:', hasContributed);
  console.log('📦 ContributionForm - isFinalized:', isFinalized);
  console.log('📦 ContributionForm - isEditing:', isEditing);
  console.log('📦 ContributionForm - contributionId:', contributionId);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveDraft = () => {
    onSubmit();
    setIsEditing(false);
  };

  const handleFinalize = () => {
    setShowFinalConfirm(true);
  };

  const confirmFinalize = async () => {
    try {
      if (onFinalize) {
        await onFinalize();
      } else if (contributionId) {
        const { error } = await supabase
          .from('contributions')
          .update({ is_finalized: true })
          .eq('id', contributionId);

        if (error) throw error;
        setLocalIsFinalized(true);
      }
      
      setShowFinalConfirm(false);
    } catch (error) {
      console.error('❌ Erreur finalisation:', error);
      alert('Erreur lors de la finalisation');
    }
  };

  if (localIsFinalized || isFinalized) {
    return (
      <div style={{
        background: '#d4edda',
        padding: '2rem',
        borderRadius: '10px',
        textAlign: 'center',
        border: '1px solid #c3e6cb',
        marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
        <h3 style={{ color: '#155724', marginBottom: '1rem' }}>Contribution finalisée !</h3>
        <p style={{ marginBottom: '0.5rem', color: '#155724' }}>
          Votre message a été validé définitivement.
        </p>
        <p style={{ marginBottom: '1.5rem', color: '#155724', fontSize: '0.9rem' }}>
          Vous ne pouvez plus le modifier.
        </p>
        
        {contributionText && (
          <div style={{
            background: 'white',
            padding: '1rem',
            borderRadius: '5px',
            marginTop: '1rem',
            textAlign: 'left',
            border: '1px solid #c3e6cb'
          }}>
            <p style={{ margin: 0, color: '#155724', fontStyle: 'italic' }}>
              "{contributionText}"
            </p>
          </div>
        )}
      </div>
    );
  }

  if (isEditing || !hasContributed) {
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
          <Tooltip text="Sauvegardez votre brouillon, vous pourrez le valider définitivement plus tard.">
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
                      border: '2px solid #17a2b8'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    background: '#17a2b8',
                    color: 'white',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem'
                  }}>
                    📷
                  </div>
                </div>
              ))}
            </div>
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
            📷 Ajouter des photos (max 2)
          </label>
          
          <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
            {photos.length}/2 photos
          </p>
        </div>

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

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            onClick={handleSaveDraft}
            disabled={submitting || !contributionText.trim()}
            style={{
              flex: 1,
              padding: '1rem',
              background: submitting || !contributionText.trim() ? '#ccc' : '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '50px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: submitting || !contributionText.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s'
            }}
          >
            {submitting ? 'Sauvegarde...' : '💾 Enregistrer'}
          </button>
          
          {hasContributed && (
            <button
              onClick={handleFinalize}
              disabled={submitting || !contributionText.trim()}
              style={{
                flex: 1,
                padding: '1rem',
                background: submitting || !contributionText.trim() ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '50px',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: submitting || !contributionText.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s'
              }}
            >
              ✅ Valider définitivement
            </button>
          )}
        </div>
        
        <p style={{ 
          marginTop: '1rem', 
          fontSize: '0.85rem', 
          color: '#17a2b8', 
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          Votre contribution est sauvegardée en brouillon. Validez-la définitivement quand vous serez prêt.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff3cd',
      padding: '2rem',
      borderRadius: '10px',
      textAlign: 'center',
      border: '1px solid #ffeeba',
      marginBottom: '2rem'
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
      <h3 style={{ color: '#856404', marginBottom: '1rem' }}>Brouillon sauvegardé</h3>
      
      {contributionText && (
        <div style={{
          background: 'white',
          padding: '1rem',
          borderRadius: '5px',
          marginBottom: '1rem',
          textAlign: 'left',
          border: '1px solid #ffeeba'
        }}>
          <p style={{ margin: 0, color: '#856404', fontStyle: 'italic' }}>
            "{contributionText}"
          </p>
        </div>
      )}

      {existingPhotos.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: '#856404', marginBottom: '0.5rem' }}>
            {existingPhotos.length} photo(s) jointe(s) :
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
            gap: '0.5rem',
            justifyContent: 'center'
          }}>
            {existingPhotos.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`Photo ${idx + 1}`}
                style={{
                  width: '80px',
                  height: '80px',
                  objectFit: 'cover',
                  borderRadius: '5px',
                  border: '2px solid #856404'
                }}
              />
            ))}
          </div>
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={handleEdit}
          style={{
            padding: '0.8rem 2rem',
            background: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>✏️</span>
          Modifier
        </button>
        
        <button
          onClick={handleFinalize}
          style={{
            padding: '0.8rem 2rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>✅</span>
          Valider définitivement
        </button>
      </div>

      {showFinalConfirm && (
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
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              background: '#ffc107',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              fontSize: '2rem',
              color: '#333'
            }}>
              ⚠️
            </div>
            <h3 style={{ marginBottom: '1rem', color: '#333', textAlign: 'center' }}>
              Valider définitivement ?
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#666', textAlign: 'center' }}>
              Une fois validée, vous ne pourrez plus modifier votre contribution.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => setShowFinalConfirm(false)}
                style={{
                  padding: '0.8rem 1.5rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                Annuler
              </button>
              <button
                onClick={confirmFinalize}
                style={{
                  padding: '0.8rem 1.5rem',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  flex: 1
                }}
              >
                Oui, valider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContributionForm;