// C:\Users\USER\bookfete\frontend\src\components\contributeur\TokenContributePage.js
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Loading from '../common/Loading';

const TokenContributePage = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [bookTitle, setBookTitle] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [contributorEmail, setContributorEmail] = useState('');
  
  // Formulaire
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkToken();
  }, [token]);

  const checkToken = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/invites/token/${token}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Lien invalide');
        setValid(false);
      } else {
        setValid(true);
        setBookTitle(data.bookTitle);
        setChapterTitle(data.chapterTitle);
        setChapterId(data.chapterId);
        setContributorEmail(data.email);
        setName(data.email.split('@')[0]); // Suggestion de nom
      }
    } catch (err) {
      setError('Erreur de connexion');
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
        const formData = new FormData();
        formData.append('photo', photo);
        
        // Upload via votre API
        const uploadResponse = await fetch(`${process.env.REACT_APP_API_URL}/upload`, {
          method: 'POST',
          body: formData
        });
        
        if (uploadResponse.ok) {
          const { url } = await uploadResponse.json();
          photoUrls.push(url);
        }
      }

      // Soumettre la contribution
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

  if (error || !valid) {
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
          <h2 style={{ marginBottom: '1rem' }}>Lien invalide</h2>
          <p style={{ color: '#666', marginBottom: '2rem' }}>{error || 'Ce lien d\'invitation n\'est pas valide ou a expiré.'}</p>
          <button
            onClick={() => window.close()}
            style={{
              padding: '1rem 2rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
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
          <h2 style={{ marginBottom: '1rem' }}>Merci !</h2>
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
              cursor: 'pointer'
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
        {/* En-tête */}
        <div style={{
          background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
          padding: '2rem',
          color: 'white'
        }}>
          <h1 style={{ margin: '0 0 0.5rem' }}>{bookTitle}</h1>
          <p style={{ margin: 0, opacity: 0.9 }}>Chapitre : {chapterTitle}</p>
        </div>

        {/* Formulaire */}
        <div style={{ padding: '2rem' }}>
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
                placeholder="Rédigez votre message, souvenir ou témoignage..."
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
                Photos (max 2)
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