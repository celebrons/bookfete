// C:\Users\USER\bookfete\frontend\src\components\contributeur\InvitationPage.js
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const InvitationPage = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    message: ''
  });
  const [questions, setQuestions] = useState([]);
  const [deadline, setDeadline] = useState(null);
  const [existingContribution, setExistingContribution] = useState(null);
  const [isRevision, setIsRevision] = useState(false);
  const [moderationFeedback, setModerationFeedback] = useState('');
  
  // États pour les photos
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Auto-sauvegarde toutes les 30 secondes
  useEffect(() => {
    if (!invitation || submitted) return;

    const autoSaveInterval = setInterval(() => {
      if (formData.message.trim() || formData.name.trim()) {
        handleAutoSave();
      }
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [formData, invitation, submitted]);

  // Charger le brouillon au démarrage
  useEffect(() => {
    if (token) {
      const savedDraft = localStorage.getItem(`draft_${token}`);
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          setFormData(prev => ({
            ...prev,
            name: draft.name || prev.name,
            message: draft.message || ''
          }));
        } catch (e) {
          console.error('Erreur chargement brouillon', e);
        }
      }
    }
  }, [token]);

  // Vérifier l'invitation
  useEffect(() => {
    if (!token) {
      setError('Token manquant');
      setLoading(false);
      return;
    }

    const checkInvitation = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
        const url = `${apiUrl}/invites/token/${token}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Lien invalide ou expiré');
        }

        setInvitation(data);
        setFormData(prev => ({
          ...prev,
          name: data.email ? data.email.split('@')[0] : ''
        }));

        if (data.existingContribution) {
          setExistingContribution(data.existingContribution);
          setFormData(prev => ({
            ...prev,
            name: data.email.split('@')[0],
            message: data.existingContribution.message || ''
          }));
          setIsRevision(data.existingContribution.needs_revision || false);
          setModerationFeedback(data.existingContribution.moderation_feedback || '');
          
          // Charger les photos existantes
          if (data.existingContribution.photo_urls) {
            // Note: on ne peut pas pré-remplir les photos facilement
          }
        }

        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions);
        }

        const deadlineDate = new Date();
        deadlineDate.setDate(deadlineDate.getDate() + 7);
        setDeadline(deadlineDate);

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    checkInvitation();
  }, [token]);

  const handleAutoSave = () => {
    if (!formData.name.trim() && !formData.message.trim()) return;
    
    try {
      localStorage.setItem(`draft_${token}`, JSON.stringify({
        name: formData.name,
        message: formData.message,
        lastSaved: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Erreur auto-sauvegarde:', error);
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
      if (!isValid) alert(`${file.name} : format invalide ou trop volumineux (max 5MB)`);
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

  const handleSaveDraft = () => {
    if (!formData.name.trim()) {
      alert('Veuillez indiquer votre nom');
      return;
    }

    setSaving(true);
    
    try {
      localStorage.setItem(`draft_${token}`, JSON.stringify({
        name: formData.name,
        message: formData.message,
        lastSaved: new Date().toISOString()
      }));
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.message.trim()) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    setSubmitting(true);

    try {
      const photoUrls = [];
      for (const photo of photos) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${invitation.chapterId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('contribution-photos')
          .upload(fileName, photo);

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('contribution-photos')
            .getPublicUrl(fileName);
          photoUrls.push(publicUrl);
        }
      }

      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const url = `${apiUrl}/invites/token/${token}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          message: formData.message,
          photoUrls,
          contributionId: existingContribution?.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'envoi');
      }

      localStorage.removeItem(`draft_${token}`);
      setSubmitted(true);
      
    } catch (error) {
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={loadingCardStyle}>
          <div style={spinnerStyle} />
          <p style={loadingTextStyle}>Chargement de votre invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorCardStyle}>
          <div style={errorIconStyle}>😕</div>
          <h2 style={errorTitleStyle}>Oups !</h2>
          <p style={errorMessageStyle}>{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={containerStyle}>
        <div style={successCardStyle}>
          <div style={successIconStyle}>✨</div>
          <h2 style={successTitleStyle}>Merci !</h2>
          <p style={successMessageStyle}>Votre contribution a bien été envoyée.</p>
          <p style={successNoteStyle}>
            {invitation?.organizerName || "L'organisateur"} vous recontactera si nécessaire.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={mainCardStyle}>
        {/* En-tête */}
        <div style={headerStyle}>
          <div style={bookIconStyle}>📖</div>
          <h1 style={bookTitleStyle}>{invitation?.bookTitle}</h1>
          <h2 style={chapterTitleStyle}>
            Chapitre : {invitation?.chapterTitle}
          </h2>
        </div>

        {/* Message de révision */}
        {isRevision && moderationFeedback && (
          <div style={{
            background: '#fff3cd',
            border: '1px solid #ffeeba',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#856404'
          }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
              ✏️ Demande de modification de l'organisateur :
            </strong>
            <p style={{ margin: 0, fontStyle: 'italic' }}>
              "{moderationFeedback}"
            </p>
          </div>
        )}

        {/* Message contextuel */}
        <div style={contextMessageStyle}>
          <p style={contextTextStyle}>
            <span style={highlightStyle}>{invitation?.organizerName || "L'organisateur"}</span> vous a invité à contribuer 
            à un livre personnalisé pour <span style={highlightStyle}>{invitation?.recipientName || "la personne"}</span> 
            à l'occasion de <span style={highlightStyle}>{invitation?.eventType || "son événement"}</span>.
          </p>
        </div>

        {/* Deadline */}
        {deadline && (
          <div style={deadlineStyle}>
            <span style={deadlineIconStyle}>⏰</span>
            <div style={deadlineTextStyle}>
              <strong>Contribuez avant le {formatDate(deadline)}</strong>
              <span style={deadlineNoteStyle}>Passé cette date, vos modifications ne seront plus possibles</span>
            </div>
          </div>
        )}

        {/* Questions guides */}
        {questions.length > 0 && (
          <div style={questionsContainerStyle}>
            <h3 style={questionsTitleStyle}>
              <span style={questionsIconStyle}>💡</span> Pour vous aider
            </h3>
            <div style={questionsListStyle}>
              {questions.map((q, idx) => (
                <div key={idx} style={questionItemStyle}>
                  <span style={questionBulletStyle}>{idx + 1}</span>
                  <span style={questionTextStyle}>{q}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message si pas de questions */}
        {questions.length === 0 && (
          <div style={{
            background: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            textAlign: 'center',
            color: '#999',
            fontStyle: 'italic'
          }}>
            L'organisateur prépare les questions pour vous guider...
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} style={formStyle}>
          {/* Nom */}
          <div style={inputGroupStyle}>
            <label style={labelStyle}>
              Votre nom <span style={requiredStarStyle}>*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Comment souhaitez-vous être nommé ?"
              style={inputStyle}
            />
          </div>

          {/* Message */}
          <div style={inputGroupStyle}>
            <label style={labelStyle}>
              Votre message <span style={requiredStarStyle}>*</span>
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              required
              rows="5"
              placeholder="Rédigez ici votre message, souvenir ou témoignage..."
              style={textareaStyle}
            />
          </div>

          {/* Photos */}
          <div style={photoSectionStyle}>
            <label style={labelStyle}>Photos (max 2)</label>
            
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              id="photo-upload"
              style={{ display: 'none' }}
              disabled={photos.length >= 2}
            />
            
            <div style={photoUploadAreaStyle}>
              <label
                htmlFor="photo-upload"
                style={{
                  ...photoUploadButtonStyle,
                  opacity: photos.length >= 2 ? 0.5 : 1,
                  cursor: photos.length >= 2 ? 'not-allowed' : 'pointer'
                }}
              >
                <span style={photoUploadIconStyle}>📷</span>
                Choisir des photos
              </label>
              <span style={photoCountStyle}>{photos.length}/2 photos</span>
            </div>

            {photoPreviews.length > 0 && (
              <div style={previewGridStyle}>
                {photoPreviews.map((preview, index) => (
                  <div key={index} style={previewItemStyle}>
                    <img src={preview} alt="" style={previewImageStyle} />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      style={removePhotoButtonStyle}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message de sauvegarde */}
          {saved && (
            <div style={saveSuccessStyle}>
              <span style={saveSuccessIconStyle}>✅</span>
              Brouillon sauvegardé
            </div>
          )}

          {/* Avertissement */}
          <div style={warningStyle}>
            <span style={warningIconStyle}>⚡</span>
            <span style={warningTextStyle}>
              La validation est définitive. Vous pouvez sauvegarder un brouillon avant de valider.
            </span>
          </div>

          {/* Boutons */}
          <div style={buttonGroupStyle}>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || !formData.name.trim()}
              style={saveButtonStyle(saving || !formData.name.trim())}
            >
              <span style={buttonIconStyle}>💾</span>
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
            
            <button
              type="submit"
              disabled={submitting || !formData.name.trim() || !formData.message.trim()}
              style={submitButtonStyle(submitting || !formData.name.trim() || !formData.message.trim())}
            >
              <span style={buttonIconStyle}>✨</span>
              {submitting ? 'Envoi...' : 'Valider ma contribution'}
            </button>
          </div>

          <p style={termsNoteStyle}>
            En validant, vous acceptez que votre message et photos soient publiés dans le livre.
          </p>
        </form>
      </div>
    </div>
  );
};

// ============================================
// STYLES
// ============================================
const containerStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  padding: '2rem',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
};

const mainCardStyle = {
  background: 'white',
  padding: '3rem',
  borderRadius: '24px',
  maxWidth: '800px',
  width: '100%',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  maxHeight: '90vh',
  overflowY: 'auto'
};

const headerStyle = {
  textAlign: 'center',
  marginBottom: '2.5rem'
};

const bookIconStyle = {
  fontSize: '4rem',
  marginBottom: '1rem',
  opacity: 0.9
};

const bookTitleStyle = {
  margin: '0 0 0.5rem',
  color: '#1a1a1a',
  fontSize: '2.5rem',
  fontWeight: '700',
  fontFamily: "'Playfair Display', serif"
};

const chapterTitleStyle = {
  margin: 0,
  color: '#666',
  fontSize: '1.2rem',
  fontWeight: '400'
};

const contextMessageStyle = {
  background: '#f8f5ff',
  padding: '1.5rem',
  borderRadius: '16px',
  marginBottom: '2rem',
  border: '1px solid #e9e0ff'
};

const contextTextStyle = {
  margin: 0,
  color: '#4a4a4a',
  fontSize: '1.1rem',
  lineHeight: '1.6',
  textAlign: 'center'
};

const highlightStyle = {
  color: '#764ba2',
  fontWeight: '600',
  background: 'linear-gradient(120deg, #f3e8ff 0%, #f3e8ff 100%)',
  padding: '0.2rem 0.4rem',
  borderRadius: '4px'
};

const deadlineStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  background: '#fff9e6',
  padding: '1.2rem',
  borderRadius: '12px',
  marginBottom: '2rem',
  border: '1px solid #ffeeba'
};

const deadlineIconStyle = {
  fontSize: '1.8rem'
};

const deadlineTextStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem'
};

const deadlineNoteStyle = {
  fontSize: '0.9rem',
  color: '#856404',
  opacity: 0.9
};

const questionsContainerStyle = {
  background: '#fafafa',
  padding: '2rem',
  borderRadius: '20px',
  marginBottom: '2.5rem'
};

const questionsTitleStyle = {
  margin: '0 0 1.5rem',
  color: '#333',
  fontSize: '1.2rem',
  fontWeight: '600',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem'
};

const questionsIconStyle = {
  fontSize: '1.4rem'
};

const questionsListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const questionItemStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '1rem',
  padding: '0.5rem 0'
};

const questionBulletStyle = {
  width: '24px',
  height: '24px',
  background: '#764ba2',
  color: 'white',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.9rem',
  fontWeight: '600',
  flexShrink: 0
};

const questionTextStyle = {
  color: '#555',
  fontSize: '1rem',
  lineHeight: '1.5',
  flex: 1
};

const formStyle = {
  marginTop: '1rem'
};

const inputGroupStyle = {
  marginBottom: '1.8rem'
};

const labelStyle = {
  display: 'block',
  marginBottom: '0.6rem',
  color: '#333',
  fontSize: '0.95rem',
  fontWeight: '600'
};

const requiredStarStyle = {
  color: '#dc3545',
  marginLeft: '0.2rem'
};

const inputStyle = {
  width: '100%',
  padding: '1rem 1.2rem',
  border: '2px solid #e9ecef',
  borderRadius: '12px',
  fontSize: '1rem',
  transition: 'all 0.3s ease',
  outline: 'none',
  backgroundColor: '#fafafa'
};

const textareaStyle = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: '120px'
};

const photoSectionStyle = {
  marginBottom: '2rem'
};

const photoUploadAreaStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '1.5rem',
  marginTop: '0.5rem'
};

const photoUploadButtonStyle = {
  padding: '0.8rem 2rem',
  background: '#f3f3f3',
  border: '2px dashed #ccc',
  borderRadius: '12px',
  fontSize: '1rem',
  color: '#555',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  transition: 'all 0.3s ease'
};

const photoUploadIconStyle = {
  fontSize: '1.2rem'
};

const photoCountStyle = {
  color: '#666',
  fontSize: '0.9rem'
};

const previewGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '1rem',
  marginTop: '1.5rem'
};

const previewItemStyle = {
  position: 'relative',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
};

const previewImageStyle = {
  width: '100%',
  height: '120px',
  objectFit: 'cover'
};

const removePhotoButtonStyle = {
  position: 'absolute',
  top: '6px',
  right: '6px',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  background: '#dc3545',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.2rem',
  fontWeight: 'bold',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
};

const saveSuccessStyle = {
  padding: '1rem',
  background: '#d4edda',
  border: '1px solid #c3e6cb',
  borderRadius: '12px',
  color: '#155724',
  marginBottom: '1.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.95rem'
};

const saveSuccessIconStyle = {
  fontSize: '1.2rem'
};

const warningStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.8rem',
  padding: '1rem',
  background: '#fff3cd',
  border: '1px solid #ffeeba',
  borderRadius: '12px',
  marginBottom: '2rem',
  color: '#856404'
};

