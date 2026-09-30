import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Loading from '../common/Loading';
import { fetchShareInfo, submitShareText, submitSharePhoto, deleteShareItem } from '../../services/compositionApi';
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
  const [contributorEmail, setContributorEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [sentItems, setSentItems] = useState([]); // [{id, kind, label, previewUrl?}]
  const [removingId, setRemovingId] = useState('');
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
      await submitShareText(token, {
        text, contributorName: contributorName.trim(), contributorEmail: contributorEmail.trim(), contributionId
      });
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
        // Apercu IMMEDIAT (meme principe que CollectiveParticipateLuxe.js,
        // retour utilisateur 2026-09-28 puis 2026-09-30 pour cet ecran-ci) :
        // un blob local, affiche des la selection, sans attendre le
        // televersement.
        const previewUrl = URL.createObjectURL(file);
        // eslint-disable-next-line no-await-in-loop
        const created = await submitSharePhoto(token, file, {
          contributorName: contributorName.trim(), contributorEmail: contributorEmail.trim(), contributionId
        });
        setSentItems((previous) => [...previous, { id: created?.id, kind: 'photo', label: file.name, previewUrl }]);
      }
    } catch (err) {
      setError(err.message || "L'envoi a echoue.");
    } finally {
      setUploadingPhotos(false);
      event.target.value = '';
    }
  };

  // Retirer une photo envoyee par erreur (retour utilisateur, 2026-09-30,
  // avec capture d'ecran) — supprime reellement cote serveur (jamais
  // seulement de cet ecran), voir deleteShareItem : sans ca, la photo
  // resterait visible dans "Mes souvenirs" chez le proprietaire du livre
  // alors que le contributeur la croirait retiree.
  const handleRemovePhoto = async (item) => {
    if (!item?.id || removingId) return;
    setRemovingId(item.id);
    setError('');
    try {
      await deleteShareItem(token, item.id, contributionId);
      setSentItems((previous) => previous.filter((entry) => entry.id !== item.id));
    } catch (err) {
      setError(err.message || 'Impossible de retirer cette photo.');
    } finally {
      setRemovingId('');
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

        {/* Ordre du formulaire (retour utilisateur, 2026-09-30) : identite
            d'abord (facultative), puis les photos — le souvenir le plus
            simple a donner en arrivant sur ce lien — puis le mot ecrit,
            qui demande plus d'effort. Meme ordre que CollectiveParticipateLuxe.js. */}
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
          <label htmlFor="contributor-email">Votre email (facultatif)</label>
          <input
            id="contributor-email"
            type="email"
            value={contributorEmail}
            onChange={(event) => setContributorEmail(event.target.value)}
            placeholder="Facultatif"
          />
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

          {/* Miniatures des photos deja envoyees (retour utilisateur,
              2026-09-30 : "il faut ajouter une miniature ou un apercu") —
              meme grille que CollectiveParticipateLuxe.js. */}
          {sentItems.some((item) => item.kind === 'photo') && (
            <ul className="collective-photo-grid">
              {sentItems.filter((item) => item.kind === 'photo').map((item, index) => (
                <li key={index} className="collective-photo-thumb">
                  <img src={item.previewUrl} alt={item.label} />
                  <button
                    type="button"
                    className="collective-photo-remove"
                    onClick={() => handleRemovePhoto(item)}
                    disabled={!item.id || removingId === item.id}
                    aria-label={`Retirer ${item.label}`}
                    title="Retirer cette photo"
                  >
                    {removingId === item.id ? '…' : '✕'}
                  </button>
                </li>
              ))}
            </ul>
          )}
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

          {sentItems.some((item) => item.kind === 'texte') && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--text-light)', fontSize: 13 }}>
              {sentItems.filter((item) => item.kind === 'texte').map((item, index) => (
                <li key={index}>✎ {item.label}</li>
              ))}
            </ul>
          )}
        </div>

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
