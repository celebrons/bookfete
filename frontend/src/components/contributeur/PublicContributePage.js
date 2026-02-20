// C:\Users\USER\bookfete\frontend\src\components\contributeur\PublicContributePage.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Loading from '../common/Loading';

const PublicContributePage = () => {
  const { bookId, chapterId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Formulaire
  const [contributorName, setContributorName] = useState('');
  const [contributorEmail, setContributorEmail] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);

  useEffect(() => {
    fetchData();
  }, [bookId, chapterId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Récupérer le livre
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('title, finition, papier, style_narratif')
        .eq('id', bookId)
        .single();

      if (bookError) throw bookError;
      setBook(bookData);

      // Récupérer le chapitre
      const { data: chapterData, error: chapterError } = await supabase
        .from('chapters')
        .select('title, description, questions_ia')
        .eq('id', chapterId)
        .single();

      if (chapterError) throw chapterError;
      setChapter(chapterData);

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (photos.length + files.length > 2) {
      alert('Maximum 2 photos par chapitre');
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
    
    if (!contributorName.trim() || !contributorEmail.trim() || !message.trim()) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setContributing(true);
    
    try {
      // Upload des photos
      const photoUrls = [];
      for (const photo of photos) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${chapterId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('contribution-photos')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('❌ Erreur upload:', uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('contribution-photos')
          .getPublicUrl(fileName);

        photoUrls.push(publicUrl);
      }

      // Créer la contribution
      const { error } = await supabase
        .from('contributions')
        .insert([{
          chapter_id: chapterId,
          contributor_name: contributorName,
          contributor_email: contributorEmail,
          message: message,
          photo_urls: photoUrls,
          approved: false
        }]);

      if (error) throw error;

      setSuccess(true);
      
    } catch (error) {
      console.error('❌ Erreur soumission:', error);
      alert('Erreur lors de l\'envoi de votre contribution');
    } finally {
      setContributing(false);
    }
  };

  if (loading) return <Loading message="Chargement..." />;
  if (!book || !chapter) return <div>Lien invalide</div>;

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          background: 'white',
          padding: '3rem',
          borderRadius: '10px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          textAlign: 'center',
          maxWidth: '500px'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✨</div>
          <h1 style={{ marginBottom: '1rem', color: '#333' }}>Merci !</h1>
          <p style={{ color: '#666', marginBottom: '2rem' }}>
            Votre contribution a été envoyée avec succès.
            L'organisateur du livre la validera prochainement.
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
        {/* En-tête du livre */}
        <div style={{
          background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
          padding: '2rem',
          color: 'white'
        }}>
          <h1 style={{ margin: '0 0 0.5rem' }}>{book.title}</h1>
          <p style={{ margin: 0, opacity: 0.9 }}>Chapitre : {chapter.title}</p>
        </div>

        {/* Contenu */}
        <div style={{ padding: '2rem' }}>
          {/* Description du chapitre */}
          {chapter.description && (
            <div style={{
              background: '#f8f9fa',
              padding: '1rem',
              borderRadius: '5px',
              marginBottom: '2rem',
              border: '1px solid #dee2e6'
            }}>
              <p style={{ margin: 0, color: '#666' }}>{chapter.description}</p>
            </div>
          )}

          {/* Questions IA */}
          {chapter.questions_ia && chapter.questions_ia.length > 0 && (
            <div style={{
              background: '#f3e8ff',
              padding: '1.5rem',
              borderRadius: '5px',
              marginBottom: '2rem',
              border: '1px solid #764ba2'
            }}>
              <h3 style={{ margin: '0 0 1rem', color: '#764ba2' }}>
                💡 Questions pour vous inspirer
              </h3>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#333' }}>
                {chapter.questions_ia.map((q, idx) => (
                  <li key={idx} style={{ marginBottom: '0.5rem' }}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Votre nom *
              </label>
              <input
                type="text"
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
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
                Votre email *
              </label>
              <input
                type="email"
                value={contributorEmail}
                onChange={(e) => setContributorEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                style={{
                  width: '100%',
                  padding: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '5px',
                  fontSize: '1rem'
                }}
              />
              <p style={{ margin: '0.3rem 0 0', color: '#666', fontSize: '0.85rem' }}>
                Pour que l'organisateur puisse vous identifier
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Votre message *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Rédigez ici votre témoignage, souvenir ou message..."
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
                id="public-photo-upload"
                style={{ display: 'none' }}
                disabled={photos.length >= 2}
              />
              
              <label
                htmlFor="public-photo-upload"
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
                📷 Choisir des photos
              </label>
              
              <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                {photos.length}/2 photos - Format JPG/PNG max 5MB
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
              disabled={contributing}
              style={{
                width: '100%',
                padding: '1rem',
                background: contributing ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: contributing ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {contributing ? 'Envoi en cours...' : 'Envoyer ma contribution'}
            </button>
          </form>

          <p style={{
            marginTop: '2rem',
            textAlign: 'center',
            color: '#666',
            fontSize: '0.9rem'
          }}>
            ✨ Votre contribution sera visible après validation par l'organisateur
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicContributePage;