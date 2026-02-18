// frontend/src/components/contributeur/EditContributionForm.js
import React, { useState, useEffect } from 'react';

const EditContributionForm = ({ token, initialContribution, onSuccess, maxPhotos = 5, deadline }) => {
  const [message, setMessage] = useState(initialContribution?.message || '');
  const [existingPhotos, setExistingPhotos] = useState(initialContribution?.photo_urls || []);
  const [newPhotos, setNewPhotos] = useState([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [daysLeft, setDaysLeft] = useState(0);
  const [deadlineFormatted, setDeadlineFormatted] = useState('');

  useEffect(() => {
    if (deadline) {
      const today = new Date();
      const deadlineDate = new Date(deadline);
      const diff = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
      setDaysLeft(diff);
      
      setDeadlineFormatted(deadlineDate.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }));
    }
  }, [deadline]);

  const handleNewPhotoChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (existingPhotos.length + newPhotos.length + files.length > maxPhotos) {
      alert(`Maximum ${maxPhotos} photos au total`);
      return;
    }

    const validFiles = files.filter(file => {
      return file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024;
    });

    setNewPhotos(prev => [...prev, ...validFiles]);

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPhotoPreviews(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeExistingPhoto = async (photoUrl) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/contribute/${token}/photo`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ photoUrl })
      });

      if (!response.ok) {
        throw new Error('Erreur suppression');
      }

      setExistingPhotos(prev => prev.filter(url => url !== photoUrl));
      
    } catch (err) {
      alert('Erreur lors de la suppression de la photo');
    }
  };

  const removeNewPhoto = (index) => {
    setNewPhotos(prev => prev.filter((_, i) => i !== index));
    setNewPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!message.trim()) {
        throw new Error('Le message est requis');
      }

      const formData = new FormData();
      formData.append('message', message);
      newPhotos.forEach((photo) => {
        formData.append('photos', photo);
      });

      const response = await fetch(`${process.env.REACT_APP_API_URL}/contribute/${token}`, {
        method: 'PUT',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour');
      }

      setSuccessMessage(`✅ Votre contribution a été mise à jour avec succès ! Vous pouvez encore la modifier jusqu'au ${deadlineFormatted}.`);
      
      if (data.contribution?.photos) {
        setExistingPhotos(data.contribution.photos);
      }
      setNewPhotos([]);
      setNewPhotoPreviews([]);
      
      onSuccess(data);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalPhotos = existingPhotos.length + newPhotos.length;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <h2 style={{ marginBottom: '2rem', color: '#333' }}>Modifier votre contribution</h2>
      
      <div style={{
        background: daysLeft < 0 ? '#f8d7da' : '#e8f4fd',
        color: daysLeft < 0 ? '#721c24' : '#0c5460',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        textAlign: 'center',
        border: daysLeft < 0 ? '1px solid #f5c6cb' : '1px solid #bee5eb'
      }}>
        {daysLeft < 0 ? (
          <span>⏰ La date limite du {deadlineFormatted} est dépassée. Vous ne pouvez plus modifier votre contribution.</span>
        ) : (
          <span>⏰ Vous pouvez modifier votre contribution jusqu'au <strong>{deadlineFormatted}</strong> ({daysLeft} jour{daysLeft > 1 ? 's' : ''} restant{daysLeft > 1 ? 's' : ''}).</span>
        )}
      </div>

      {successMessage && (
        <div style={{
          background: '#d4edda',
          color: '#155724',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #c3e6cb',
          fontSize: '0.95rem'
        }}>
          {successMessage}
        </div>
      )}

      {error && (
        <div style={{
          background: '#f8d7da',
          color: '#721c24',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #f5c6cb'
        }}>
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '600',
            color: '#333'
          }}>
            Votre message *
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Modifiez votre message..."
            rows="5"
            required
            maxLength="1000"
            disabled={daysLeft < 0}
            style={{
              width: '100%',
              padding: '0.8rem',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '1rem',
              background: daysLeft < 0 ? '#f5f5f5' : 'white',
              resize: 'vertical'
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '0.25rem',
            fontSize: '0.85rem',
            color: message.length > 900 ? '#dc3545' : '#666'
          }}>
            {message.length}/1000
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '600',
            color: '#333'
          }}>
            Photos ({totalPhotos}/{maxPhotos})
          </label>

          {existingPhotos.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ 
                fontSize: '0.9rem', 
                color: '#666', 
                marginBottom: '0.75rem',
                fontWeight: '500'
              }}>
                Photos actuelles :
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                gap: '1rem'
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
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    />
                    {daysLeft >= 0 && (
                      <button
                        type="button"
                        onClick={() => removeExistingPhoto(url)}
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
                          fontSize: '14px',
                          fontWeight: 'bold',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                        title="Supprimer cette photo"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {daysLeft >= 0 && totalPhotos < maxPhotos && (
            <div style={{ marginTop: '1rem' }}>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleNewPhotoChange}
                id="new-photos-input"
                disabled={totalPhotos >= maxPhotos}
                style={{ display: 'none' }}
              />
              
              <label
                htmlFor="new-photos-input"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.8rem 1.5rem',
                  background: '#f8f9fa',
                  border: '2px dashed #ccc',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: '#666',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f0f0f0';
                  e.currentTarget.style.borderColor = '#764ba2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f8f9fa';
                  e.currentTarget.style.borderColor = '#ccc';
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>📷</span>
                Ajouter des photos
              </label>
            </div>
          )}

          {newPhotoPreviews.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ 
                fontSize: '0.9rem', 
                color: '#666', 
                marginBottom: '0.75rem',
                fontWeight: '500'
              }}>
                Nouvelles photos à ajouter :
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                gap: '1rem'
              }}>
                {newPhotoPreviews.map((preview, index) => (
                  <div key={index} style={{ position: 'relative' }}>
                    <img
                      src={preview}
                      alt={`Nouvelle ${index + 1}`}
                      style={{
                        width: '100%',
                        height: '100px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeNewPhoto(index)}
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
                        fontSize: '14px',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}
                      title="Annuler cette photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ 
            color: '#666', 
            fontSize: '0.85rem', 
            marginTop: '1rem',
            fontStyle: 'italic'
          }}>
            Format JPG, PNG - max 5MB par photo
          </p>
        </div>

        {daysLeft >= 0 && (
          <button
            type="submit"
            disabled={loading || !message.trim()}
            style={{
              width: '100%',
              padding: '1rem',
              background: loading ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: loading || !message.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: loading || !message.trim() ? 0.7 : 1
            }}
            onMouseEnter={(e) => {
              if (!loading && message.trim()) {
                e.currentTarget.style.background = '#218838';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && message.trim()) {
                e.currentTarget.style.background = '#28a745';
              }
            }}
          >
            {loading ? 'Mise à jour en cours...' : 'Mettre à jour ma contribution'}
          </button>
        )}
      </form>
    </div>
  );
};

export default EditContributionForm;