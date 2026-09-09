import React, { useState } from 'react';
import { activateCollective } from '../../services/compositionApi';

const DEFAULT_MESSAGE = 'Nous préparons un livre souvenir. Partagez un souvenir, quelques mots et/ou vos photos.';

// Activation du mode collectif (cahier des charges §2) — titre de
// l'evenement + message aux invites (optionnels) et date limite de
// participation (OBLIGATOIRE, verifiee cote client ET serveur). Les
// relances restent desactivees par defaut (§8 : jamais d'envoi automatique
// sans reglage explicite du createur) — le detail des paliers (7/2 jours)
// est gere par le backend (valeur par defaut), pas encore ajustable ici,
// voir l'onglet Parametres de BookCollectiveLuxe.js pour la suite.
function CollectiveActivateModal({ book, onClose, onActivated }) {
  const [eventTitle, setEventTitle] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [deadline, setDeadline] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!deadline) {
      setError('La date limite de participation est obligatoire.');
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
      setError(err.message || "Impossible d'activer le mode collectif.");
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
        <h2 className="modal-title">👥 Activer le mode collectif</h2>

        <form onSubmit={handleSubmit}>
          <label className="modal-form-field">
            <span>Titre de l'événement</span>
            <input
              type="text"
              className="input-luxe"
              value={eventTitle}
              onChange={(event) => setEventTitle(event.target.value)}
              placeholder="Ex : Anniversaire de Sophie"
              maxLength={120}
            />
          </label>

          <label className="modal-form-field">
            <span>Message aux invités</span>
            <textarea
              className="input-luxe"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
            />
          </label>

          <label className="modal-form-field">
            <span>📅 Date limite de participation <em>(obligatoire)</em></span>
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
            <span>Activer les relances automatiques (7 puis 2 jours avant la date limite)</span>
          </label>

          {error && <p className="modal-text" style={{ color: '#b42318' }}>{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>Annuler</button>
            <button type="submit" className="modal-btn modal-btn-primary" disabled={saving}>
              {saving ? 'Activation...' : 'Activer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CollectiveActivateModal;
