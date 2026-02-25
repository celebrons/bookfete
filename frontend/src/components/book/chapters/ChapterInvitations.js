// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterInvitations.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import Tooltip from '../../ui/Tooltip';

const ChapterInvitations = ({ chapterId, onLoadContributions }) => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    responded: 0,
    approved: 0
  });
  const [resending, setResending] = useState(null);

  useEffect(() => {
    if (chapterId) {
      loadInvitations();
    }
  }, [chapterId]);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('chapter_invites')
        .select(`
          *,
          contributor:book_contributors(name, email)
        `)
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Récupérer les contributions pour chaque invitation
      const invitationsWithContributions = await Promise.all(
        (data || []).map(async (invite) => {
          const { data: contribution } = await supabase
            .from('contributions')
            .select('approved, created_at')
            .eq('chapter_id', chapterId)
            .eq('contributor_email', invite.email)
            .maybeSingle();
          
          return {
            ...invite,
            contribution: contribution ? [contribution] : null
          };
        })
      );

      setInvitations(invitationsWithContributions || []);
      
      const total = invitationsWithContributions.length;
      const responded = invitationsWithContributions.filter(i => i.contributed).length;
      const approved = invitationsWithContributions.filter(
        i => i.contribution && i.contribution[0]?.approved
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

  const copyInviteLink = (token) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    alert('✅ Lien copié dans le presse-papier');
  };

  const handleResend = async (inviteId) => {
    setResending(inviteId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${process.env.REACT_APP_API_URL}/invites/resend/${inviteId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Erreur lors du renvoi');
      
      alert('✅ Invitation renvoyée avec succès');
      await loadInvitations();
      
    } catch (error) {
      console.error('❌ Erreur renvoi:', error);
      alert('Erreur lors du renvoi de l\'invitation');
    } finally {
      setResending(null);
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
    if (invite.contributed) {
      const isApproved = invite.contribution && invite.contribution[0]?.approved;
      return {
        text: isApproved ? '✓ Approuvée' : '⏳ En attente de validation',
        color: isApproved ? '#28a745' : '#ffc107',
        bgColor: isApproved ? '#d4edda' : '#fff3cd'
      };
    }
    return {
      text: '⏳ En attente',
      color: '#856404',
      bgColor: '#fff3cd'
    };
  };

  if (loading) {
    return (
      <div style={{ marginTop: '2rem' }}>
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <div className="spinner" style={{
            border: '2px solid #f3f3f3',
            borderTop: '2px solid #764ba2',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }} />
        </div>
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div style={{ marginTop: '2rem' }}>
        <div style={{
          background: '#f8f9fa',
          padding: '1.5rem',
          borderRadius: '10px',
          textAlign: 'center',
          color: '#666',
          border: '1px dashed #ccc'
        }}>
          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📭</span>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Aucune invitation pour ce chapitre
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      {/* Bouton pour voir toutes les contributions */}
      {onLoadContributions && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          marginBottom: '1.5rem'
        }}>
          <button
            onClick={() => onLoadContributions(chapterId)}
            style={{
              padding: '0.6rem 2rem',
              background: 'white',
              color: '#764ba2',
              border: '2px solid #764ba2',
              borderRadius: '30px',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(118, 75, 162, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#764ba2';
              e.target.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'white';
              e.target.style.color = '#764ba2';
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>👁️</span>
            Voir et modérer les contributions
          </button>
        </div>
      )}

      {/* En-tête compact avec stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        padding: '0.5rem 0',
        borderBottom: '1px solid #e9ecef'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600, color: '#333' }}>📨 Invitations envoyées</span>
          <Tooltip text="Total / Répondues / Approuvées / En attente">
            <span style={{ color: '#666', cursor: 'help' }}>ⓘ</span>
          </Tooltip>
        </div>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
          <span style={{ color: '#17a2b8' }}>
            <strong>{stats.total}</strong> total
          </span>
          <span style={{ color: '#28a745' }}>
            <strong>{stats.responded}</strong> répondues
          </span>
          <span style={{ color: '#28a745' }}>
            <strong>{stats.approved}</strong> approuvées
          </span>
          {stats.pending > 0 && (
            <span style={{ color: '#ffc107' }}>
              <strong>{stats.pending}</strong> en attente
            </span>
          )}
        </div>
      </div>

      {/* Liste détaillée des invitations */}
      <div style={{
        background: '#f8f9fa',
        borderRadius: '10px',
        border: '1px solid #e9ecef',
        overflow: 'hidden'
      }}>
        {invitations.map((invite, index) => {
          const status = getStatusBadge(invite);
          
          return (
            <div
              key={invite.id}
              style={{
                padding: '1rem',
                borderBottom: index < invitations.length - 1 ? '1px solid #e9ecef' : 'none',
                background: invite.contributed ? '#f8f9fa' : 'white'
              }}
            >
              {/* Ligne 1 : Nom + Statut + Actions */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ color: '#333' }}>
                    {invite.contributor?.name || invite.email?.split('@')[0] || 'Invité'}
                  </strong>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '20px',
                    background: status.bgColor,
                    color: status.color,
                    fontWeight: 500
                  }}>
                    {status.text}
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!invite.contributed && (
                    <>
                      <button
                        onClick={() => copyInviteLink(invite.token)}
                        style={{
                          padding: '0.3rem 0.8rem',
                          background: '#764ba2',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <span>🔗</span>
                        Copier
                      </button>
                      <button
                        onClick={() => handleResend(invite.id)}
                        disabled={resending === invite.id}
                        style={{
                          padding: '0.3rem 0.8rem',
                          background: resending === invite.id ? '#ccc' : '#ffc107',
                          color: '#333',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          cursor: resending === invite.id ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <span>↻</span>
                        {resending === invite.id ? '...' : 'Relancer'}
                      </button>
                    </>
                  )}
                  {invite.contributed && (
                    <span style={{
                      padding: '0.3rem 0.8rem',
                      background: status.bgColor,
                      color: status.color,
                      borderRadius: '4px',
                      fontSize: '0.8rem'
                    }}>
                      {status.text}
                    </span>
                  )}
                </div>
              </div>

              {/* Ligne 2 : Email + Date d'envoi */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.85rem',
                color: '#666',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <span>{invite.email}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>📅</span>
                  {formatDate(invite.created_at)}
                </span>
              </div>

              {/* Ligne 3 : Message de relance si déjà relancé */}
              {invite.last_reminder_sent && (
                <div style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#ffc107',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
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

export default ChapterInvitations;