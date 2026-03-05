import React, { useEffect, useState } from 'react';
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
  const [finalizing, setFinalizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const existingContribution = chapter?.currentUserContribution || null;
  const hasContributed = chapter?.hasContributed || false;
  const isFinalized = chapter?.isFinalized || false;
  const chapterLocked = chapter?.isChapterClosed || false;

  useEffect(() => {
    setError('');
    setNotice('');

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

  useEffect(() => {
    if (!chapterLocked) {
      return;
    }

    setIsEditing(false);
  }, [chapterLocked]);

  const uploadPhoto = async (file) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${chapter.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('contribution-photos')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl }
      } = supabase.storage
        .from('contribution-photos')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (uploadError) {
      console.error('Erreur upload:', uploadError);
      return null;
    }
  };

  const handlePhotoChange = async (event) => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    const files = Array.from(event.target.files || []);

    if (photos.length + files.length > 2) {
      setError('Maximum 2 photos.');
      return;
    }

    setUploading(true);
    setError('');

    for (const file of files) {
      const url = await uploadPhoto(file);

      if (!url) {
        continue;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos((previous) => [...previous, { url, preview: reader.result }]);
        setPhotoPreviews((previous) => [...previous, reader.result]);
      };
      reader.readAsDataURL(file);
    }

    setUploading(false);
  };

  const removePhoto = (index) => {
    if (chapterLocked) {
      return;
    }

    setPhotos((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
    setPhotoPreviews((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSave = async () => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    if (!contributionText.trim()) {
      setError('Veuillez ecrire un message.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const photoUrls = photos.map((photo) => photo.url).filter(Boolean);

      await onSaveContribution(chapter.id, {
        contributor_name: user.user_metadata?.full_name || user.email,
        contributor_email: user.email,
        message: contributionText,
        photo_urls: photoUrls,
        approved: false,
        is_finalized: false
      });

      setIsEditing(false);
      setNotice('Brouillon enregistre.');
    } catch (saveError) {
      console.error('Erreur sauvegarde:', saveError);
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    if (!existingContribution) {
      return;
    }

    try {
      setFinalizing(true);
      setError('');
      setNotice('');
      await onFinalizeContribution(chapter.id);
      setNotice('Contribution validee.');
    } catch (finalizeError) {
      console.error('Erreur finalisation:', finalizeError);
      setError(finalizeError.message);
    } finally {
      setFinalizing(false);
    }
  };

  const handleCancelEdit = () => {
    if (existingContribution) {
      const nextPhotos = (existingContribution.photo_urls || []).map((url) => ({
        url,
        preview: url
      }));
      setContributionText(existingContribution.message || '');
      setPhotos(nextPhotos);
      setPhotoPreviews(nextPhotos.map((photo) => photo.preview));
    }

    setError('');
    setNotice('');
    setIsEditing(false);
  };

  const renderContentCard = () => (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.72)',
        padding: 'var(--space-lg)',
        borderRadius: 'var(--radius)',
        marginBottom: 'var(--space-md)'
      }}
    >
      <p style={{ fontStyle: 'italic', margin: '0 0 var(--space-md) 0' }}>"{contributionText}"</p>

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {photos.map((photo, index) => (
            <img
              key={index}
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
  );

  if (chapterLocked) {
    const hasLockedContent = Boolean(contributionText.trim()) || photos.length > 0;

    return (
      <div className="workflow-content">
        <div className="contribution-section finalized">
          {notice && (
            <div className="luxe-feedback-banner is-success">{notice}</div>
          )}
          {error && (
            <div className="luxe-feedback-banner is-error">{error}</div>
          )}
          <div className="luxe-feedback-banner is-info">
            Chapitre verrouille: la validation finale bloque toute modification de votre contribution.
          </div>
          {hasLockedContent ? (
            renderContentCard()
          ) : (
            <div className="card" style={{ boxShadow: 'none', background: 'rgba(255, 255, 255, 0.72)' }}>
              Aucune contribution enregistree sur ce chapitre.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isFinalized) {
    return (
      <div className="workflow-content">
        <div className="contribution-section finalized">
          {notice && (
            <div className="luxe-feedback-banner is-success">{notice}</div>
          )}
          {error && (
            <div className="luxe-feedback-banner is-error">{error}</div>
          )}
          {renderContentCard()}
        </div>
      </div>
    );
  }

  if (hasContributed && !isEditing) {
    return (
      <div className="workflow-content">
        <div className="contribution-section">
          {notice && (
            <div className="luxe-feedback-banner is-success">{notice}</div>
          )}
          <div className="questions-header">
            <h3>Brouillon sauvegarde</h3>
            <Tooltip text="Vous pourrez modifier ce message jusqu'a la validation finale">
              <span style={{ color: 'var(--gold)', cursor: 'help' }}>i</span>
            </Tooltip>
          </div>

          {error && (
            <div className="luxe-feedback-banner is-error">{error}</div>
          )}

          {renderContentCard()}

          <div className="questions-actions">
            <button
              onClick={() => setIsEditing(true)}
              className="btn btn-outline"
              style={{ flex: 1 }}
              disabled={finalizing}
            >
              Modifier
            </button>
            <button
              onClick={handleFinalize}
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={finalizing}
            >
              {finalizing ? 'Validation...' : 'Valider'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-content">
      <div className="contribution-section">
        {notice && (
          <div className="luxe-feedback-banner is-success">{notice}</div>
        )}
        {error && (
          <div className="luxe-feedback-banner is-error">{error}</div>
        )}

        <textarea
          value={contributionText}
          onChange={(event) => setContributionText(event.target.value)}
          placeholder="Votre message..."
          rows="4"
          className="contribution-textarea"
          style={{ width: '100%', marginBottom: '15px' }}
        />

        {photos.length > 0 && (
          <div style={{ marginBottom: '15px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-light)', marginBottom: '5px' }}>Photos :</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {photos.map((photo, index) => (
                <div key={index} style={{ position: 'relative', width: '60px', height: '60px' }}>
                  <img
                    src={photoPreviews[index] || photo.preview || photo.url}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '4px'
                    }}
                  />
                  <button
                    onClick={() => removePhoto(index)}
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
                    x
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
            {uploading ? 'Upload...' : 'Ajouter des photos'}
          </label>
          <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--text-light)' }}>
            {photos.length}/2 photos
          </span>
        </div>

        {hasContributed && isEditing ? (
          <div className="questions-actions">
            <button
              onClick={handleCancelEdit}
              className="btn btn-outline"
              style={{ flex: 1 }}
              disabled={saving || uploading}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || uploading || finalizing || !contributionText.trim()}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving || uploading || finalizing || !contributionText.trim()}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer le brouillon'}
          </button>
        )}
      </div>
    </div>
  );
};

export default Step2Contribution;
