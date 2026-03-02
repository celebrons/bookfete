// C:\Users\USER\bookfete\frontend\src\components\book\chapters\Step2Contribution.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const Step2Contribution = ({ 
  chapter, 
  onSaveContribution,
  onFinalizeContribution,
  user
}) => {
  const [contributionText, setContributionText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');

  const existingContribution = chapter?.currentUserContribution || null;
  const hasContributed = chapter?.hasContributed || false;
  const isFinalized = chapter?.isFinalized || false;

  useEffect(() => {
    if (!chapter?.id) {
      setContributionText('');
      setPhotos([]);
      setPhotoPreviews([]);
      setIsEditing(false);
      return;
    }

    if (existingContribution) {
      const nextPhotos = (existingContribution.photo_urls || []).map((url) => ({
        url,
        preview: url
      }));

      setContributionText(existingContribution.message || '');
      setPhotos(nextPhotos);
      setPhotoPreviews(nextPhotos.map((photo) => photo.preview));
      return;
    }

    if (!hasContributed) {
      setContributionText('');
      setPhotos([]);
      setPhotoPreviews([]);
    }
  }, [chapter?.id, existingContribution, hasContributed]);

  // Upload une photo
  const uploadPhoto = async (file) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${chapter.id}/${Date.now()}.${fileExt}`;
      
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

    setUploading(true);

    for (const file of files) {
      const url = await uploadPhoto(file);
      if (url) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotos(prev => [...prev, { url, preview: reader.result }]);
          setPhotoPreviews(prev => [...prev, reader.result]);
        };
        reader.readAsDataURL(file);
      }
    }

    setUploading(false);
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!contributionText.trim()) {
      alert('Veuillez écrire un message');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const photoUrls = photos.map(p => p.url).filter(Boolean);
      await onSaveContribution(chapter.id, {
        contributor_name: user.user_metadata?.full_name || user.email,
        contributor_email: user.email,
        message: contributionText,
        photo_urls: photoUrls,
        approved: false,
        is_finalized: false
      });
      
      setIsEditing(false);
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!existingContribution) return;

    try {
      setError('');
      await onFinalizeContribution(chapter.id);
      
    } catch (error) {
      console.error('❌ Erreur finalisation:', error);
      setError(error.message);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  // ==================== MODE FINALISÉ ====================
  if (isFinalized) {
    return (
      <div className="contribution-section finalized">
        {error && (
          <div style={{ color: '#dc3545', marginBottom: '15px' }}>❌ {error}</div>
        )}
        
        <div style={{
          background: 'var(--silk)',
          padding: 'var(--space-lg)',
          borderRadius: 'var(--radius)',
          marginBottom: 'var(--space-md)'
        }}>
          <p style={{ fontStyle: 'italic', margin: '0 0 var(--space-md) 0' }}>"{contributionText}"</p>
          
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {photos.map((photo, idx) => (
                <img 
                  key={idx} 
                  src={photo.url} 
                  alt="" 
                  style={{ 
                    width: '60px', 
                    height: '60px', 
                    objectFit: 'cover', 
                    borderRadius: '4px',
                    border: '1px solid var(--mist)'
                  }} 
                />
              ))}
            </div>
          )}
        </div>

        <div className="validated-badge" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-xs)',
          padding: 'var(--space-md)',
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: 'var(--radius)',
          color: '#28a745',
          marginTop: 'var(--space-md)'
        }}>
          <span style={{ fontSize: '20px' }}>✅</span>
          <span style={{ fontWeight: '600' }}>Contribution validée</span>
        </div>
      </div>
    );
  }

  // ==================== MODE BROUILLON ====================
  if (hasContributed && !isEditing) {
    return (
      <div className="contribution-section">
        <div className="questions-header">
          <h3>📝 BROUILLON SAUVEGARDÉ</h3>
          <Tooltip text="Vous pourrez modifier ce message jusqu'à la validation finale">
            <span style={{ color: 'var(--gold)', cursor: 'help' }}>ⓘ</span>
          </Tooltip>
        </div>

        {error && (
          <div style={{ color: '#dc3545', marginBottom: '15px' }}>❌ {error}</div>
        )}

        <div style={{
          background: 'var(--silk)',
          padding: 'var(--space-lg)',
          borderRadius: 'var(--radius)',
          marginBottom: 'var(--space-md)'
        }}>
          <p style={{ fontStyle: 'italic', margin: '0 0 var(--space-md) 0' }}>"{contributionText}"</p>
          
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {photos.map((photo, idx) => (
                <img 
                  key={idx} 
                  src={photo.url} 
                  alt="" 
                  style={{ 
                    width: '60px', 
                    height: '60px', 
                    objectFit: 'cover', 
                    borderRadius: '4px',
                    border: '1px solid var(--mist)'
                  }} 
                />
              ))}
            </div>
          )}
        </div>

        <div className="questions-actions">
          <button onClick={handleEdit} className="btn btn-outline" style={{ flex: 1 }}>✏️ Modifier</button>
          <button onClick={handleFinalize} className="btn btn-primary" style={{ flex: 1 }}>✅ Valider</button>
        </div>
      </div>
    );
  }

  // ==================== MODE ÉDITION ====================
  return (
    <div className="contribution-section">
      {error && (
        <div style={{ color: '#dc3545', marginBottom: '15px' }}>❌ {error}</div>
      )}

      <textarea
        value={contributionText}
        onChange={(e) => setContributionText(e.target.value)}
        placeholder="Votre message..."
        rows="4"
        className="contribution-textarea"
        style={{ width: '100%', marginBottom: '15px' }}
      />

      {photos.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-light)', marginBottom: '5px' }}>Photos :</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {photos.map((photo, idx) => (
              <div key={idx} style={{ position: 'relative', width: '60px', height: '60px' }}>
                <img src={photo.preview || photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                <button
                  onClick={() => removePhoto(idx)}
                  style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    width: '20px',
                    height: '20px',
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
        </div>
      )}

      <div style={{ marginBottom: '15px' }}>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoChange}
          id="photo-upload"
          style={{ display: 'none' }}
          disabled={uploading || photos.length >= 2}
        />
        <label
          htmlFor="photo-upload"
          className="btn btn-outline"
          style={{
            padding: '8px 16px',
            opacity: (uploading || photos.length >= 2) ? 0.5 : 1,
            cursor: (uploading || photos.length >= 2) ? 'not-allowed' : 'pointer'
          }}
        >
          📷 {uploading ? 'Upload...' : 'Ajouter des photos'}
        </label>
        <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--text-light)' }}>
          {photos.length}/2 photos
        </span>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !contributionText.trim()}
        className="btn btn-primary"
        style={{ width: '100%' }}
      >
        {saving ? 'Enregistrement...' : '💾 Enregistrer le brouillon'}
      </button>
    </div>
  );
};

export default Step2Contribution;
