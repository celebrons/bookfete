import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Loading from '../common/Loading';
import {
  fetchCollectiveInvite,
  submitCollectiveText,
  submitCollectivePhoto,
  finishCollectiveContribution
} from '../../services/compositionApi';
import '../../styles/luxe-theme.css';
import './InvitationLuxe.css';

// Page publique d'un lien de participation INDIVIDUEL du mode collectif
// (/collectif/:token, voir CollectiveActivateModal.js/BookCollectiveLuxe.js)
// — calquee sur BookShareJoinLuxe.js (meme esprit : aucun compte requis,
// chaque photo/texte envoye immediatement, pas de brouillon a finaliser),
// avec deux differences cle :
//  1. L'identite du participant est deja connue (resolue par SON token
//     cote serveur, voir routes/collective.js) — jamais redemandee ici,
//     contrairement au lien de partage anonyme (prenom libre facultatif).
//  2. Contexte complet de l'evenement affiche (titre/message/date limite),
//     et blocage explicite si la date limite est depassee (cahier des
//     charges §2).
//
// Confidentialite (cahier des charges §5) : cette page n'a et n'aura jamais
// acces aux contributions des AUTRES participants — aucune route publique
// ne les expose, "Deja envoye" ci-dessous ne liste que les envois de CETTE
// session.
const CollectiveParticipateLuxe = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState(null);

  const [message, setMessage] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [sentItems, setSentItems] = useState([]); // [{kind, label}]
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Lien invalide.');
      setLoading(false);
      return;
    }
    fetchCollectiveInvite(token)
      .then((info) => {
        setInvite(info);
        if (info.status === 'completed') setDone(true);
      })
      .catch((err) => setError(err.message || 'Lien invalide ou expire.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAddText = async () => {
    const text = message.trim();
    if (!text) return;
    setSendingText(true);
    try {
      await submitCollectiveText(token, text);
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
        await submitCollectivePhoto(token, file);
        setSentItems((previous) => [...previous, { kind: 'photo', label: file.name }]);
      }
    } catch (err) {
      setError(err.message || "L'envoi a echoue.");
    } finally {
      setUploadingPhotos(false);
      event.target.value = '';
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await finishCollectiveContribution(token);
      setDone(true);
    } catch (err) {
      setError(err.message || "Impossible de terminer pour l'instant.");
      setFinishing(false);
    }
  };

  const formatDeadline = (value) => {
    if (!value) return '';
    return new Date(`${value}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (loading) {
    return <Loading message="Chargement..." />;
  }

  if (error && !invite) {
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
          <h2 style={{ color: 'var(--gold)', marginBottom: 'var(--space-md)' }}>Merci ❤️</h2>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>
            Votre souvenir a bien été transmis {invite?.eventTitle ? `pour "${invite.eventTitle}"` : `pour "${invite?.bookTitle}"`}.
          </p>
        </div>
      </div>
    );
  }

  const eventTitle = invite?.eventTitle || invite?.bookTitle;

  return (
    <div className="invitation-container">
      <div className="invitation-card">
        <h2 style={{ color: 'var(--ink)', marginBottom: 'var(--space-sm)' }}>
          {invite?.participantName ? `Bonjour ${invite.participantName} — ` : ''}Participez au livre souvenir{eventTitle ? ` de ${eventTitle}` : ''}
        </h2>
        {invite?.message && (
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-sm)', whiteSpace: 'pre-wrap' }}>
            {invite.message}
          </p>
        )}
        {invite?.deadline && (
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-lg)', fontSize: 13 }}>
            📅 Date limite de participation : {formatDeadline(invite.deadline)}
          </p>
        )}

        {invite?.isClosed ? (
          <div className="wizard-error">La collecte de souvenirs est terminée. Merci de votre intérêt !</div>
        ) : (
          <>
            {error && <div className="wizard-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="collective-message">Un souvenir à raconter</label>
              <textarea
                id="collective-message"
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
              <label htmlFor="collective-photos">Une ou plusieurs photos</label>
              <input
                id="collective-photos"
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
              onClick={handleFinish}
              disabled={sentItems.length === 0 || finishing}
            >
              {finishing ? 'Un instant...' : "Partager mon souvenir"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CollectiveParticipateLuxe;