const warningIconStyle = {
  fontSize: '1.3rem'
};

const warningTextStyle = {
  fontSize: '0.95rem',
  lineHeight: '1.5'
};

const buttonGroupStyle = {
  display: 'flex',
  gap: '1rem',
  marginBottom: '1.5rem'
};

const buttonIconStyle = {
  marginRight: '0.5rem',
  fontSize: '1.1rem'
};

const saveButtonStyle = (disabled) => ({
  flex: 1,
  padding: '1rem',
  background: disabled ? '#e9ecef' : '#6c757d',
  color: disabled ? '#adb5bd' : 'white',
  border: 'none',
  borderRadius: '12px',
  fontSize: '1rem',
  fontWeight: '600',
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.3s ease'
});

const submitButtonStyle = (disabled) => ({
  flex: 2,
  padding: '1rem',
  background: disabled ? '#e9ecef' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: disabled ? '#adb5bd' : 'white',
  border: 'none',
  borderRadius: '12px',
  fontSize: '1rem',
  fontWeight: '600',
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.3s ease',
  boxShadow: disabled ? 'none' : '0 10px 20px -10px rgba(118, 75, 162, 0.5)'
});

const termsNoteStyle = {
  textAlign: 'center',
  color: '#999',
  fontSize: '0.85rem',
  marginTop: '1.5rem'
};

