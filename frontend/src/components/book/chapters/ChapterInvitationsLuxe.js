import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const ChapterInvitationsLuxe = ({
  chapterId,
  bookId,
  isClosed = false,
  refreshToken = 0,
  editorialMode = false
}) => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    responded: 0,
    approved: 0
  });
  const [reminding, setReminding] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [confirmReminderId, setConfirmReminderId] = useState(null);
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  useEffect(() => {
    if (chapterId) {
      loadInvitations();
    }
  }, [chapterId, bookId, refreshToken]);

  useEffect(() => {
    if (!chapterId) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      loadInvitations({ silent: true });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [chapterId]);

  const loadInvitations = async ({ silent = false } = {}) => {
    try {
      if (!hasLoadedOnce && !silent) {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from('chapter_invites')
        .select(`
          *,
          contributor:book_contributors(name, email)
        `)
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      let contributorsById = {};
      let contributorsByEmail = {};

      if (bookId) {
        const { data: contributorsData, error: contributorsError } = await supabase
          .from('book_contributors')
          .select('id, name, email')
          .eq('book_id', bookId);

        if (contributorsError) throw contributorsError;

        contributorsById = (contributorsData || []).reduce((acc, contributor) => {
          acc[contributor.id] = contributor;
          return acc;
        }, {});

        contributorsByEmail = (contributorsData || []).reduce((acc, contributor) => {
          if (contributor.email) {
            acc[contributor.email.toLowerCase()] = contributor;
          }
          return acc;
        }, {});
      }

      const invitationsWithContributions = await Promise.all(
        (data || []).map(async (invite) => {
          const { data: contribution } = await supabase
            .from('contributions')
            .select('approved, created_at, is_finalized, needs_revision')
            .eq('chapter_id', chapterId)
            .eq('contributor_email', invite.email)
            .maybeSingle();

          const isRevisionRequested = Boolean(contribution?.needs_revision);
          const resolvedContributorName =
            invite.contributor?.name ||
            contributorsById[invite.contributor_id]?.name ||
            contributorsByEmail[invite.email?.toLowerCase()]?.name ||
            invite.email?.split('@')[0] ||
            'Invite';
          const hasSubmittedContribution = Boolean(
            contribution &&
            !isRevisionRequested &&
            (
              contribution.is_finalized !== false ||
              invite.accepted ||
              invite.contributed
            )
          );

          return {
            ...invite,
            contributor: {
              ...(invite.contributor || {}),
              name: resolvedContributorName
            },
            contribution: contribution ? [contribution] : null,
            hasSubmittedContribution,
            isRevisionRequested
          };
        })
      );

      setInvitations(invitationsWithContributions || []);
      setHasLoadedOnce(true);

      const total = invitationsWithContributions.length;
      const responded = invitationsWithContributions.filter((invite) => invite.hasSubmittedContribution).length;
      const approved = invitationsWithContributions.filter(
        (invite) => invite.hasSubmittedContribution && invite.contribution && invite.contribution[0]?.approved
      ).length;

      setStats({
        total,
        responded,
        approved,
        pending: total - responded
      });
    } catch (error) {
      console.error('Error loading invitations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInviteLink = (token) => `${window.location.origin}/invite/${token}`;

  const handleCopyInviteLink = async (token) => {
    const link = getInviteLink(token);

    try {
      await navigator.clipboard.writeText(link);
      setFeedback({
        type: 'success',
        message: 'Lien d invitation copie.'
      });
    } catch (copyError) {
      console.error('Erreur copie lien:', copyError);
      setFeedback({
        type: 'error',
        message: 'Impossible de copier le lien.'
      });
    }
  };

  const handleOpenReminder = (inviteId) => {
    setConfirmReminderId(inviteId);
  };

  const confirmReminder = async () => {
    if (!confirmReminderId) {
      return;
    }

    setReminding(confirmReminderId);
    setFeedback(null);

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${apiBaseUrl}/invites/resend/${confirmReminderId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Erreur lors de l envoi du rappel');

      setFeedback({
        type: 'success',
        message: 'Rappel envoye.'
      });
      await loadInvitations();
    } catch (error) {
      console.error('Erreur envoi rappel:', error);
      setFeedback({
        type: 'error',
        message: 'Erreur lors de l envoi du rappel.'
      });
    } finally {
      setReminding(null);
      setConfirmReminderId(null);
    }
  };

  const reminderTarget = invitations.find((invite) => invite.id === confirmReminderId) || null;

  const formatDate = (dateString) => {
    if (!dateString) return 'Date inconnue';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (invite) => {
    if (invite.isRevisionRequested) {
      return {
        text: 'Modification demandee',
        className: 'status-responded'
      };
    }

    if (invite.hasSubmittedContribution) {
      const isApproved = invite.contribution && invite.contribution[0]?.approved;
      return {
        text: isApproved ? 'Approuvee' : 'En attente de validation',
        className: isApproved ? 'status-approved' : 'status-responded'
      };
    }

    return {
      text: 'En attente',
      className: 'status-pending'
    };
  };

  if (loading) {
    return (
      <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
        <div
          className="spinner"
          style={{
            border: '2px solid var(--mist)',
            borderTop: '2px solid var(--gold)',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }}
        />
      </div>
    );
  }

  if (invitations.length === 0) {
    if (editorialMode) {
      return (
        <div className="workflow-collecte-list-empty">
          Aucun invite pour le moment. La collecte commencera des que vous enverrez vos premieres invitations.
        </div>
      );
    }

    return (
      <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
        <div className="empty-state-icon">+</div>
        <h3>Aucune invitation</h3>
        <p>Aucune invitation pour ce chapitre</p>
      </div>
    );
  }

  return (
    <div>
      {feedback?.message && (
        <div className={editorialMode ? 'workflow-collecte-note' : `luxe-feedback-banner is-${feedback.type || 'info'}`}>
          <span>{feedback.message}</span>
          {!editorialMode ? (
            <button
              type="button"
              className="luxe-feedback-close"
              onClick={() => setFeedback(null)}
              aria-label="Fermer le message"
            >
              x
            </button>
          ) : null}
        </div>
      )}

      <div className={`invitations-header ${editorialMode ? 'is-editorial' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--ink)' }}>
            Invitations en cours
          </h3>
          <Tooltip text="Total / Repondues / Approuvees / En attente">
            <span style={{ color: 'var(--gold)', cursor: 'help' }}>i</span>
          </Tooltip>
        </div>
        {!editorialMode ? (
          <div className="invitations-stats">
            <span style={{ color: 'var(--ink)' }}>
              <strong>{stats.total}</strong> invites
            </span>
            <span style={{ color: 'var(--gold)' }}>
              <strong>{stats.responded}</strong> repondues
            </span>
            <span style={{ color: 'var(--gold)' }}>
              <strong>{stats.approved}</strong> approuvees
            </span>
            {stats.pending > 0 ? (
              <span style={{ color: 'var(--text-light)' }}>
                <strong>{stats.pending}</strong> en attente
              </span>
            ) : null}
          </div>
        ) : (
          <div className="workflow-collecte-inline-summary">
            {stats.total} invite{stats.total > 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className={editorialMode ? 'workflow-collecte-invitation-list' : 'card'} style={{ padding: 0, overflow: 'hidden' }}>
        {invitations.map((invite, index) => {
          const status = getStatusBadge(invite);

          return (
            <div
              key={invite.id}
              className={`invitation-item ${editorialMode ? 'is-editorial' : ''}`}
              style={{
                borderBottom: index < invitations.length - 1 ? 'var(--border-fine)' : 'none',
                marginBottom: 0,
                borderRadius: 0,
                paddingTop: 'var(--space-md)',
                paddingBottom: 'var(--space-md)'
              }}
            >
              <div className="invitation-row">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                    <span className="invitation-name">
                      {invite.contributor?.name || invite.email?.split('@')[0] || 'Invite'}
                    </span>
                    <span className={`invitation-status ${status.className} ${editorialMode ? 'is-editorial' : ''}`}>
                      {status.text}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-light)',
                      display: 'flex',
                      gap: 'var(--space-sm)',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span>{invite.email}</span>
                    <span>{formatDate(invite.created_at)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!invite.hasSubmittedContribution && !isClosed ? (
                    <>
                      <button
                        onClick={() => handleCopyInviteLink(invite.token)}
                        className="btn-outline"
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                      >
                        Copier
                      </button>
                      <button
                        onClick={() => handleOpenReminder(invite.id)}
                        disabled={reminding === invite.id}
                        className="btn-outline"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          borderColor: 'var(--gold)',
                          color: 'var(--gold)',
                          opacity: reminding === invite.id ? 0.5 : 1
                        }}
                      >
                        {reminding === invite.id ? '...' : 'Relancer'}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {invite.last_reminder_sent ? (
                <div
                  style={{
                    marginTop: 'var(--space-xs)',
                    fontSize: '11px',
                    color: 'var(--gold)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>↻</span>
                  Derniere relance : {formatDate(invite.last_reminder_sent)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {confirmReminderId ? (
        <div
          className="modal-overlay"
          onClick={() => {
            if (reminding !== confirmReminderId) {
              setConfirmReminderId(null);
            }
          }}
        >
          <div
            className="modal-content modal-content-compact"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="modal-title">Envoyer un rappel</h3>
            <p className="modal-text">
              {`Relancer ${reminderTarget?.contributor?.name || reminderTarget?.email || 'cette personne'} maintenant ?`}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={() => setConfirmReminderId(null)}
                disabled={reminding === confirmReminderId}
              >
                Annuler
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={confirmReminder}
                disabled={reminding === confirmReminderId}
              >
                {reminding === confirmReminderId ? 'Envoi...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ChapterInvitationsLuxe;
