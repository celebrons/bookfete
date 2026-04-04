import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import '../BookLuxe.css';

const Step2Contribution = ({
  chapter,
  onSaveContribution,
  onFinalizeContribution,
  user,
  embedded = false,
  editorialMode = false
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
  const hasContributed = Boolean(chapter?.hasContributed || existingContribution);
  const isFinalized = Boolean(chapter?.isFinalized || existingContribution?.is_finalized);
  const collectionClosed = Boolean(chapter?.contributionsClosed);
  const chapterLocked = Boolean(chapter?.isChapterClosed);
  const contributionLocked = chapterLocked || collectionClosed;

  const wrapContent = (node) => (
    embedded ? node : <div className="workflow-content">{node}</div>
  );

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
    if (!contributionLocked) {
      return;
    }

    setIsEditing(false);
  }, [contributionLocked]);

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
    if (contributionLocked) {
      setError('Ce chapitre est verrouille pour la finalisation.');
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
    if (contributionLocked) {
      return;
    }

    setPhotos((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
    setPhotoPreviews((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSave = async () => {
    if (contributionLocked) {
      setError('Ce chapitre est verrouille pour la finalisation.');
      return;
    }

    if (!contributionText.trim()) {
      setError('Veuillez ecrire un texte.');
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
      setNotice('Texte prive enregistre.');
    } catch (saveError) {
      console.error('Erreur sauvegarde:', saveError);
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (contributionLocked) {
      setError('Ce chapitre est verrouille pour la finalisation.');
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
      setNotice('Texte prive valide.');
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

  const renderPhotos = () => {
    if (photos.length === 0) {
      return null;
    }

    return (
      <div className="chapter-private-photo-strip">
        {photos.map((photo, index) => (
          <div key={photo.url || index} className="chapter-private-photo-item">
            <img
              src={photoPreviews[index] || photo.preview || photo.url}
              alt=""
              className="chapter-private-photo-thumb"
            />
            {!contributionLocked ? (
              <button
                type="button"
                className="chapter-private-photo-remove"
                onClick={() => removePhoto(index)}
                aria-label="Retirer cette photo"
              >
                x
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const renderPrivacyHeader = () => (
    <div className={`chapter-private-pill ${editorialMode ? 'is-editorial' : ''}`}>
      <span className="chapter-private-pill-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M8 10V8.8A4 4 0 0 1 12 5a4 4 0 0 1 4 3.8V10h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h1Zm2 0h4V8.9a2 2 0 0 0-4 0V10Z" fill="currentColor" />
        </svg>
      </span>
      <span>Votre contribution restera privee</span>
    </div>
  );

  const renderReadonlyText = () => (
    <div className={`chapter-private-reading ${editorialMode ? 'is-editorial' : ''}`}>
      <p>{contributionText}</p>
      {renderPhotos()}
    </div>
  );

  if (contributionLocked) {
    return wrapContent(
      <div className={`contribution-section ${editorialMode ? 'is-editorial' : ''}`}>
        {renderPrivacyHeader()}
        {notice ? <div className="luxe-feedback-banner is-success">{notice}</div> : null}
        {error ? <div className="luxe-feedback-banner is-error">{error}</div> : null}
        <div className="luxe-feedback-banner is-info">
          {chapterLocked
            ? 'Le chapitre est verrouille. Votre texte prive ne peut plus etre modifie.'
            : 'La collecte est close. Votre texte prive est maintenant fige pour la finalisation.'}
        </div>
        {contributionText.trim() || photos.length > 0 ? (
          renderReadonlyText()
        ) : (
          <div className="chapter-private-empty">
            Aucun texte prive n a encore ete enregistre pour ce chapitre.
          </div>
        )}
      </div>
    );
  }

  if (isFinalized && !isEditing) {
    return wrapContent(
      <div className={`contribution-section ${editorialMode ? 'is-editorial' : ''}`}>
        {renderPrivacyHeader()}
        {notice ? <div className="luxe-feedback-banner is-success">{notice}</div> : null}
        {error ? <div className="luxe-feedback-banner is-error">{error}</div> : null}
        {renderReadonlyText()}
      </div>
    );
  }

  if (hasContributed && !isEditing) {
    return wrapContent(
      <div className={`contribution-section ${editorialMode ? 'is-editorial' : ''}`}>
        {renderPrivacyHeader()}
        {notice ? <div className="luxe-feedback-banner is-success">{notice}</div> : null}
        {error ? <div className="luxe-feedback-banner is-error">{error}</div> : null}
        {renderReadonlyText()}
          <div className="chapter-private-footer">
            <div className={`questions-actions ${editorialMode ? 'is-editorial is-two' : ''}`}>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="btn btn-outline"
              style={{ flex: 1 }}
              disabled={finalizing}
            >
              Reprendre le texte
            </button>
              <button
                type="button"
                onClick={handleFinalize}
                className="btn btn-primary"
                data-workflow-action="finalize-contribution"
                style={{ flex: 1 }}
                disabled={finalizing}
              >
              {finalizing ? 'Validation...' : 'Valider mon texte'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return wrapContent(
    <div className={`contribution-section ${editorialMode ? 'is-editorial' : ''}`}>
      {renderPrivacyHeader()}
      {notice ? <div className="luxe-feedback-banner is-success">{notice}</div> : null}
      {error ? <div className="luxe-feedback-banner is-error">{error}</div> : null}

      <textarea
        value={contributionText}
        onChange={(event) => setContributionText(event.target.value)}
        placeholder="Ecrivez ici votre texte prive. Il restera visible uniquement pour vous jusqu a la finalisation."
        rows="10"
        className={`contribution-textarea ${editorialMode ? 'is-editorial' : ''}`}
      />

      {renderPhotos()}

      <div className="chapter-private-tools">
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
          className="btn btn-outline chapter-private-photo-action"
          style={{
            opacity: (uploading || photos.length >= 2) ? 0.5 : 1,
            cursor: (uploading || photos.length >= 2) ? 'not-allowed' : 'pointer'
          }}
        >
          {uploading ? 'Upload...' : 'Ajouter une photo'}
        </label>
        <span className="chapter-private-tools-note">{photos.length}/2 photos</span>
      </div>

        <div className="chapter-private-footer">
          {hasContributed && isEditing ? (
            <div className={`questions-actions ${editorialMode ? 'is-editorial is-two' : ''}`}>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="btn btn-outline"
              style={{ flex: 1 }}
              disabled={saving || uploading}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || uploading || finalizing || !contributionText.trim()}
              className="btn btn-primary"
              data-workflow-action="save-contribution"
              style={{ flex: 1 }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les ajustements'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading || finalizing || !contributionText.trim()}
            className="btn btn-outline chapter-private-save"
            data-workflow-action="save-contribution"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer mon texte'}
          </button>
        )}
      </div>
    </div>
  );
};

export default Step2Contribution;
