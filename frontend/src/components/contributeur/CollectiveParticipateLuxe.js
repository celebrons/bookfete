import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation('collective');
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
      setError(t('participate.invalidLink'));
      setLoading(false);
      return;
    }
    fetchCollectiveInvite(token)
      .then((info) => {
        setInvite(info);
        if (info.status === 'completed') setDone(true);
      })
      .catch((err) => setError(err.message || t('participate.invalidOrExpiredLink')))
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
      setError(err.message || t('participate.sendFailed'));
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
        // Apercu IMMEDIAT (retour utilisateur, 2026-09-28 : "permettre un
        // apercu de ce qu'il a charge") : un blob local, pas besoin d'
        // attendre la reponse serveur — c'est la photo que la personne vient
        // elle-meme de choisir, l'aperçu doit apparaitre tout de suite.
        const previewUrl = URL.createObjectURL(file);
        // eslint-disable-next-line no-await-in-loop
        await submitCollectivePhoto(token, file);
        setSentItems((previous) => [...previous, { kind: 'photo', label: file.name, previewUrl }]);
      }
    } catch (err) {
      setError(err.message || t('participate.sendFailed'));
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
      setError(err.message || t('participate.finishFailed'));
      setFinishing(false);
    }
  };

  const formatDeadline = (value) => {
    if (!value) return '';
    return new Date(`${value}T00:00:00`).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (loading) {
    return <Loading message={t('participate.loading')} />;
  }

  if (error && !invite) {
    return (
      <div className="invitation-container">
        <div className="invitation-card" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--ink)', marginBottom: 'var(--space-md)' }}>{t('participate.invalidLinkTitle')}</h2>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="invitation-container">
        <div className="invitation-card" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--gold)', marginBottom: 'var(--space-md)' }}>{t('participate.thanksTitle')}</h2>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>
            {t('participate.thanksBodyFor', { title: invite?.eventTitle || invite?.bookTitle })}
          </p>
        </div>
      </div>
    );
  }

  const eventTitle = invite?.eventTitle || invite?.bookTitle;
  const sentPhotos = sentItems.filter((item) => item.kind === 'photo');
  const sentTexts = sentItems.filter((item) => item.kind === 'texte');

  return (
    <div className="invitation-container">
      <div className="invitation-card">
        <h2 style={{ color: 'var(--ink)', marginBottom: 'var(--space-sm)' }}>
          {invite?.participantName ? t('participate.greetingWithName', { name: invite.participantName }) : ''}
          {t('participate.participateIn')}{eventTitle ? t('participate.participateInEventSuffix', { event: eventTitle }) : ''}
        </h2>
        {invite?.message && (
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-sm)', whiteSpace: 'pre-wrap' }}>
            {invite.message}
          </p>
        )}
        {invite?.deadline && (
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-lg)', fontSize: 13 }}>
            {t('participate.deadlineLabel', { date: formatDeadline(invite.deadline) })}
          </p>
        )}

        {invite?.isClosed ? (
          <div className="wizard-error">{t('participate.collectionClosed')}</div>
        ) : (
          <>
            {error && <div className="wizard-error">{error}</div>}

            {/* Photos EN PREMIER (retour utilisateur, 2026-09-28) : c'est le
                souvenir le plus simple a donner en arrivant sur ce lien,
                avant de demander un texte. */}
            <div className="form-group">
              <label htmlFor="collective-photos">{t('participate.photosLabel')}</label>
              <input
                id="collective-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={handleAddPhotos}
                disabled={uploadingPhotos}
              />
              {uploadingPhotos && <p className="body-text" style={{ color: 'var(--text-light)' }}>{t('participate.uploading')}</p>}

              {sentPhotos.length > 0 && (
                <ul className="collective-photo-grid">
                  {sentPhotos.map((item, index) => (
                    <li key={index} className="collective-photo-thumb">
                      <img src={item.previewUrl} alt={item.label} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="collective-message">{t('participate.memoryLabel')}</label>
              <textarea
                id="collective-message"
                className="input-luxe"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t('participate.memoryPlaceholder')}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleAddText}
                disabled={sendingText || !message.trim()}
                style={{ marginTop: 8 }}
              >
                {sendingText ? t('participate.sending') : t('participate.addMemory')}
              </button>

              {sentTexts.length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--text-light)', fontSize: 13 }}>
                  {sentTexts.map((item, index) => (
                    <li key={index}>✎ {item.label}</li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleFinish}
              disabled={sentItems.length === 0 || finishing}
            >
              {finishing ? t('participate.oneMoment') : t('participate.shareMyMemory')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CollectiveParticipateLuxe;
