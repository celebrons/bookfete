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
  const [showInvited] = useState(false);

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
        .select('contributor_id, token, email')
        .eq('chapter_id', chapterId);

      if (inviteError) throw inviteError;

      const invitedMapById = (invited || []).reduce((acc, i) => {
        if (i.contributor_id) {
          acc[i.contributor_id] = i.token;
        }
        return acc;
      }, {});

      const invitedMapByEmail = (invited || []).reduce((acc, i) => {
        if (i.email) {
          acc[i.email.trim().toLowerCase()] = i.token;
        }
        return acc;
      }, {});
      
      const contributorsWithStatus = (allContributors || []).map(c => ({
        ...c,
        alreadyInvited: Boolean(
          invitedMapById[c.id] ||
          invitedMapByEmail[c.email?.trim().toLowerCase()]
        ),
        token:
          invitedMapById[c.id] ||
          invitedMapByEmail[c.email?.trim().toLowerCase()] ||
          null
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
        <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', position: 'relative' }}>
          <button onClick={onClose} className="modal-close">✕</button>
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
            className="btn btn-primary"
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
        <div className="modal-content" style={{ position: 'relative' }}>
          <button onClick={onClose} className="modal-close">✕</button>
          <h3 className="modal-title" style={{ color: '#dc3545' }}>❌ Erreur</h3>
          <p className="modal-text">{error}</p>
          <div className="modal-actions">
            <button onClick={onClose} className="btn btn-outline">
              Fermer
            </button>
            <button onClick={loadData} className="btn btn-primary">
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (contributors.length === 0) {
    return (
      <div className="modal-overlay">
        <div className="modal-content modal-content-compact">
          <button onClick={onClose} className="modal-close">x</button>
          <h3 className="modal-title">Aucun contributeur</h3>
          <p className="modal-text">
            Merci d'ajouter des contributeurs dans l'onglet contributeurs, ils apparaitront ensuite ici.
          </p>
          <div className="modal-actions">
            <button onClick={onClose} className="btn btn-primary">
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const availableContributors = contributors.filter(c => !c.alreadyInvited);
  const invitedContributors = contributors.filter(c => c.alreadyInvited);
  const orderedContributors = [...invitedContributors, ...availableContributors];

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ 
        maxWidth: '500px', 
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 0
      }}>
        {/* En-tête minimal */}
        <div style={{
          padding: 'var(--space-md) var(--space-lg)',
          borderBottom: 'var(--border-fine)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--white)'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--ink)' }}>
            👥 Inviter des contributeurs
          </h3>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>

        {/* Stats compactes */}
        <div style={{
          padding: 'var(--space-sm) var(--space-lg)',
          borderBottom: 'var(--border-fine)',
          display: 'flex',
          gap: 'var(--space-md)',
          flexWrap: 'wrap',
          fontSize: '12px',
          background: 'var(--silk)'
        }}>
          <span><strong>{contributors.length}</strong> total</span>
          <span style={{ color: 'var(--gold)' }}><strong>{availableContributors.length}</strong> disponibles</span>
          {invitedContributors.length > 0 && (
            <span style={{ color: 'var(--text-light)', marginLeft: 'auto', fontSize: '11px' }}>
              <strong>{invitedContributors.length}</strong> deja invites
            </span>
          )}
          {false && invitedContributors.length > 0 && (
            <span 
              style={{
                color: 'var(--text-light)',
                marginLeft: 'auto',
                fontSize: '11px'
              }}
            >
              {showInvited ? 'Masquer' : `Voir ${invitedContributors.length} invités`}
            </span>
          )}
        </div>

        {/* Zone scrollable - occupe tout l'espace disponible */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-md) var(--space-lg)',
          minHeight: 0,
          maxHeight: '500px'
        }}>
          {/* Tout sélectionner - collé en haut */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            padding: 'var(--space-xs) 0 var(--space-sm)',
            borderBottom: 'var(--border-fine)',
            marginBottom: 'var(--space-sm)',
            position: 'sticky',
            top: 0,
            background: 'var(--white)',
            zIndex: 1
          }}>
            <input
              type="checkbox"
              checked={selectedIds.length === availableContributors.length}
              onChange={handleToggleAll}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label style={{ fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
              Tous sélectionner ({selectedIds.length}/{availableContributors.length})
            </label>
          </div>

          {/* Liste des contributeurs */}
          {orderedContributors.map(contributor => (
            <div
              key={contributor.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                padding: 'var(--space-xs) var(--space-sm)',
                borderBottom: 'var(--border-fine)',
                background: contributor.alreadyInvited
                  ? 'var(--silk)'
                  : (selectedIds.includes(contributor.id) ? 'var(--gold-light)' : 'transparent'),
                borderRadius: 'var(--radius)',
                marginBottom: '2px'
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(contributor.id)}
                disabled={contributor.alreadyInvited}
                onChange={() => handleToggle(contributor.id)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {contributor.alreadyInvited && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: '600',
                        color: 'var(--gold)',
                        background: 'var(--gold-light)',
                        borderRadius: '999px',
                        padding: '2px 6px'
                      }}
                    >
                      Deja invitee
                    </span>
                  )}
                  <span style={{ fontWeight: '500', fontSize: '13px', color: 'var(--ink)' }}>
                    {contributor.name || contributor.email.split('@')[0]}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                  {contributor.email}
                </div>
              </div>
              {contributor.alreadyInvited && contributor.token && (
                <button
                  onClick={() => copyToClipboard(`${window.location.origin}/invite/${contributor.token}`)}
                  className="btn btn-outline"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                >
                  Copier
                </button>
              )}
            </div>
          ))}

          {/* Section des déjà invités (si visible) */}
          {false && showInvited && invitedContributors.length > 0 && (
            <div style={{ marginTop: 'var(--space-md)' }}>
              <h4 style={{ fontSize: '12px', marginBottom: 'var(--space-xs)', color: 'var(--ink)' }}>
                Déjà invités ({invitedContributors.length})
              </h4>
              {invitedContributors.map(contributor => (
                <div
                  key={contributor.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-xs) var(--space-sm)',
                    borderBottom: 'var(--border-fine)',
                    background: 'var(--silk)',
                    borderRadius: 'var(--radius)',
                    marginBottom: '2px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: '600',
                          color: 'var(--gold)',
                          background: 'var(--gold-light)',
                          borderRadius: '999px',
                          padding: '2px 6px'
                        }}
                      >
                        Deja invitee
                      </span>
                      <span style={{ fontWeight: '500', fontSize: '12px', color: 'var(--ink)' }}>
                        {contributor.name || contributor.email.split('@')[0]}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-light)' }}>
                      {contributor.email}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/invite/${contributor.token}`)}
                    className="btn btn-outline"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                  >
                    🔗 Copier
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Boutons fixes en bas */}
        <div style={{
          padding: 'var(--space-md) var(--space-lg)',
          borderTop: 'var(--border-fine)',
          display: 'flex',
          gap: 'var(--space-md)',
          background: 'var(--white)'
        }}>
          <button onClick={onClose} className="btn btn-outline" style={{ flex: 1, padding: '10px' }}>
            Annuler
          </button>
          <button
            onClick={handleSendInvites}
            disabled={sending || selectedIds.length === 0}
            className="btn btn-primary"
            style={{ flex: 2, padding: '10px' }}
          >
            {sending ? 'Envoi...' : `Inviter ${selectedIds.length} personne${selectedIds.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InviteSelectorLuxe;