const loadingCardStyle = {
  ...mainCardStyle,
  textAlign: 'center',
  padding: '4rem'
};

const spinnerStyle = {
  border: '3px solid #f3f3f3',
  borderTop: '3px solid #764ba2',
  borderRadius: '50%',
  width: '50px',
  height: '50px',
  animation: 'spin 1s linear infinite',
  margin: '0 auto 1.5rem'
};

const loadingTextStyle = {
  color: '#666',
  fontSize: '1.1rem'
};

const errorCardStyle = {
  ...mainCardStyle,
  textAlign: 'center',
  padding: '4rem'
};

const errorIconStyle = {
  fontSize: '4rem',
  marginBottom: '1rem',
  opacity: 0.8
};

const errorTitleStyle = {
  color: '#dc3545',
  marginBottom: '0.5rem',
  fontSize: '2rem'
};

const errorMessageStyle = {
  color: '#666',
  fontSize: '1.1rem'
};

const successCardStyle = {
  ...mainCardStyle,
  textAlign: 'center',
  padding: '4rem'
};

const successIconStyle = {
  fontSize: '4rem',
  marginBottom: '1rem'
};

const successTitleStyle = {
  color: '#28a745',
  marginBottom: '1rem',
  fontSize: '2rem'
};

const successMessageStyle = {
  color: '#333',
  fontSize: '1.2rem',
  marginBottom: '1rem'
};

const successNoteStyle = {
  color: '#666',
  fontSize: '1rem'
};

export default InvitationPage;