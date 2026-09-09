import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchCollective,
  addCollectiveParticipants,
  updateCollectiveParticipant,
  deleteCollectiveParticipant,
  remindCollectiveParticipant,
  updateCollectiveSettings,
  fetchCollectiveParticipantContributions
} from '../../../services/compositionApi';
import '../../../styles/luxe-theme.css';
import './BookCollectiveLuxe.css';

// Page de gestion du mode collectif ("Collecte des souvenirs", cahier des
// charges §9-10) — 3 vues (Invités/Contributions/Paramètres), une seule
// page, un seul chargement (GET /api/books/:bookId/collective renvoie
// reglages + participants + compteurs en un appel, voir routes/collective.js).
// Activee depuis BookCardLuxe.js (bouton "Activer le mode collectif" ->
// CollectiveActivateModal.js) ou "Gérer le collectif" une fois active.

const STATUS_META = {
  invited: { icon: '○', label: "N'a pas ouvert" },
  opened: { icon: '🟡', label: "A ouvert l'invitation" },
  started: { icon: '🟠', label: 'Contribution commencée' },
  completed: { icon: '✅', label: 'A contribué' }
};

const formatDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const daysRemaining = (deadline) => {
  if (!deadline) return null;
  return Math.ceil((new Date(`${deadline}T23:59:59`) - new Date()) / (1000 * 60 * 60 * 24));
};

