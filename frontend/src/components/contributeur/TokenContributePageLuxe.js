import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Loading from '../common/Loading';
import ContributionAmorceBlock from './ContributionAmorceBlock';
import '../../styles/luxe-theme.css';
import './InvitationLuxe.css';

const DRAFT_STORAGE_PREFIX = 'draft_contribute_';

const buildApiUrl = (token) => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  const baseUrl = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  return `${baseUrl}/invites/token/${token}`;
};

const TokenContributePageLuxe = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [existingContribution, setExistingContribution] = useState(null);
  const [isRevision, setIsRevision] = useState(false);
  const [moderationFeedback, setModerationFeedback] = useState('');
  const [amorceText, setAmorceText] = useState('');
  const [triggers, setTriggers] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    message: ''
  });
  const [photos, setPhotos] = useState([]);
  const [existingPhotoUrls, setExistingPhotoUrls] = useState([]);
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token manquant');
      setLoading(false);
      return;
    }

    const loadInvitation = async () => {
      try {
        const response = await fetch(buildApiUrl(token));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Lien invalide ou expire');
        }

        setInvitation(data);
        setAmorceText(data.amorceText || '');
        setTriggers(Array.isArray(data.triggers) ? data.triggers : []);

        const savedDraft = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${token}`);
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          setFormData({
            name: draft.name || '',
            message: draft.message || ''
          });
          setUploadedPhotoUrls(draft.uploadedPhotoUrls || []);
          setExistingPhotoUrls(draft.existingPhotoUrls || []);
          setIsDraft(true);
        } else {
          const defaultName = data.email ? data.email.split('@')[0] : '';
          setFormData((prev) => ({
            ...prev,
            name: defaultName
          }));

          if (data.existingContribution) {
            setExistingContribution(data.existingContribution);
            setFormData({
              name: defaultName,
              message: data.existingContribution.message || ''
            });
            setExistingPhotoUrls(data.existingContribution.photo_urls || []);
            setIsRevision(Boolean(data.existingContribution.needs_revision));
            setModerationFeedback(data.existingContribution.moderation_feedback || '');
            setIsDraft(!data.existingContribution.is_finalized);
          }
        }
      } catch (loadError) {
        console.error('Erreur chargement contribution token:', loadError);
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };

    loadInvitation();
  }, [token]);

  const handleAutoSave = useCallback(() => {
    try {
      localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${token}`, JSON.stringify({
        name: formData.name,
        message: formData.message,
        uploadedPhotoUrls,
        existingPhotoUrls,
        lastSaved: new Date().toISOString()
      }));
    } catch (autoSaveError) {
      console.error('Erreur auto-sauvegarde:', autoSaveError);
    }
  }, [existingPhotoUrls, formData.message, formData.name, token, uploadedPhotoUrls]);

  useEffect(() => {
    if (!invitation || submitted) return undefined;

    const intervalId = setInterval(() => {
      if (formData.name.trim() || formData.message.trim() || uploadedPhotoUrls.length > 0 || existingPhotoUrls.length > 0) {
        handleAutoSave();
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [existingPhotoUrls.length, formData.message, formData.name, handleAutoSave, invitation, submitted, uploadedPhotoUrls.length]);

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
    } catch (uploadError) {
      console.error('Erreur upload photo:', uploadError);
      return null;
    }
  };

  const handlePhotoChange = async (event) => {
    const files = Array.from(event.target.files || []);

    if (photos.length + files.length > 2) {
      alert('Maximum 2 photos');
      return;
    }

    const validFiles = files.filter((file) => {
      const isValid = file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024;
      if (!isValid) {
        alert(`${file.name} : format invalide ou trop volumineux (max 5MB)`);
      }
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

    setUploadedPhotoUrls((prev) => [...prev, ...newUrls]);
    setPhotos((prev) => [...prev, ...validFiles]);
    setUploading(false);
    handleAutoSave();
  };

  const saveContribution = async ({ isDraftSave }) => {
    const allPhotoUrls = [...existingPhotoUrls, ...uploadedPhotoUrls];
    const response = await fetch(buildApiUrl(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        message: formData.message,
        photoUrls: allPhotoUrls,
        contributionId: existingContribution?.id,
        isDraft: isDraftSave
      })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de l envoi');
    }

    return data;
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const data = await saveContribution({ isDraftSave: true });
      localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${token}`, JSON.stringify({
        name: formData.name,
        message: formData.message,
        uploadedPhotoUrls,
        existingPhotoUrls,
        contributionId: data.contributionId,
        lastSaved: new Date().toISOString()
      }));
      setIsDraft(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      alert(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    setSubmitting(true);
    try {
      await saveContribution({ isDraftSave: false });
      localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${token}`);
      setSubmitted(true);
    } catch (submitError) {
      alert(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loading message="Chargement de votre contribution..." />;
  }

  if (error) {
    return (
      <div className="invitation-container">
        <div className="invitation-card" style={{ textAlign: 'center' }}>
          <div className="empty-state-icon">•</div>
          <h2 style={{ color: 'var(--ink)', marginBottom: 'var(--space-md)' }}>Oups !</h2>
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-xl)' }}>
            {error}
          </p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Retour a l accueil
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="invitation-container">
        <div className="invitation-card" style={{ textAlign: 'center' }}>
          <div className="empty-state-icon">*</div>
          <h2 style={{ color: 'var(--gold)', marginBottom: 'var(--space-md)' }}>Merci !</h2>
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-sm)' }}>
            Votre contribution a ete envoyee avec succes.
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

        {isRevision && moderationFeedback ? (
          <div
            className="card"
            style={{
              background: '#fff3cd',
              borderColor: '#ffeeba',
              marginBottom: 'var(--space-lg)'
            }}
          >
            <p style={{ fontWeight: '600', marginBottom: 'var(--space-xs)' }}>Demande de modification :</p>
            <p style={{ fontStyle: 'italic', color: 'var(--ink)' }}>"{moderationFeedback}"</p>
          </div>
        ) : null}

        <form onSubmit={(event) => event.preventDefault()}>
          <div className="form-group">
            <label className="label-gold">Votre nom</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Comment souhaitez-vous etre nomme ?"
              className="input-luxe"
            />
          </div>

          <ContributionAmorceBlock
            amorceText={amorceText}
            triggers={triggers}
            message={formData.message}
            onChangeMessage={(message) => setFormData((prev) => ({ ...prev, message }))}
          />

          {existingPhotoUrls.length > 0 ? (
            <div className="form-group">
              <label className="label-gold">Photos deja envoyees</label>
              <div className="photo-grid">
                {existingPhotoUrls.map((url, index) => (
                  <div key={index} className="photo-item">
                    <img src={url} alt={`Illustration ${index + 1}`} />
                    <button
                      type="button"
                      onClick={() => {
                        setExistingPhotoUrls((prev) => prev.filter((_, i) => i !== index));
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
          ) : null}

          {uploadedPhotoUrls.length > 0 ? (
            <div className="form-group">
              <label className="label-gold">Nouvelles photos</label>
              <div className="photo-grid">
                {uploadedPhotoUrls.map((url, index) => (
                  <div key={index} className="photo-item">
                    <img src={url} alt={`Illustration importee ${index + 1}`} />
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedPhotoUrls((prev) => prev.filter((_, i) => i !== index));
                        setPhotos((prev) => prev.filter((_, i) => i !== index));
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
          ) : null}

          <div className="form-group">
            <label className="label-gold">Ajouter une photo</label>
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

          {saved ? (
            <div
              className="card"
              style={{
                background: '#d4edda',
                borderColor: '#c3e6cb',
                color: '#155724',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                marginBottom: 'var(--space-lg)',
                padding: 'var(--space-sm) var(--space-md)'
              }}
            >
              <span>✓</span>
              <span>Brouillon sauvegarde</span>
            </div>
          ) : null}

          <div
            className="card"
            style={{
              background: '#fff3cd',
              borderColor: '#ffeeba',
              color: '#856404',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-md)',
              marginBottom: 'var(--space-xl)',
              padding: 'var(--space-md) var(--space-lg)'
            }}
          >
            <span style={{ fontSize: '20px' }}>⚡</span>
            <p style={{ margin: 0, fontSize: '14px' }}>
              La validation est definitive. Vous pouvez sauvegarder un brouillon et revenir plus tard.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || submitting}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              <span style={{ marginRight: 'var(--space-xs)' }}>💾</span>
              {saving ? 'Sauvegarde...' : 'Sauvegarder le brouillon'}
            </button>

            <button
              type="button"
              onClick={handleFinalize}
              disabled={submitting || saving}
              className="btn btn-primary"
              style={{ flex: 2 }}
            >
              <span style={{ marginRight: 'var(--space-xs)' }}>✦</span>
              {submitting ? 'Envoi...' : 'Valider definitivement'}
            </button>
          </div>

          {isDraft && !submitted ? (
            <p
              style={{
                marginTop: 'var(--space-md)',
                fontSize: '12px',
                color: 'var(--gold)',
                textAlign: 'center',
                fontStyle: 'italic'
              }}
            >
              Brouillon sauvegarde - Vous pouvez revenir plus tard avec le meme lien
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
};

export default TokenContributePageLuxe;
