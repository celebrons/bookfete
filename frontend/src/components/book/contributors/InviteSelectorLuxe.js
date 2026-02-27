// C:\Users\USER\bookfete\frontend\src\components\book\contributors\InviteSelectorLuxe.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import '../BookLuxe.css';

const InviteSelectorLuxe = ({ chapterId, bookId, onClose, onInvitesSent }) => {
  const [contributors, setContributors] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);
  const [showInvited, setShowInvited] = useState(false);

  useEffect(() => {
    loadData();
  }, [chapterId, bookId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!bookId || !chapterId) {
        throw new Error('Paramètres manquants');
      }

      const { data: allContributors, error: contribError } = await supabase
        .from('book_contributors')
        .select('*')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true });

      if (contribError) throw contribError;

      const { data: invited, error: inviteError } = await supabase
        .from('chapter_invites')
        .select('contributor_id, token')
        .eq('chapter_id', chapterId);

      if (inviteError) throw inviteError;

      const invitedMap = (invited || []).reduce((acc, i) => {
        acc[i.contributor_id] = i.token;
        return acc;
      }, {});
      
      const contributorsWithStatus = (allContributors || []).map(c => ({
        ...c,
        alreadyInvited: invitedMap[c.id] ? true : false,
        token: invitedMap[c.id] || null
      }));

      setContributors(contributorsWithStatus);
      
      const notInvitedIds = contributorsWithStatus
        .filter(c => !c.alreadyInvited)
        .map(c => c.id);
      
      setSelectedIds(notInvitedIds);

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAll = () => {
    const availableIds = contributors
      .filter(c => !c.alreadyInvited)
      .map(c => c.id);
    
    if (selectedIds.length === availableIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(availableIds);
    }
  };

  const handleToggle = (contributorId) => {
    if (selectedIds.includes(contributorId)) {
      setSelectedIds(prev => prev.filter(id => id !== contributorId));
    } else {
      setSelectedIds(prev => [...prev, contributorId]);
    }
  };

  const handleSendInvites = async () => {
    const toInvite = selectedIds.filter(id => 
      !contributors.find(c => c.id === id)?.alreadyInvited
    );

    if (toInvite.length === 0) {
      alert('Sélectionnez au moins un contributeur à inviter');
      return;
    }

    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const url = `${apiUrl}/invites/batch`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chapterId,
          contributorIds: toInvite
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erreur ${response.status}`);
      }

      await loadData();
      
      setResult({
        success: true,
        message: `${toInvite.length} invitation(s) envoyée(s)`
      });
      setShowResult(true);
      
    } catch (error) {
      console.error('❌ Erreur envoi:', error);
      setResult({
        success: false,
        error: error.message
      });
      setShowResult(true);
    } finally {
      setSending(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('✅ Lien copié dans le presse-papier');
  };

  if (showResult) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{
            fontSize: '48px',
            marginBottom: 'var(--space-lg)',
            color: result.success ? 'var(--gold)' : '#dc3545'
          }}>
            {result.success ? '✅' : '❌'}
          </div>
          <h3 className="modal-title">
            {result.success ? 'Invitations envoyées' : 'Erreur'}
          </h3>
          <p className="modal-text">
            {result.success ? result.message : result.error}
          </p>
          <button
            onClick={() => {
              setShowResult(false);
              if (result.success) {
                if (onInvitesSent) onInvitesSent();
                onClose();
              }
            }}
            className="modal-btn modal-btn-primary"
          >
            {result.success ? 'Fermer' : 'Réessayer'}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ textAlign: 'center', padding: 'var(--space-xxl)' }}>
          <div className="spinner" style={{
            border: '2px solid var(--mist)',
            borderTop: '2px solid var(--gold)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto var(--space-md)'
          }} />
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <h3 className="modal-title" style={{ color: '#dc3545' }}>❌ Erreur</h3>
          <p className="modal-text">{error}</p>
          <div className="modal-actions">
            <button onClick={onClose} className="modal-btn modal-btn-secondary">
              Fermer
            </button>
            <button onClick={loadData} className="modal-btn modal-btn-primary">
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const availableContributors = contributors.filter(c => !c.alreadyInvited);
  const invitedContributors = contributors.filter(c => c.alreadyInvited);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3 className="modal-title">👥 Inviter des contributeurs</h3>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>

        <div className="modal-body">
          <div className="card" style={{ marginBottom: 'var(--space-lg)', background: 'var(--gold-light)' }}>
            <p style={{ fontSize: '13px', color: 'var(--ink)', margin: 0 }}>
              <strong>💡</strong> Sélectionnez les personnes à inviter pour ce chapitre
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <span style={{ color: 'var(--ink)' }}>
              <strong>{contributors.length}</strong> total
            </span>
            <span style={{ color: 'var(--gold)' }}>
              <strong>{availableContributors.length}</strong> disponibles
            </span>
            {invitedContributors.length > 0 && (
              <span 
                onClick={() => setShowInvited(!showInvited)}
                style={{
                  color: 'var(--text-light)',
                  cursor: 'pointer',
                  textDecoration: 'underline dotted'
                }}
              >
                <strong>{invitedContributors.length}</strong> déjà invités
              </span>
            )}
          </div>

          {availableContributors.length > 0 && (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                padding: 'var(--space-sm) 0',
                borderBottom: 'var(--border-fine)',
                marginBottom: 'var(--space-sm)'
              }}>
                <input
                  type="checkbox"
                  checked={selectedIds.length === availableContributors.length}
                  onChange={handleToggleAll}
                  style={{ width: '16px', height: '16px' }}
                />
                <label style={{ fontSize: '13px' }}>
                  Tous sélectionner ({selectedIds.length}/{availableContributors.length})
                </label>
              </div>

              {availableContributors.map(contributor => (
                <div
                  key={contributor.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    padding: 'var(--space-sm)',
                    borderBottom: 'var(--border-fine)',
                    background: selectedIds.includes(contributor.id) ? 'var(--gold-light)' : 'white'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(contributor.id)}
                    onChange={() => handleToggle(contributor.id)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', fontSize: '14px' }}>
                      {contributor.name || contributor.email.split('@')[0]}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                      {contributor.email}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {invitedContributors.length > 0 && showInvited && (
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <h4 style={{ fontSize: '14px', marginBottom: 'var(--space-sm)', color: 'var(--ink)' }}>
                Déjà invités ({invitedContributors.length})
              </h4>
              {invitedContributors.map(contributor => (
                <div
                  key={contributor.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-sm)',
                    borderBottom: 'var(--border-fine)'
                  }}
                >
                  <span style={{ fontSize: '13px' }}>
                    {contributor.name || contributor.email.split('@')[0]}
                  </span>
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/invite/${contributor.token}`)}
                    className="btn-outline"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                  >
                    Copier
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="modal-btn modal-btn-secondary">
            Annuler
          </button>
          <button
            onClick={handleSendInvites}
            disabled={sending || selectedIds.length === 0}
            className="modal-btn modal-btn-primary"
          >
            {sending ? 'Envoi...' : `Inviter ${selectedIds.length} personne${selectedIds.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InviteSelectorLuxe;