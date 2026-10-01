import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

const STATUS_ICONS = {
  invited: '○',
  opened: '🟡',
  started: '🟠',
  completed: '✅'
};

const formatDate = (value, locale) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
};

const daysRemaining = (deadline) => {
  if (!deadline) return null;
  return Math.ceil((new Date(`${deadline}T23:59:59`) - new Date()) / (1000 * 60 * 60 * 24));
};

// ============================================================
// Bandeau du haut (cahier des charges §9)
// ============================================================
function CollectiveHeader({ bookTitle, settings, participants }) {
  const { t, i18n } = useTranslation('collective');
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const total = participants.length;
  const completed = participants.filter((p) => p.status === 'completed').length;
  const openedOrStarted = participants.filter((p) => p.status === 'opened' || p.status === 'started').length;
  const notOpened = participants.filter((p) => p.status === 'invited').length;
  const remaining = daysRemaining(settings.deadline);
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="collective-header">
      <p className="collective-header-eyebrow">{t('manage.eyebrow')}</p>
      <h1 className="collective-header-title">{settings.eventTitle || bookTitle}</h1>
      <p className="collective-header-count">{t('manage.participantsCount', { completed, total })}</p>
      <div className="collective-progress-bar">
        <div className="collective-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="collective-header-stats">
        <span>{t('manage.contributedStat', { count: completed })}</span>
        <span>{t('manage.openedStat', { count: openedOrStarted })}</span>
        <span>{t('manage.notOpenedStat', { count: notOpened })}</span>
      </div>
      {settings.deadline && (
        <p className="collective-header-deadline">
          {t('manage.deadlineLabel', { date: formatDate(settings.deadline, dateLocale) })}
          {settings.isClosed ? t('manage.collectionEnded') : t('manage.daysRemaining', { count: remaining })}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Onglet Invités
// ============================================================
function InviteForm({ bookId, onAdded }) {
  const { t } = useTranslation('collective');
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
      setError(err.message || t('manage.addParticipantsFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="collective-invite-form" onSubmit={handleSubmit}>
      <label className="modal-form-field">
        <span>+ {t('manage.invitePeople')}</span>
        <textarea
          className="input-luxe"
          rows={2}
          value={emailsText}
          onChange={(event) => setEmailsText(event.target.value)}
          placeholder={t('manage.emailsPlaceholder')}
        />
      </label>
      {error && <p className="wizard-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving || !emailsText.trim()}>
        {saving ? t('manage.sending') : t('manage.add')}
      </button>
    </form>
  );
}

function ParticipantRow({ bookId, participant, settings, onChanged, onSelect }) {
  const { t } = useTranslation('collective');
  const [copied, setCopied] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [emailDraft, setEmailDraft] = useState(participant.email);
  const [busy, setBusy] = useState(false);
  const shareWrapRef = useRef(null);
  const statusIcon = STATUS_ICONS[participant.status] || STATUS_ICONS.invited;
  const statusLabel = t(`manage.status.${participant.status || 'invited'}`);
  const link = `${window.location.origin}/collectif/${participant.invite_token}`;
  const texteInvitation = settings?.message
    || t('manage.defaultInviteMessage', {
      eventPart: settings?.eventTitle
        ? t('manage.defaultInviteMessageEventPart', { event: settings.eventTitle })
        : t('manage.defaultInviteMessageNoEventPart')
    });

  // Ferme le menu de partage des qu'on clique ailleurs — meme principe que
  // les autres menus "···" du site (OrdersLuxe.js, BookCardLuxe.js).
  useEffect(() => {
    if (!shareMenuOpen) return undefined;
    const onClickOutside = (event) => {
      if (!shareWrapRef.current?.contains(event.target)) setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [shareMenuOpen]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      // Presse-papiers indisponible : pas bloquant, meme repli deja etabli
      // pour "Partager le lien" (BookCardLuxe.js).
    }
  };

  // PARTAGE, COMME ON VEUT (retour utilisateur, 2026-09-30) : "il copie le
  // lien puis l'envoie par WhatsApp ou par email au lieu d'envoyer
  // directement par mail". Deux chemins concrets plutot qu'un seul pari sur
  // l'API de partage native :
  //  - sur mobile (Android/iOS), navigator.share existe : un tap ouvre la
  //    feuille systeme avec TOUTES les apps installees, la meilleure
  //    experience possible, aucun menu maison necessaire ;
  //  - partout ailleurs (desktop, ou meme un mobile qui refuse l'appel —
  //    l'echec silencieux constate en testant est reel), un petit menu
  //    propose explicitement WhatsApp et Email : les deux canaux nommes
  //    par le retour utilisateur, plus la copie en repli ultime. Jamais
  //    besoin de deviner ce que le navigateur sait faire.
  // L'invitation reste nominative (email de suivi conserve, voir
  // routes/collective.js) — seul le canal d'ENVOI change.
  const handleShareClick = async (event) => {
    event.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({ title: settings?.eventTitle || t('manage.shareDialogTitle'), text: texteInvitation, url: link });
        return;
      } catch (err) {
        // Partage annule par la personne : rien a faire, jamais retomber
        // sur le menu dans ce cas precis (elle a deja choisi de ne pas
        // partager). Toute AUTRE erreur (API presente mais qui refuse
        // silencieusement, constate en testant) ouvre le menu explicite.
        if (err?.name === 'AbortError') return;
      }
    }
    setShareMenuOpen((v) => !v);
  };

  const handleWhatsapp = (event) => {
    event.stopPropagation();
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texteInvitation}\n\n${link}`)}`, '_blank', 'noopener');
    setShareMenuOpen(false);
  };

  const handleEmail = (event) => {
    event.stopPropagation();
    const sujet = settings?.eventTitle ? t('manage.emailInviteSubject', { event: settings.eventTitle }) : t('manage.shareDialogTitle');
    const corps = `${texteInvitation}\n\n${link}`;
    // Destinataire pre-rempli : l'invitation est nominative, on connait
    // deja son email — autant lui epargner la saisie.
    window.location.href = `mailto:${participant.email || ''}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
    setShareMenuOpen(false);
  };

  const handleMenuCopy = (event) => {
    event.stopPropagation();
    copyLink();
    setShareMenuOpen(false);
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
        <span className="collective-participant-status" title={statusLabel} aria-hidden="true">{statusIcon}</span>
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
            {statusLabel} · {t('manage.photosCount', { count: participant.counts.photos })} · {t('manage.memoriesCount', { count: participant.counts.souvenirs })}
          </span>
        </span>
      </button>
      <div className="collective-participant-actions">
        <div className="collective-share-wrap" ref={shareWrapRef}>
          <button type="button" className="btn btn-outline" onClick={handleShareClick}>
            {copied ? t('manage.linkCopied') : t('manage.share')}
          </button>
          {shareMenuOpen && (
            <div className="collective-share-menu" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={handleWhatsapp}>
                <span aria-hidden="true">💬</span> {t('manage.whatsapp')}
              </button>
              <button type="button" onClick={handleEmail}>
                <span aria-hidden="true">✉️</span> {t('manage.email')}
              </button>
              <button type="button" onClick={handleMenuCopy}>
                <span aria-hidden="true">🔗</span> {t('manage.copyLink')}
              </button>
            </div>
          )}
        </div>
        {participant.status !== 'completed' && (
          <button type="button" className="btn btn-outline" onClick={handleRemind} disabled={busy}>
            {t('manage.remind')}
          </button>
        )}
        {editing ? (
          <button type="button" className="collective-icon-btn" onClick={handleSaveEmail} disabled={busy} aria-label={t('manage.saveEmailAria')}>✓</button>
        ) : (
          <button
            type="button"
            className="collective-icon-btn"
            onClick={(event) => { event.stopPropagation(); setEditing(true); }}
            aria-label={t('manage.editEmailAria')}
          >
            ✎
          </button>
        )}
        <button type="button" className="collective-icon-btn is-danger" onClick={handleDelete} disabled={busy} aria-label={t('manage.deleteParticipantAria')}>
          🗑
        </button>
      </div>
    </div>
  );
}

function InvitesTab({ bookId, participants, settings, onChanged, onSelectParticipant }) {
  const { t } = useTranslation('collective');
  return (
    <div className="collective-tab-panel">
      <InviteForm bookId={bookId} onAdded={onChanged} />
      {participants.length === 0 ? (
        <p className="collective-empty">{t('manage.noParticipantsYet')}</p>
      ) : (
        <div className="collective-participant-list">
          {participants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              bookId={bookId}
              participant={participant}
              settings={settings}
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
  const { t, i18n } = useTranslation('collective');
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
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
    return <p className="collective-empty">{t('manage.noContributionsYet')}</p>;
  }

  return (
    <div className="collective-tab-panel">
      <div className="collective-contributions-list">
        {contributed.map((participant) => (
          <div key={participant.id} className="collective-contribution-block">
            <button type="button" className="collective-contribution-header" onClick={() => toggle(participant)}>
              <span>{participant.name || participant.email}</span>
              <span>{t('manage.photosCount', { count: participant.counts.photos })} · {t('manage.memoriesCount', { count: participant.counts.souvenirs })}</span>
            </button>
            {selectedId === participant.id && (
              <div className="collective-contribution-detail">
                {loadingItems ? (
                  <p className="collective-empty">{t('manage.loadingShort')}</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="collective-contribution-item">
                      {item.kind === 'photo' ? (
                        <img src={item.metadata?.thumbnailUrl || item.url} alt="" />
                      ) : (
                        <p className="collective-contribution-text">"{item.text}"</p>
                      )}
                      <span className="collective-contribution-date">{t('manage.sentOn', { date: formatDate(item.created_at, dateLocale) })}</span>
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
  const { t } = useTranslation('collective');
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
      setError(t('manage.deadlineRequired'));
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
      setError(err.message || t('manage.genericError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="collective-tab-panel collective-settings-form" onSubmit={handleSubmit}>
      <label className="modal-form-field">
        <span>{t('manage.eventTitleLabel')}</span>
        <input type="text" className="input-luxe" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} maxLength={120} />
      </label>
      <label className="modal-form-field">
        <span>{t('manage.guestMessageLabel')}</span>
        <textarea className="input-luxe" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} />
      </label>
      <label className="modal-form-field">
        <span>📅 {t('manage.deadlineFieldLabel')} <em>({t('manage.required')})</em></span>
        <input type="date" className="input-luxe" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
      </label>
      <label className="modal-checkbox-field">
        <input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} />
        <span>{t('manage.remindersCheckboxLabel')}</span>
      </label>
      {error && <p className="wizard-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? t('manage.saving') : saved ? t('manage.saved') : t('manage.save')}
      </button>
      {/* Transparence deliberee (cahier des charges §8 : jamais d'envoi
          automatique silencieux) — aucun scheduler n'existe encore dans ce
          backend pour declencher les relances toutes seules. */}
      <p className="collective-settings-note">
        {t('manage.remindersNote')}
      </p>
    </form>
  );
}

// ============================================================
// Page
// ============================================================
export default function BookCollectiveLuxe() {
  const { t } = useTranslation('collective');
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
      setError(err.message || t('manage.loadError'));
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="collective-loading">{t('manage.loadingShort')}</div>;
  }
  if (error || !settings) {
    return <div className="collective-loading">{error || t('manage.notFound')}</div>;
  }

  return (
    <div className="collective-page">
      <Link to={`/book/${bookId}/atelier`} className="collective-back-link">← {t('manage.backToBook')}</Link>

      <CollectiveHeader bookTitle={bookTitle} settings={settings} participants={participants} />

      <div className="collective-tabs">
        <button type="button" className={tab === 'invites' ? 'is-active' : ''} onClick={() => setTab('invites')}>
          {t('manage.tabGuests')}
        </button>
        <button type="button" className={tab === 'contributions' ? 'is-active' : ''} onClick={() => setTab('contributions')}>
          {t('manage.tabContributions')}
        </button>
        <button type="button" className={tab === 'parametres' ? 'is-active' : ''} onClick={() => setTab('parametres')}>
          {t('manage.tabSettings')}
        </button>
      </div>

      {tab === 'invites' && (
        <InvitesTab
          bookId={bookId}
          participants={participants}
          settings={settings}
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
