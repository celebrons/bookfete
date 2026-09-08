import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Loading from '../common/Loading';
import { fetchShareInfo, submitShareText, submitSharePhoto } from '../../services/compositionApi';
import '../../styles/luxe-theme.css';
import './InvitationLuxe.css';

// Page publique du lien de partage collaboratif (/participer/:token, voir
// BookCardLuxe.js "Partager le lien") — AUCUN compte requis, meme principe
// que TokenContributePageLuxe.js (deja public), mais cible le nouveau
// modele de contenu (book_content_items, backend/routes/composition.js:
// GET/POST /api/public/share/:token) au lieu de l'ancien systeme
// d'invitation par chapitre : ce qui est ajoute ici apparait directement
// dans "Mes souvenirs" de l'atelier du proprietaire, sans intermediaire.
//
// Pas de brouillon/finalisation comme l'ancien flux (le concept n'existe
// pas pour book_content_items, ce sont deja des elements definitifs) :
// chaque photo/texte est envoye immediatement, confirme dans une petite
// liste "deja envoye", plusieurs envois possibles avant de terminer.

function generateContributionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `contrib-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const BookShareJoinLuxe = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [contributionId] = useState(generateContributionId);

  const [contributorName, setContributorName] = useState('');
  const [message, setMessage] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [sentItems, setSentItems] = useState([]); // [{kind, label}]
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Lien invalide.');
      setLoading(false);
      return;
    }
    fetchShareInfo(token)
      .then((info) => setBookTitle(info.title || 'ce livre'))
      .catch((err) => setError(err.message || 'Lien invalide ou expire.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAddText = async () => {
    const text = message.trim();
    if (!text) return;
    setSendingText(true);
    try {
      await submitShareText(token, { text, contributorName: contributorName.trim(), contributionId });
      setSentItems((previous) => [...previous, { kind: 'texte', label: text.slice(0, 60) }]);
      setMessage('');
    } catch (err) {
      setError(err.message || "L'envoi a echoue.");
    } finally {
      setSendingText(false);
    }
  };

  const handleAddPhotos = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setUploadingPhotos(true);
    setError('');
    try {
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        await submitSharePhoto(token, file, { contributorName: contributorName.trim(), contributionId });
        setSentItems((previous) => [...previous, { kind: 'photo', label: file.name }]);
      }
    } catch (err) {
      setError(err.message || "L'envoi a echoue.");
    } finally {
      setUploadingPhotos(false);
      event.target.value = '';
    }
  };

  if (loading) {
    return <Loading message="Chargement..." />;
  }

  if (error && !bookTitle) {
    return (
      <div className="invitation-container">
        <div className="invitation-card" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--ink)', marginBottom: 'var(--space-md)' }}>Lien invalide</h2>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="invitation-container">
        <div className="invitation-card" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--gold)', marginBottom: 'var(--space-md)' }}>Merci !</h2>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>
            Vos souvenirs ont bien ete ajoutes a "{bookTitle}".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="invitation-container">
      <div className="invitation-card">
        <h2 style={{ color: 'var(--ink)', marginBottom: 'var(--space-sm)' }}>Contribuez à "{bookTitle}"</h2>
        <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-lg)' }}>
          Ajoutez une photo, un souvenir, ou les deux — pas besoin de compte. Vous pouvez ajouter plusieurs
          souvenirs avant de terminer.
        </p>

        {error && <div className="wizard-error">{error}</div>}

        <div className="form-group">
          <label htmlFor="contributor-name">Votre prénom (facultatif)</label>
          <input
            id="contributor-name"
            type="text"
            value={contributorName}
            onChange={(event) => setContributorName(event.target.value)}
            placeholder="Facultatif"
          />
        </div>

        <div className="form-group">
          <label htmlFor="contributor-message">Un souvenir à raconter</label>
          <textarea
            id="contributor-message"
            className="input-luxe"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Écrivez votre souvenir ici..."
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleAddText}
            disabled={sendingText || !message.trim()}
            style={{ marginTop: 8 }}
          >
            {sendingText ? 'Envoi...' : 'Ajouter ce souvenir'}
          </button>
        </div>

        <div className="form-group">
          <label htmlFor="contributor-photos">Une ou plusieurs photos</label>
          <input
            id="contributor-photos"
            type="file"
            accept="image/*"
            multiple
            onChange={handleAddPhotos}
            disabled={uploadingPhotos}
          />
          {uploadingPhotos && <p className="body-text" style={{ color: 'var(--text-light)' }}>Envoi en cours...</p>}
        </div>

        {sentItems.length > 0 && (
          <div className="form-group">
            <label>Déjà envoyé</label>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-light)', fontSize: 13 }}>
              {sentItems.map((item, index) => (
                <li key={index}>{item.kind === 'photo' ? '📷 ' : '✎ '}{item.label}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setDone(true)}
          disabled={sentItems.length === 0}
        >
          J'ai terminé
        </button>
      </div>
    </div>
  );
};

export default BookShareJoinLuxe;
