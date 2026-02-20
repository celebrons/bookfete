// C:\Users\USER\bookfete\frontend\src\components\book\ChapterPage.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Loading from '../common/Loading';

const ChapterPage = () => {
  const { bookId, chapterId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [contributionText, setContributionText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, [bookId, chapterId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Récupérer le livre
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError) throw bookError;
      setBook(bookData);

      // Récupérer le chapitre
      const { data: chapterData, error: chapterError } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', chapterId)
        .single();

      if (chapterError) throw chapterError;
      setChapter(chapterData);

      // Récupérer les contributions pour ce chapitre
      const { data: contributionsData, error: contributionsError } = await supabase
        .from('contributions')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });

      if (contributionsError) throw contributionsError;
      setContributions(contributionsData || []);

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

  const handleSubmitContribution = async () => {
    if (!contributionText.trim()) {
      alert('Veuillez écrire un message');
      return;
    }

    setContributing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Upload des photos
      const photoUrls = [];
      for (const photo of photos) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${chapterId}/${Date.now()}.${fileExt}`;
        
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
          contributor_email: user.email,
          contributor_name: user.user_metadata?.full_name || user.email,
          message: contributionText,
          photo_urls: photoUrls,
          approved: false
        }]);

      if (error) throw error;

      // Réinitialiser le formulaire
      setContributionText('');
      setPhotos([]);
      setPhotoPreviews([]);
      
      // Recharger les contributions
      fetchData();
      
    } catch (error) {
      console.error('❌ Erreur soumission:', error);
      alert('Erreur lors de l\'envoi de votre contribution');
    } finally {
      setContributing(false);
    }
  };

  const copyInviteLink = async () => {
    const inviteLink = `${window.location.origin}/contribute/${bookId}/${chapterId}`;
    await navigator.clipboard.writeText(inviteLink);
    setInviteSuccess(true);
    setTimeout(() => setInviteSuccess(false), 2000);
  };

  const approveContribution = async (contributionId) => {
    try {
      const { error } = await supabase
        .from('contributions')
        .update({ approved: true })
        .eq('id', contributionId);

      if (error) throw error;
      
      setContributions(prev => prev.map(c => 
        c.id === contributionId ? { ...c, approved: true } : c
      ));
      
    } catch (error) {
      console.error('❌ Erreur approbation:', error);
    }
  };

  const deleteContribution = async (contributionId) => {
    if (!window.confirm('Supprimer cette contribution ?')) return;
    
    try {
      const { error } = await supabase
        .from('contributions')
        .delete()
        .eq('id', contributionId);

      if (error) throw error;
      
      setContributions(prev => prev.filter(c => c.id !== contributionId));
      
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
    }
  };

  if (loading) return <Loading message="Chargement du chapitre..." />;
  if (!book || !chapter) return <div>Chapitre non trouvé</div>;

  const isOwner = true; // À vérifier avec l'utilisateur connecté

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* En-tête avec retour */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate(`/book/${bookId}`)}
            style={{
              padding: '0.5rem 1rem',
              background: '#f8f9fa',
              border: '1px solid #ddd',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            ← Retour au livre
          </button>
          <h1 style={{ margin: 0 }}>{chapter.title}</h1>
        </div>
        <button
          onClick={copyInviteLink}
          style={{
            padding: '0.8rem 1.5rem',
            background: '#764ba2',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          🔗 Inviter des proches
          {inviteSuccess && <span style={{ color: '#ffc107' }}>✓ Copié !</span>}
        </button>
      </div>

      {/* Description du chapitre */}
      {chapter.description && (
        <div style={{
          background: '#f8f9fa',
          padding: '1.5rem',
          borderRadius: '10px',
          marginBottom: '2rem',
          border: '1px solid #dee2e6'
        }}>
          <p style={{ margin: 0, color: '#666' }}>{chapter.description}</p>
        </div>
      )}

      {/* Questions IA */}
      {chapter.questions_ia && chapter.questions_ia.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '1.5rem',
          borderRadius: '10px',
          marginBottom: '2rem',
          color: 'white'
        }}>
          <h3 style={{ margin: '0 0 1rem', color: 'white' }}>✨ Questions suggérées par l'IA</h3>
          <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
            {chapter.questions_ia.map((question, idx) => (
              <li key={idx} style={{ marginBottom: '0.5rem' }}>{question}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Formulaire de contribution */}
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        marginBottom: '3rem'
      }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Ma contribution</h2>
        
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
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Ajouter des photos (max 2)
          </label>
          
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoChange}
            id="photo-upload"
            style={{ display: 'none' }}
            disabled={photos.length >= 2}
          />
          
          <label
            htmlFor="photo-upload"
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
            {photos.length}/2 photos
          </p>
        </div>

        {/* Aperçu des photos */}
        {photoPreviews.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
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
                    height: '150px',
                    objectFit: 'cover',
                    borderRadius: '5px'
                  }}
                />
                <button
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
          onClick={handleSubmitContribution}
          disabled={contributing || !contributionText.trim()}
          style={{
            width: '100%',
            padding: '1rem',
            background: contributing || !contributionText.trim() ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: contributing || !contributionText.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {contributing ? 'Envoi en cours...' : 'Enregistrer ma contribution'}
        </button>
      </div>

      {/* Liste des contributions */}
      {contributions.length > 0 && (
        <div>
          <h2 style={{ marginBottom: '1.5rem' }}>
            Contributions ({contributions.length})
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {contributions.map(contribution => (
              <div
                key={contribution.id}
                style={{
                  background: contribution.approved ? '#f3e8ff' : '#fff3cd',
                  padding: '1.5rem',
                  borderRadius: '10px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                  border: contribution.approved ? '1px solid #764ba2' : '1px solid #ffc107',
                  position: 'relative'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem'
                }}>
                  <div>
                    <strong>{contribution.contributor_name}</strong>
                    <span style={{ color: '#666', marginLeft: '1rem', fontSize: '0.9rem' }}>
                      {new Date(contribution.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  {isOwner && !contribution.approved && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => approveContribution(contribution.id)}
                        style={{
                          padding: '0.3rem 0.8rem',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer'
                        }}
                      >
                        ✓ Approuver
                      </button>
                      <button
                        onClick={() => deleteContribution(contribution.id)}
                        style={{
                          padding: '0.3rem 0.8rem',
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>

                <p style={{ margin: '0 0 1rem', lineHeight: '1.6' }}>
                  {contribution.message}
                </p>

                {contribution.photo_urls && contribution.photo_urls.length > 0 && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: '0.5rem',
                    marginTop: '1rem'
                  }}>
                    {contribution.photo_urls.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`Photo ${idx + 1}`}
                        style={{
                          width: '100%',
                          height: '100px',
                          objectFit: 'cover',
                          borderRadius: '5px',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(url, '_blank')}
                      />
                    ))}
                  </div>
                )}

                {!contribution.approved && (
                  <span style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    background: '#ffc107',
                    color: '#333',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '3px',
                    fontSize: '0.8rem'
                  }}>
                    En attente
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChapterPage;