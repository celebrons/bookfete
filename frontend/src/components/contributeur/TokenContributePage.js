// C:\Users\USER\bookfete\frontend\src\components\contributeur\TokenContributePage.js
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Loading from '../common/Loading';

const TokenContributePage = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [bookData, setBookData] = useState(null);
  const [inviteData, setInviteData] = useState(null);
  const [error, setError] = useState(null);
  
  // Formulaire
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    checkToken();
  }, [token]);

  const checkToken = async () => {
    try {
      const apiUrl = `${process.env.REACT_APP_API_URL}/invites/token/${token}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Lien invalide');
        setValid(false);
      } else {
        setValid(true);
        setBookData({
          title: data.bookTitle,
          chapter: data.chapterTitle,
          ownerName: data.ownerName || 'Fred', // À récupérer de la base
          recipientName: data.recipientName || 'Gégé', // À récupérer de la base
          eventType: data.eventType || 'anniversaire' // À récupérer de la base
        });
        setInviteData({
          email: data.email,
          customMessage: data.customMessage || ''
        });
        setName(data.email ? data.email.split('@')[0] : '');
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (photos.length + files.length > 2) {
      alert('Maximum 2 photos');
      return;
    }

    const validFiles = files.filter(file => {
      const isValid = file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024;
      if (!isValid) {
        alert(`${file.name} : format invalide ou trop volumineux (max 5MB)`);
      }
      return isValid;
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
    
    if (!name.trim() || !message.trim()) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    setSubmitting(true);
    
    try {
      // Upload des photos
      const photoUrls = [];
      for (const photo of photos) {
        photoUrls.push('https://via.placeholder.com/150');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL}/invites/token/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          message: message.trim(),
          photoUrls
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'envoi');
      }

      setSubmitted(true);
      
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading message="Vérification du lien..." />;

  if (error || !valid || !bookData) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '2rem'
      }}>
        <div style={{
          background: 'white',
          padding: '3rem',
          borderRadius: '10px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>😕</div>
          <h2 style={{ marginBottom: '1rem', color: '#333' }}>Lien invalide</h2>
          <p style={{ color: '#666', marginBottom: '2rem' }}>
            {error || 'Ce lien d\'invitation n\'est pas valide ou a expiré.'}
          </p>
          <button
            onClick={() => window.close()}
            style={{
              padding: '1rem 2rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '2rem'
      }}>
        <div style={{
          background: 'white',
          padding: '3rem',
          borderRadius: '10px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✨</div>
          <h2 style={{ marginBottom: '1rem', color: '#333' }}>Merci !</h2>
          <p style={{ color: '#666', marginBottom: '2rem' }}>
            Votre contribution a été envoyée avec succès.
          </p>
          <button
            onClick={() => window.close()}
            style={{
              padding: '1rem 2rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '10px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {/* En-tête avec message personnalisé */}
        <div style={{
          background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
          padding: '2rem',
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎁</div>
          <h1 style={{ margin: '0 0 1rem', fontSize: '2rem' }}>
            {bookData.eventType === 'anniversaire' ? '🎂' : '📖'} {bookData.title}
          </h1>
          
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '1.5rem',
            borderRadius: '10px',
            backdropFilter: 'blur(10px)',
            marginTop: '1rem'
          }}>
            <p style={{ fontSize: '1.2rem', margin: '0', lineHeight: '1.6' }}>
              <strong>{inviteData.email || 'Fred'}</strong> vous a invité à contribuer à un livre personnalisé pour <strong>{bookData.recipientName}</strong> à l'occasion de son <strong>{bookData.eventType}</strong>.
            </p>
            {inviteData.customMessage && (
              <p style={{
                marginTop: '1rem',
                fontStyle: 'italic',
                opacity: 0.9,
                borderTop: '1px solid rgba(255,255,255,0.2)',
                paddingTop: '1rem'
              }}>
                "{inviteData.customMessage}"
              </p>
            )}
          </div>
        </div>

        {/* Formulaire */}
        <div style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '2rem', color: '#333', textAlign: 'center' }}>
            Partagez votre message pour {bookData.recipientName}
          </h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Votre nom *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Comment souhaitez-vous être nommé ?"
                required
                style={{
                  width: '100%',
                  padding: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '5px',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Votre message *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Rédigez ici votre message, souvenir ou témoignage..."
                rows="6"
                required
                style={{
                  width: '100%',
                  padding: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '5px',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Ajouter des photos (max 2)
              </label>
              
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                id="token-photo-upload"
                style={{ display: 'none' }}
                disabled={photos.length >= 2}
              />
              
              <label
                htmlFor="token-photo-upload"
                style={{
                  display: 'inline-block',
                  padding: '0.8rem 2rem',
                  background: '#f8f9fa',
                  border: '2px dashed #ccc',
                  borderRadius: '5px',
                  cursor: photos.length >= 2 ? 'not-allowed' : 'pointer',
                  color: photos.length >= 2 ? '#999' : '#333'
                }}
              >
                📷 Ajouter des photos
              </label>
              <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                {photos.length}/2 photos
              </p>
            </div>

            {/* Aperçu des photos */}
            {photoPreviews.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                {photoPreviews.map((preview, index) => (
                  <div key={index} style={{ position: 'relative' }}>
                    <img
                      src={preview}
                      alt={`Aperçu ${index + 1}`}
                      style={{
                        width: '100%',
                        height: '150px',
                        objectFit: 'cover',
                        borderRadius: '5px'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
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
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '1rem',
                background: submitting ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? 'Envoi en cours...' : 'Envoyer ma contribution'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TokenContributePage;