// ============================================================
// Bandeau du haut (cahier des charges §9)
// ============================================================
function CollectiveHeader({ bookTitle, settings, participants }) {
  const total = participants.length;
  const completed = participants.filter((p) => p.status === 'completed').length;
  const openedOrStarted = participants.filter((p) => p.status === 'opened' || p.status === 'started').length;
  const notOpened = participants.filter((p) => p.status === 'invited').length;
  const remaining = daysRemaining(settings.deadline);
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="collective-header">
      <p className="collective-header-eyebrow">Collecte des souvenirs</p>
      <h1 className="collective-header-title">{settings.eventTitle || bookTitle}</h1>
      <p className="collective-header-count">{completed} / {total} participant{total > 1 ? 's' : ''}</p>
      <div className="collective-progress-bar">
        <div className="collective-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="collective-header-stats">
        <span>✅ {completed} ont contribué</span>
        <span>🟡 {openedOrStarted} ont ouvert</span>
        <span>○ {notOpened} n'ont pas ouvert</span>
      </div>
      {settings.deadline && (
        <p className="collective-header-deadline">
          📅 Date limite : {formatDate(settings.deadline)}
          {settings.isClosed ? ' · Collecte terminée' : ` · ⏳ ${remaining} jour${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}`}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Onglet Invités
// ============================================================
function InviteForm({ bookId, onAdded }) {
  const [emailsText, setEmailsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    const emails = emailsText.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setSaving(true);
    setError('');
    try {
      await addCollectiveParticipants(bookId, emails);
      setEmailsText('');
      onAdded();
    } catch (err) {
      setError(err.message || "Impossible d'ajouter ces invités.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="collective-invite-form" onSubmit={handleSubmit}>
      <label className="modal-form-field">
        <span>+ Inviter des personnes</span>
        <textarea
          className="input-luxe"
          rows={2}
          value={emailsText}
          onChange={(event) => setEmailsText(event.target.value)}
          placeholder="marie@email.com, thomas@email.com..."
        />
      </label>
      {error && <p className="wizard-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving || !emailsText.trim()}>
        {saving ? 'Envoi...' : 'Ajouter'}
      </button>
    </form>
  );
}

function ParticipantRow({ bookId, participant, onChanged, onSelect }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [emailDraft, setEmailDraft] = useState(participant.email);
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[participant.status] || STATUS_META.invited;
  const link = `${window.location.origin}/collectif/${participant.invite_token}`;

  const handleCopy = async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      // Presse-papiers indisponible : pas bloquant, meme repli deja etabli
      // pour "Partager le lien" (BookCardLuxe.js).
    }
  };

  const handleRemind = async (event) => {
    event.stopPropagation();
    setBusy(true);
    try {
      await remindCollectiveParticipant(bookId, participant.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (event) => {
    event.stopPropagation();
    setBusy(true);
    try {
      await deleteCollectiveParticipant(bookId, participant.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEmail = async (event) => {
    event.stopPropagation();
    if (!emailDraft.trim()) return;
    setBusy(true);
    try {
      await updateCollectiveParticipant(bookId, participant.id, { email: emailDraft.trim() });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="collective-participant-row">
      <button type="button" className="collective-participant-main" onClick={() => onSelect(participant)}>
        <span className="collective-participant-status" title={meta.label} aria-hidden="true">{meta.icon}</span>
        <span className="collective-participant-identity">
          <span className="collective-participant-name">{participant.name || participant.email}</span>
          {editing ? (
            <input
              className="input-luxe"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            participant.name && <span className="collective-participant-email">{participant.email}</span>
          )}
          <span className="collective-participant-counts">
            {meta.label} · {participant.counts.photos} photo{participant.counts.photos > 1 ? 's' : ''} · {participant.counts.souvenirs} souvenir{participant.counts.souvenirs > 1 ? 's' : ''}
          </span>
        </span>
      </button>
      <div className="collective-participant-actions">
        <button type="button" className="btn btn-outline" onClick={handleCopy}>
          {copied ? 'Copié !' : 'Copier le lien'}
        </button>
        {participant.status !== 'completed' && (
          <button type="button" className="btn btn-outline" onClick={handleRemind} disabled={busy}>
            Relancer
          </button>
        )}
        {editing ? (
          <button type="button" className="collective-icon-btn" onClick={handleSaveEmail} disabled={busy} aria-label="Enregistrer l'email">✓</button>
        ) : (
          <button
            type="button"
            className="collective-icon-btn"
            onClick={(event) => { event.stopPropagation(); setEditing(true); }}
            aria-label="Modifier l'email"
          >
            ✎
          </button>
        )}
        <button type="button" className="collective-icon-btn is-danger" onClick={handleDelete} disabled={busy} aria-label="Supprimer cet invité">
          🗑
        </button>
      </div>
    </div>
  );
}

function InvitesTab({ bookId, participants, onChanged, onSelectParticipant }) {
  return (
    <div className="collective-tab-panel">
      <InviteForm bookId={bookId} onAdded={onChanged} />
      {participants.length === 0 ? (
        <p className="collective-empty">Aucun invité pour l'instant — ajoutez des emails ci-dessus.</p>
      ) : (
        <div className="collective-participant-list">
          {participants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              bookId={bookId}
              participant={participant}
              onChanged={onChanged}
              onSelect={onSelectParticipant}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Onglet Contributions
// ============================================================
function ContributionsTab({ bookId, participants, selectedId, onSelect }) {
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const contributed = participants.filter((p) => p.counts.photos + p.counts.souvenirs > 0);

  const toggle = useCallback(async (participant) => {
    if (selectedId === participant.id) {
      onSelect(null);
      return;
    }
    onSelect(participant.id);
    setLoadingItems(true);
    try {
      const data = await fetchCollectiveParticipantContributions(bookId, participant.id);
      setItems(data);
    } finally {
      setLoadingItems(false);
    }
  }, [bookId, selectedId, onSelect]);

  if (contributed.length === 0) {
    return <p className="collective-empty">Aucune contribution reçue pour l'instant.</p>;
  }

  return (
    <div className="collective-tab-panel">
      <div className="collective-contributions-list">
        {contributed.map((participant) => (
          <div key={participant.id} className="collective-contribution-block">
            <button type="button" className="collective-contribution-header" onClick={() => toggle(participant)}>
              <span>{participant.name || participant.email}</span>
              <span>{participant.counts.photos} photo{participant.counts.photos > 1 ? 's' : ''} · {participant.counts.souvenirs} souvenir{participant.counts.souvenirs > 1 ? 's' : ''}</span>
            </button>
            {selectedId === participant.id && (
              <div className="collective-contribution-detail">
                {loadingItems ? (
                  <p className="collective-empty">Chargement...</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="collective-contribution-item">
                      {item.kind === 'photo' ? (
                        <img src={item.metadata?.thumbnailUrl || item.url} alt="" />
                      ) : (
                        <p className="collective-contribution-text">"{item.text}"</p>
                      )}
                      <span className="collective-contribution-date">Envoyé le {formatDate(item.created_at)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Onglet Paramètres
// ============================================================
function SettingsTab({ bookId, settings, onSaved }) {
  const [eventTitle, setEventTitle] = useState(settings.eventTitle || '');
  const [message, setMessage] = useState(settings.message || '');
  const [deadline, setDeadline] = useState(settings.deadline || '');
  const [remindersEnabled, setRemindersEnabled] = useState(Boolean(settings.remindersEnabled));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
      await updateCollectiveSettings(bookId, {
        eventTitle: eventTitle.trim(),
        message: message.trim(),
        deadline,
        remindersEnabled,
        reminderDaysBefore: settings.reminderDaysBefore || [7, 2]
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      setError(err.message || 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="collective-tab-panel collective-settings-form" onSubmit={handleSubmit}>
      <label className="modal-form-field">
        <span>Titre de l'événement</span>
        <input type="text" className="input-luxe" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} maxLength={120} />
      </label>
      <label className="modal-form-field">
        <span>Message aux invités</span>
        <textarea className="input-luxe" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} />
      </label>
      <label className="modal-form-field">
        <span>📅 Date limite de participation <em>(obligatoire)</em></span>
        <input type="date" className="input-luxe" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
      </label>
      <label className="modal-checkbox-field">
        <input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} />
        <span>Activer les relances automatiques (7 puis 2 jours avant la date limite)</span>
      </label>
      {error && <p className="wizard-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Enregistrement...' : saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>
      {/* Transparence deliberee (cahier des charges §8 : jamais d'envoi
          automatique silencieux) — aucun scheduler n'existe encore dans ce
          backend pour declencher les relances toutes seules. */}
      <p className="collective-settings-note">
        Les relances automatiques ne sont pas encore envoyées toutes seules — utilisez "Relancer" depuis l'onglet Invités en attendant.
      </p>
    </form>
  );
}

// ============================================================
// Page
// ============================================================
export default function BookCollectiveLuxe() {
  const { bookId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [settings, setSettings] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [tab, setTab] = useState('invites'); // 'invites' | 'contributions' | 'parametres'
  const [selectedContributionId, setSelectedContributionId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchCollective(bookId);
      setBookTitle(data.bookTitle);
      setSettings(data.settings);
      setParticipants(data.participants);
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="collective-loading">Chargement...</div>;
  }
  if (error || !settings) {
    return <div className="collective-loading">{error || 'Collectif introuvable.'}</div>;
  }

  return (
    <div className="collective-page">
      <Link to={`/book/${bookId}/atelier`} className="collective-back-link">← Retour au livre</Link>

      <CollectiveHeader bookTitle={bookTitle} settings={settings} participants={participants} />

      <div className="collective-tabs">
        <button type="button" className={tab === 'invites' ? 'is-active' : ''} onClick={() => setTab('invites')}>
          Invités
        </button>
        <button type="button" className={tab === 'contributions' ? 'is-active' : ''} onClick={() => setTab('contributions')}>
          Contributions
        </button>
        <button type="button" className={tab === 'parametres' ? 'is-active' : ''} onClick={() => setTab('parametres')}>
          Paramètres
        </button>
      </div>

      {tab === 'invites' && (
        <InvitesTab
          bookId={bookId}
          participants={participants}
          onChanged={load}
          onSelectParticipant={(participant) => { setTab('contributions'); setSelectedContributionId(participant.id); }}
        />
      )}
      {tab === 'contributions' && (
        <ContributionsTab
          bookId={bookId}
          participants={participants}
          selectedId={selectedContributionId}
          onSelect={setSelectedContributionId}
        />
      )}
      {tab === 'parametres' && (
        <SettingsTab bookId={bookId} settings={settings} onSaved={load} />
      )}
    </div>
  );
}
