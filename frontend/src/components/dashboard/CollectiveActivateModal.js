import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { activateCollective } from '../../services/compositionApi';

// Activation du mode collectif (cahier des charges §2) — titre de
// l'evenement + message aux invites (optionnels) et date limite de
// participation (OBLIGATOIRE, verifiee cote client ET serveur). Les
// relances restent desactivees par defaut (§8 : jamais d'envoi automatique
// sans reglage explicite du createur) — le detail des paliers (7/2 jours)
// est gere par le backend (valeur par defaut), pas encore ajustable ici,
// voir l'onglet Parametres de BookCollectiveLuxe.js pour la suite.
function CollectiveActivateModal({ book, onClose, onActivated }) {
  const { t } = useTranslation('dashboard');
  const [eventTitle, setEventTitle] = useState('');
  const [message, setMessage] = useState(() => t('collectiveModal.defaultMessage'));
  const [deadline, setDeadline] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!deadline) {
      setError(t('collectiveModal.deadlineRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await activateCollective(book.id, {
        eventTitle: eventTitle.trim(),
        message: message.trim(),
        deadline,
        remindersEnabled,
        reminderDaysBefore: [7, 2]
      });
      onActivated(updated);
    } catch (err) {
      setError(err.message || t('collectiveModal.activateFailed'));
      setSaving(false);
    }
  };

  return (
    // Reutilise le chrome de modale deja etabli (.modal-overlay/.modal-card/
    // .modal-title/.modal-actions/.modal-btn — voir DashboardLuxe.css, deja
    // utilise par les confirmations archiver/supprimer) plutot que d'en
    // inventer un nouveau pour ce seul formulaire.
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">👥 {t('collectiveModal.title')}</h2>

        <form onSubmit={handleSubmit}>
          <label className="modal-form-field">
            <span>{t('collectiveModal.eventTitleLabel')}</span>
            <input
              type="text"
              className="input-luxe"
              value={eventTitle}
              onChange={(event) => setEventTitle(event.target.value)}
              placeholder={t('collectiveModal.eventTitlePlaceholder')}
              maxLength={120}
            />
          </label>

          <label className="modal-form-field">
            <span>{t('collectiveModal.messageLabel')}</span>
            <textarea
              className="input-luxe"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
            />
          </label>

          <label className="modal-form-field">
            <span>📅 {t('collectiveModal.deadlineLabel')} <em>{t('collectiveModal.deadlineRequiredHint')}</em></span>
            <input
              type="date"
              className="input-luxe"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              required
            />
          </label>

          <label className="modal-checkbox-field">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(event) => setRemindersEnabled(event.target.checked)}
            />
            <span>{t('collectiveModal.remindersLabel')}</span>
          </label>

          {error && <p className="modal-text" style={{ color: '#b42318' }}>{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>{t('collectiveModal.cancel')}</button>
            <button type="submit" className="modal-btn modal-btn-primary" disabled={saving}>
              {saving ? t('collectiveModal.activating') : t('collectiveModal.activate')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CollectiveActivateModal;
