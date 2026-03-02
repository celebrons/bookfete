// C:\Users\USER\bookfete\frontend\src\components\contributeur\TokenContributePageLuxe.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Loading from '../common/Loading';
import '../../styles/luxe-theme.css';
import './InvitationLuxe.css';

const TokenContributePageLuxe = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
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
  const [submitting, setSubmitting] = useState(false);
  const [existingPhotoUrls, setExistingPhotoUrls] = useState([]);
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Vérifier l'invitation et charger le brouillon
  useEffect(() => {
    if (!token) {
      setError('Token manquant');
      setLoading(false);
      return;
    }

    const loadInvitationAndDraft = async () => {
      try {
        // Charger l'invitation
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
        const url = `${apiUrl}/invites/token/${token}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Lien invalide ou expiré');
        }

        setInvitation(data);
        
        // Vérifier si on a un brouillon local
        const savedDraft = localStorage.getItem(`draft_contribute_${token}`);
        
        if (savedDraft) {
          // Restaurer le brouillon
          const draft = JSON.parse(savedDraft);
          setFormData({
            name: draft.name || '',
            message: draft.message || ''
          });
          setUploadedPhotoUrls(draft.uploadedPhotoUrls || []);
          setExistingPhotoUrls(draft.existingPhotoUrls || []);
          setIsDraft(true);
        }

        // Charger les données de l'API si pas de brouillon
        if (!savedDraft) {
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
            setExistingPhotoUrls(data.existingContribution.photo_urls || []);
            setIsRevision(data.existingContribution.needs_revision || false);
            setModerationFeedback(data.existingContribution.moderation_feedback || '');
            // Si la contribution existe mais n'est pas finalisée, c'est un brouillon
            setIsDraft(!data.existingContribution.is_finalized);
          }

          if (data.questions && data.questions.length > 0) {
            setQuestions(data.questions);
          }
        }

        const deadlineDate = new Date();
        deadlineDate.setDate(deadlineDate.getDate() + 7);
        setDeadline(deadlineDate);

      } catch (err) {
        console.error('❌ Erreur:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadInvitationAndDraft();
  }, [token]);

  // Auto-sauvegarde toutes les 30 secondes
  useEffect(() => {
    if (!invitation || submitted) return;

    const autoSaveInterval = setInterval(() => {
      if (formData.message.trim() || formData.name.trim() || uploadedPhotoUrls.length > 0) {
        handleAutoSave();
      }
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [formData, uploadedPhotoUrls, invitation, submitted]);

  // Fonction pour uploader une photo immédiatement
  const uploadPhotoImmediately = async (file) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${invitation.chapterId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('contribution-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('contribution-photos')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('❌ Erreur upload:', error);
      return null;
    }
  };

  const handlePhotoChange = async (e) => {
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

    setUploading(true);

    const newUrls = [];
    for (const file of validFiles) {
        const url = await uploadPhotoImmediately(file);
        if (url) {
          newUrls.push(url);
        }
    }

    setUploadedPhotoUrls(prev => [...prev, ...newUrls]);
    setPhotos(prev => [...prev, ...validFiles]);
    setUploading(false);
    handleAutoSave();
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setUploadedPhotoUrls(prev => prev.filter((_, i) => i !== index));
    handleAutoSave();
  };

  const removeExistingPhoto = (index) => {
    setExistingPhotoUrls(prev => prev.filter((_, i) => i !== index));
    handleAutoSave();
  };

  const handleAutoSave = () => {
    try {
      localStorage.setItem(`draft_contribute_${token}`, JSON.stringify({
        name: formData.name,
        message: formData.message,
        uploadedPhotoUrls: uploadedPhotoUrls,
        existingPhotoUrls: existingPhotoUrls,
        lastSaved: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Erreur auto-sauvegarde:', error);
    }
  };

  // Sauvegarde en brouillon
  const handleSaveDraft = async () => {
    if (!formData.name.trim() || !formData.message.trim()) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    setSaving(true);

    try {
      const allPhotoUrls = [...existingPhotoUrls, ...uploadedPhotoUrls];

      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const url = `${apiUrl}/invites/token/${token}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          message: formData.message,
          photoUrls: allPhotoUrls,
          contributionId: existingContribution?.id,
          isDraft: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }

      localStorage.setItem(`draft_contribute_${token}`, JSON.stringify({
        name: formData.name,
        message: formData.message,
        uploadedPhotoUrls: uploadedPhotoUrls,
        existingPhotoUrls: existingPhotoUrls,
        contributionId: data.contributionId,
        lastSaved: new Date().toISOString()
      }));

      setIsDraft(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Validation finale
  const handleFinalize = async () => {
    if (!formData.name.trim() || !formData.message.trim()) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    setSubmitting(true);

    try {
      const allPhotoUrls = [...existingPhotoUrls, ...uploadedPhotoUrls];

      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const url = `${apiUrl}/invites/token/${token}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          message: formData.message,
          photoUrls: allPhotoUrls,
          contributionId: existingContribution?.id,
          isDraft: false
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'envoi');
      }

      localStorage.removeItem(`draft_contribute_${token}`);
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
    return <Loading message="Chargement de votre contribution..." />;
  }

  if (error) {
    return (
      <div className="invitation-container">
        <div className="invitation-card" style={{ textAlign: 'center' }}>
          <div className="empty-state-icon">😕</div>
          <h2 style={{ color: 'var(--ink)', marginBottom: 'var(--space-md)' }}>Oups !</h2>
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-xl)' }}>
            {error}
          </p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="invitation-container">
        <div className="invitation-card" style={{ textAlign: 'center' }}>
          <div className="empty-state-icon">✨</div>
          <h2 style={{ color: 'var(--gold)', marginBottom: 'var(--space-md)' }}>Merci !</h2>
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-sm)' }}>
            Votre contribution a été envoyée avec succès.
          </p>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>
            {invitation?.organizerName || "L'organisateur"} la validera prochainement.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="invitation-container">
      <div className="invitation-card">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
          <span className="label-gold">VOTRE CONTRIBUTION</span>
          <h1 style={{ fontSize: '32px', fontWeight: '600', color: 'var(--ink)', marginTop: 'var(--space-sm)' }}>
            {invitation?.bookTitle}
          </h1>
          <p style={{ color: 'var(--text-light)', fontSize: '16px' }}>
            Chapitre : <strong>{invitation?.chapterTitle}</strong>
          </p>
        </div>

        {isRevision && moderationFeedback && (
          <div className="card" style={{ 
            background: '#fff3cd', 
            borderColor: '#ffeeba',
            marginBottom: 'var(--space-lg)'
          }}>
            <p style={{ fontWeight: '600', marginBottom: 'var(--space-xs)' }}>✏️ Demande de modification :</p>
            <p style={{ fontStyle: 'italic', color: 'var(--ink)' }}>"{moderationFeedback}"</p>
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()}>
          <div className="form-group">
            <label className="label-gold">Votre nom *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Comment souhaitez-vous être nommé ?"
              className="input-luxe"
            />
          </div>

          <div className="form-group">
            <label className="label-gold">Votre message *</label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              required
              rows="6"
              placeholder="Rédigez ici votre message, souvenir ou témoignage..."
              className="input-luxe"
              style={{ resize: 'vertical' }}
            />
          </div>

          {existingPhotoUrls.length > 0 && (
            <div className="form-group">
              <label className="label-gold">Photos déjà envoyées</label>
              <div className="photo-grid">
                {existingPhotoUrls.map((url, index) => (
                  <div key={index} className="photo-item">
                    <img src={url} alt={`Photo ${index + 1}`} />
                    <button
                      type="button"
                      onClick={() => removeExistingPhoto(index)}
                      className="photo-remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uploadedPhotoUrls.length > 0 && (
            <div className="form-group">
              <label className="label-gold">Nouvelles photos</label>
              <div className="photo-grid">
                {uploadedPhotoUrls.map((url, index) => (
                  <div key={index} className="photo-item">
                    <img src={url} alt={`Uploaded ${index + 1}`} />
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedPhotoUrls(prev => prev.filter((_, i) => i !== index));
                        setPhotos(prev => prev.filter((_, i) => i !== index));
                        handleAutoSave();
                      }}
                      className="photo-remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="label-gold">Ajouter des photos (max 2)</label>
            
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              id="photo-upload"
              style={{ display: 'none' }}
              disabled={uploading || photos.length >= 2}
            />
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginTop: 'var(--space-xs)' }}>
              <label
                htmlFor="photo-upload"
                className="btn btn-outline"
                style={{
                  opacity: (uploading || photos.length >= 2) ? 0.5 : 1,
                  cursor: (uploading || photos.length >= 2) ? 'not-allowed' : 'pointer',
                  padding: '10px 20px'
                }}
              >
                <span style={{ marginRight: 'var(--space-xs)' }}>📷</span>
                {uploading ? 'Upload...' : 'Choisir des photos'}
              </label>
              <span className="body-text" style={{ fontSize: '13px' }}>
                {photos.length}/2 nouvelles photos
              </span>
            </div>
          </div>

          {saved && (
            <div className="card" style={{
              background: '#d4edda',
              borderColor: '#c3e6cb',
              color: '#155724',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              marginBottom: 'var(--space-lg)',
              padding: 'var(--space-sm) var(--space-md)'
            }}>
              <span>✅</span>
              <span>Brouillon sauvegardé</span>
            </div>
          )}

          <div className="card" style={{
            background: '#fff3cd',
            borderColor: '#ffeeba',
            color: '#856404',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-md)',
            marginBottom: 'var(--space-xl)',
            padding: 'var(--space-md) var(--space-lg)'
          }}>
            <span style={{ fontSize: '20px' }}>⚡</span>
            <p style={{ margin: 0, fontSize: '14px' }}>
              La validation est définitive. Vous pouvez sauvegarder un brouillon et revenir plus tard.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || submitting || !formData.name.trim() || !formData.message.trim()}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              <span style={{ marginRight: 'var(--space-xs)' }}>💾</span>
              {saving ? 'Sauvegarde...' : 'Sauvegarder le brouillon'}
            </button>
            
            <button
              type="button"
              onClick={handleFinalize}
              disabled={submitting || saving || !formData.name.trim() || !formData.message.trim()}
              className="btn btn-primary"
              style={{ flex: 2 }}
            >
              <span style={{ marginRight: 'var(--space-xs)' }}>✨</span>
              {submitting ? 'Envoi...' : 'Valider définitivement'}
            </button>
          </div>

          {isDraft && !submitted && (
            <p style={{ 
              marginTop: 'var(--space-md)', 
              fontSize: '12px', 
              color: 'var(--gold)',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              📝 Brouillon sauvegardé - Vous pouvez revenir plus tard avec le même lien
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default TokenContributePageLuxe;
