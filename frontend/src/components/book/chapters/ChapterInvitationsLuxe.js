// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterInvitationsLuxe.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const ChapterInvitationsLuxe = ({ chapterId, bookId, isClosed = false, refreshToken = 0 }) => {
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
      const responded = invitationsWithContributions.filter(i => i.hasSubmittedContribution).length;
      const approved = invitationsWithContributions.filter(
        i => i.hasSubmittedContribution && i.contribution && i.contribution[0]?.approved
      ).length;
      
      setStats({
        total,
        responded,
        approved,
        pending: total - responded
      });

    } catch (error) {
      console.error('❌ Erreur chargement invitations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInviteLink = (token) => `${window.location.origin}/invite/${token}`;

  const copyInviteLink = (token) => {
    const link = getInviteLink(token);
    navigator.clipboard.writeText(link);
    alert('✅ Lien copié dans le presse-papier');
  };

  const sendReminder = async (inviteId) => {
    if (!window.confirm('Envoyer un rappel à cette personne ?')) return;

    setReminding(inviteId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${process.env.REACT_APP_API_URL}/invites/resend/${inviteId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Erreur lors de l\'envoi du rappel');

      alert('✅ Rappel envoyé avec succès');
      await loadInvitations();
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      alert('Erreur lors de l\'envoi du rappel');
    } finally {
      setReminding(null);
    }
  };

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
        text: 'Modification demandée',
        className: 'status-responded'
      };
    }

    if (invite.hasSubmittedContribution) {
      const isApproved = invite.contribution && invite.contribution[0]?.approved;
      return {
        text: isApproved ? 'Approuvée' : 'En attente de validation',
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
        <div className="spinner" style={{
          border: '2px solid var(--mist)',
          borderTop: '2px solid var(--gold)',
          borderRadius: '50%',
          width: '30px',
          height: '30px',
          animation: 'spin 1s linear infinite',
          margin: '0 auto'
        }} />
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
        <div className="empty-state-icon">📭</div>
        <h3>Aucune invitation</h3>
        <p>Aucune invitation pour ce chapitre</p>
      </div>
    );
  }

  return (
    <div>
      <div className="invitations-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--ink)' }}>
            Contributeurs invités
          </h3>
          <Tooltip text="Total / Répondues / Approuvées / En attente">
            <span style={{ color: 'var(--gold)', cursor: 'help' }}>ⓘ</span>
          </Tooltip>
        </div>
        <div className="invitations-stats">
          <span style={{ color: 'var(--ink)' }}>
            <strong>{stats.total}</strong> invités
          </span>
          <span style={{ color: 'var(--gold)' }}>
            <strong>{stats.responded}</strong> répondues
          </span>
          <span style={{ color: 'var(--gold)' }}>
            <strong>{stats.approved}</strong> approuvées
          </span>
          {stats.pending > 0 && (
            <span style={{ color: 'var(--text-light)' }}>
              <strong>{stats.pending}</strong> en attente
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {invitations.map((invite, index) => {
          const status = getStatusBadge(invite);
          
          return (
            <div
              key={invite.id}
              className="invitation-item"
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
                      {invite.contributor?.name || invite.email?.split('@')[0] || 'Invité'}
                    </span>
                    <span className={`invitation-status ${status.className}`}>
                      {status.text}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-light)',
                    display: 'flex',
                    gap: 'var(--space-sm)',
                    flexWrap: 'wrap'
                  }}>
                    <span>{invite.email}</span>
                    <span>{formatDate(invite.created_at)}</span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!invite.hasSubmittedContribution && !isClosed && (
                    <>
                      <button
                        onClick={() => copyInviteLink(invite.token)}
                        className="btn-outline"
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                      >
                        Copier
                      </button>
                      <button
                        onClick={() => sendReminder(invite.id)}
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
                  )}
                </div>
              </div>

              {invite.last_reminder_sent && (
                <div style={{
                  marginTop: 'var(--space-xs)',
                  fontSize: '11px',
                  color: 'var(--gold)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span>↻</span>
                  Dernière relance : {formatDate(invite.last_reminder_sent)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChapterInvitationsLuxe;
