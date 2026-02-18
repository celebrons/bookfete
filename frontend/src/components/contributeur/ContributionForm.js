// frontend/src/components/contributeur/ContributionForm.js
import React, { useState, useEffect } from 'react';

const ContributionForm = ({ token, onSuccess, maxPhotos = 5, deadline }) => {
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (photos.length + files.length > maxPhotos) {
      alert(`Maximum ${maxPhotos} photos autorisées`);
      return;
    }

    const validFiles = files.filter(file => {
      return file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024;
    });

    setPhotos(prev => [...prev, ...validFiles]);

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!message.trim()) {
        throw new Error('Le message est requis');
      }

      const formData = new FormData();
      formData.append('message', message);
      photos.forEach((photo) => {
        formData.append('photos', photo);
      });

      const response = await fetch(`${process.env.REACT_APP_API_URL}/contribute/${token}`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'envoi');
      }

      onSuccess(data);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <h2 style={{ marginBottom: '2rem', color: '#333' }}>Votre contribution</h2>
      
      <div style={{
        background: '#e8f4fd',
        color: '#0c5460',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        textAlign: 'center',
        border: '1px solid #bee5eb'
      }}>
        <span>⏰ Vous pouvez contribuer jusqu'au <strong>{deadlineFormatted}</strong> ({daysLeft} jour{daysLeft > 1 ? 's' : ''} restant{daysLeft > 1 ? 's' : ''}).</span>
      </div>

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
            placeholder="Partagez vos souvenirs, vos émotions..."
            rows="5"
            required
            maxLength="1000"
            style={{
              width: '100%',
              padding: '0.8rem',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '1rem',
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
            Photos ({photos.length}/{maxPhotos})
          </label>
          
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoChange}
            id="photos-input"
            disabled={photos.length >= maxPhotos}
            style={{ display: 'none' }}
          />
          
          <label
            htmlFor="photos-input"
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
              transition: 'all 0.2s',
              marginBottom: '1rem'
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
          
          <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Format JPG, PNG - max 5MB par photo
          </p>

          {photoPreviews.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '1rem',
              marginTop: '1rem'
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
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
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
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !message.trim()}
          style={{
            width: '100%',
            padding: '1rem',
            background: loading ? '#ccc' : '#764ba2',
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
              e.currentTarget.style.background = '#5a3d7c';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading && message.trim()) {
              e.currentTarget.style.background = '#764ba2';
            }
          }}
        >
          {loading ? 'Envoi en cours...' : 'Envoyer ma contribution'}
        </button>
      </form>
    </div>
  );
};

export default ContributionForm;