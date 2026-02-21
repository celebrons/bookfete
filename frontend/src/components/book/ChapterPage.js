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
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

  useEffect(() => {
    fetchData();
  }, [bookId, chapterId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Récupérer le livre
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('title, event_type, style_narratif')
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

      // Récupérer les contributions
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

  // ✅ FONCTION DE GÉNÉRATION IA
  const generateAIQuestions = async () => {
    if (!chapter || !book) return;
    
    setGeneratingQuestions(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        alert('Vous devez être connecté');
        return;
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL}/ai/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chapterTitle: chapter.title,
          eventType: book.event_type || 'default',
          style: book.style_narratif || 'factuel'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur génération IA');
      }

      // Mettre à jour les questions du chapitre
      const { error } = await supabase
        .from('chapters')
        .update({ questions_ia: data.questions })
        .eq('id', chapterId);

      if (error) throw error;

      // Mettre à jour l'état local
      setChapter(prev => ({ ...prev, questions_ia: data.questions }));
      
      alert('✅ Nouvelles questions générées avec succès !');
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      alert('Erreur lors de la génération des questions');
    } finally {
      setGeneratingQuestions(false);
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
          contributor_name: user.user_metadata?.full_name || user.email,
          contributor_email: user.email,
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

  if (loading) return <Loading message="Chargement du chapitre..." />;
  if (!book || !chapter) return <div>Chapitre non trouvé</div>;

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
          <div>
            <h1 style={{ margin: 0 }}>{chapter.title}</h1>
            <p style={{ margin: '0.3rem 0 0', color: '#666' }}>{book.title}</p>
          </div>
        </div>
      </div>

      {/* BANNIERE QUESTIONS IA AVEC BOUTON DE GÉNÉRATION */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '2rem',
        borderRadius: '10px',
        marginBottom: '2rem',
        color: 'white',
        boxShadow: '0 10px 30px rgba(118, 75, 162, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '2rem' }}>✨</span>
            <h2 style={{ margin: 0, color: 'white' }}>Questions pour vous aider</h2>
          </div>
          <button
            onClick={generateAIQuestions}
            disabled={generatingQuestions}
            style={{
              padding: '0.8rem 1.5rem',
              background: 'white',
              color: '#764ba2',
              border: 'none',
              borderRadius: '5px',
              fontSize: '0.95rem',
              fontWeight: 'bold',
              cursor: generatingQuestions ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: generatingQuestions ? 0.7 : 1
            }}
          >
            {generatingQuestions ? (
              <>✨ Génération en cours...</>
            ) : (
              <>🤖 Générer de nouvelles questions</>
            )}
          </button>
        </div>
        
        <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem', opacity: 0.95 }}>
          Pour vous aider à rédiger votre contribution, voici des questions suggérées. 
          <strong> Libre à vous de les suivre ou pas.</strong>
        </p>

        {chapter.questions_ia && chapter.questions_ia.length > 0 ? (
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            padding: '1.5rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'white' }}>
              {chapter.questions_ia.map((q, idx) => (
                <li key={idx} style={{ marginBottom: '0.8rem', lineHeight: '1.5' }}>{q}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ fontStyle: 'italic', opacity: 0.8 }}>
            Aucune question pour l'instant. Cliquez sur "Générer" pour en créer.
          </p>
        )}
      </div>

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