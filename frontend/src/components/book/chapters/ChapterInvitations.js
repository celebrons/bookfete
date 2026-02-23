// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ChapterInvitations.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';

const ChapterInvitations = ({ chapterId }) => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    responded: 0
  });

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
        .select('*')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filtrer les emails de test si nécessaire
      const filteredData = (data || []).filter(invite => 
        !invite.email.includes('invite@example.com')
      );

      const invitationsWithNames = await Promise.all(
        filteredData.map(async (invite) => {
          let contributorName = null;
          
          if (invite.contributor_id) {
            const { data: contributor } = await supabase
              .from('book_contributors')
              .select('name, email')
              .eq('id', invite.contributor_id)
              .single();
            
            contributorName = contributor?.name || contributor?.email?.split('@')[0] || null;
          }

          const { data: contribution } = await supabase
            .from('contributions')
            .select('approved')
            .eq('chapter_id', chapterId)
            .eq('contributor_email', invite.email)
            .maybeSingle();

          return {
            ...invite,
            contributor_name: contributorName || invite.email?.split('@')[0] || 'Invité',
            contribution: contribution || null
          };
        })
      );

      setInvitations(invitationsWithNames || []);
      
      const total = invitationsWithNames.length;
      const responded = invitationsWithNames.filter(i => i.contributed).length;
      setStats({
        total,
        responded,
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

  const getStatusColor = (contributed) => {
    return contributed ? '#28a745' : '#ffc107';
  };

  const getStatusText = (contributed) => {
    return contributed ? '✓ Répondu' : '⏳ En attente';
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div className="spinner" style={{
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #764ba2',
          borderRadius: '50%',
          width: '30px',
          height: '30px',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }} />
        <p style={{ color: '#666' }}>Chargement des invitations...</p>
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div style={{
        background: '#f8f9fa',
        padding: '2rem',
        borderRadius: '10px',
        textAlign: 'center',
        color: '#666',
        border: '1px dashed #ccc'
      }}>
        <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>📭</span>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#333' }}>Aucune invitation</h3>
        <p style={{ margin: 0, fontSize: '0.95rem', color: '#666' }}>
          Utilisez le bouton <strong>👥</strong> dans la liste de gauche pour inviter des contributeurs
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      border: '1px solid #e9ecef',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
    }}>
      {/* En-tête avec stats */}
      <div style={{
        padding: '1rem 1.5rem',
        background: '#f8f9fa',
        borderBottom: '1px solid #e9ecef',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>👥</span>
          Invitations envoyées
        </h3>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}>
          <span style={{ color: '#17a2b8', background: '#e8f4fd', padding: '0.2rem 0.8rem', borderRadius: '20px' }}>
            <strong>{stats.total}</strong> total
          </span>
          <span style={{ color: '#ffc107', background: '#fff3cd', padding: '0.2rem 0.8rem', borderRadius: '20px' }}>
            <strong>{stats.pending}</strong> en attente
          </span>
          <span style={{ color: '#28a745', background: '#d4edda', padding: '0.2rem 0.8rem', borderRadius: '20px' }}>
            <strong>{stats.responded}</strong> répondu
          </span>
        </div>
      </div>

      {/* Liste des invitations */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {invitations.map((invite, index) => (
          <div
            key={invite.id}
            style={{
              padding: '1rem 1.5rem',
              borderBottom: index < invitations.length - 1 ? '1px solid #e9ecef' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: invite.contributed ? '#f8f9fa' : 'white',
              transition: 'background 0.2s'
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem', 
                marginBottom: '0.3rem',
                flexWrap: 'wrap'
              }}>
                <strong style={{ color: '#333' }}>
                  {invite.contributor_name}
                </strong>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '20px',
                  background: invite.contributed ? '#d4edda' : '#fff3cd',
                  color: invite.contributed ? '#155724' : '#856404',
                  fontWeight: '500',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  {getStatusText(invite.contributed)}
                </span>
              </div>
              
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.3rem' }}>
                {invite.email}
              </div>
              
              {invite.contributed && invite.contribution && (
                <div style={{ 
                  fontSize: '0.85rem', 
                  color: invite.contribution.approved ? '#28a745' : '#ffc107',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  marginTop: '0.3rem'
                }}>
                  <span>✓</span>
                  Contribution {invite.contribution.approved ? 'approuvée' : 'en attente de validation'}
                </div>
              )}

              {invite.contributed && !invite.contribution && (
                <div style={{ 
                  fontSize: '0.85rem', 
                  color: '#ffc107',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  marginTop: '0.3rem'
                }}>
                  <span>⏳</span>
                  En attente de soumission
                </div>
              )}
            </div>
            
            {!invite.contributed && (
              <button
                onClick={() => copyInviteLink(invite.token)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#764ba2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => e.target.style.background = '#5a3d80'}
                onMouseLeave={(e) => e.target.style.background = '#764ba2'}
                title="Copier le lien d'invitation"
              >
                <span style={{ fontSize: '0.9rem' }}>🔗</span>
                Copier
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChapterInvitations;