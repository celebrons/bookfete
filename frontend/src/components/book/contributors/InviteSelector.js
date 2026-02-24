// C:\Users\USER\bookfete\frontend\src\components\book\contributors\InviteSelector.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';

const InviteSelector = ({ chapterId, bookId, onClose, onInvitesSent }) => {
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

      // Charger tous les contributeurs du livre
      const { data: allContributors, error: contribError } = await supabase
        .from('book_contributors')
        .select('*')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true });

      if (contribError) throw contribError;

      // Charger ceux déjà invités à ce chapitre
      const { data: invited, error: inviteError } = await supabase
        .from('chapter_invites')
        .select('contributor_id, token')
        .eq('chapter_id', chapterId);

      if (inviteError) throw inviteError;

      const invitedMap = (invited || []).reduce((acc, i) => {
        acc[i.contributor_id] = i.token;
        return acc;
      }, {});
      
      // Marquer les déjà invités
      const contributorsWithStatus = (allContributors || []).map(c => ({
        ...c,
        alreadyInvited: invitedMap[c.id] ? true : false,
        token: invitedMap[c.id] || null
      }));

      setContributors(contributorsWithStatus);
      
      // Pré-sélectionner ceux qui ne sont PAS encore invités
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

      // Recharger les données pour mettre à jour les statuts
      await loadData();
      
      // Afficher le résultat
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

  // Écran de résultat
  if (showResult) {
    return (
      <div style={modalStyle}>
        <div style={modalContentStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem',
              color: result.success ? '#28a745' : '#dc3545'
            }}>
              {result.success ? '✅' : '❌'}
            </div>
            <h3 style={{ marginBottom: '1rem', color: '#333' }}>
              {result.success ? 'Invitations envoyées' : 'Erreur'}
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
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
              style={{
                padding: '0.8rem 2rem',
                background: result.success ? '#28a745' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                cursor: 'pointer'
              }}
            >
              {result.success ? 'Fermer' : 'Réessayer'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={modalStyle}>
        <div style={modalContentStyle}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="spinner" style={{
              border: '3px solid #f3f3f3',
              borderTop: '3px solid #764ba2',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }} />
            <p>Chargement...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={modalStyle}>
        <div style={modalContentStyle}>
          <h3 style={{ color: '#dc3545', marginBottom: '1rem' }}>❌ Erreur</h3>
          <p style={{ marginBottom: '1.5rem' }}>{error}</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button onClick={onClose} style={buttonStyle.secondary}>
              Fermer
            </button>
            <button onClick={loadData} style={buttonStyle.primary}>
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
    <div style={modalStyle}>
      <div style={{
        ...modalContentStyle,
        maxWidth: '500px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '80vh', // Hauteur fixe
        overflow: 'hidden' // PAS DE SCROLL GLOBAL
      }}>
        {/* En-tête fixe */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexShrink: 0
        }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#333' }}>
            👥 Inviter des contributeurs
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#999'
            }}
          >
            ✕
          </button>
        </div>

        {/* Message de guidage - fixe */}
        <div style={{
          background: '#f0f7ff',
          padding: '0.8rem 1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          fontSize: '0.9rem',
          color: '#0066cc',
          border: '1px solid #b8daff',
          flexShrink: 0
        }}>
          <span style={{ fontWeight: 'bold' }}>💡</span> Sélectionnez les personnes à inviter pour ce chapitre
        </div>

        {/* Stats compactes - fixes */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1.5rem',
          fontSize: '0.9rem',
          flexShrink: 0
        }}>
          <span style={{ color: '#17a2b8' }}>
            <strong>{contributors.length}</strong> total
          </span>
          <span style={{ color: '#28a745' }}>
            <strong>{availableContributors.length}</strong> disponibles
          </span>
          {invitedContributors.length > 0 && (
            <span 
              onClick={() => setShowInvited(!showInvited)}
              style={{
                color: '#6c757d',
                cursor: 'pointer',
                textDecoration: 'underline dotted'
              }}
            >
              <strong>{invitedContributors.length}</strong> déjà invités
            </span>
          )}
        </div>

        {/* Zone scrollable UNIQUEMENT pour la liste */}
        <div style={{
          flex: 1,
          overflowY: 'auto', // SEUL SCROLL ICI
          minHeight: 0, // Important pour flex
          marginBottom: '1.5rem',
          paddingRight: '0.5rem'
        }}>
          {availableContributors.length > 0 ? (
            <>
              {/* Tout sélectionner */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid #eee',
                marginBottom: '0.5rem',
                position: 'sticky',
                top: 0,
                background: 'white',
                zIndex: 1
              }}>
                <input
                  type="checkbox"
                  checked={selectedIds.length === availableContributors.length}
                  onChange={handleToggleAll}
                  style={{ width: '16px', height: '16px' }}
                />
                <label style={{ fontWeight: 500, fontSize: '0.95rem' }}>
                  Tous sélectionner ({selectedIds.length}/{availableContributors.length})
                </label>
              </div>

              {/* Liste des disponibles */}
              {availableContributors.map(contributor => (
                <div
                  key={contributor.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.8rem',
                    padding: '0.6rem 0.5rem',
                    borderBottom: '1px solid #f0f0f0',
                    background: selectedIds.includes(contributor.id) ? '#f8f9fa' : 'white'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(contributor.id)}
                    onChange={() => handleToggle(contributor.id)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>
                      {contributor.name || contributor.email.split('@')[0]}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666' }}>
                      {contributor.email}
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              color: '#666'
            }}>
              <p>Aucun contributeur disponible</p>
            </div>
          )}

          {/* Section des déjà invités (dans le scroll si visible) */}
          {invitedContributors.length > 0 && showInvited && (
            <div style={{
              marginTop: '1rem',
              borderTop: '1px solid #eee',
              paddingTop: '1rem'
            }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.8rem', color: '#666' }}>
                Déjà invités ({invitedContributors.length})
              </h4>
              {invitedContributors.map(contributor => (
                <div
                  key={contributor.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem',
                    borderBottom: '1px solid #eee',
                    fontSize: '0.9rem'
                  }}
                >
                  <span>{contributor.name || contributor.email.split('@')[0]}</span>
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/invite/${contributor.token}`)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: 'none',
                      border: '1px solid #764ba2',
                      color: '#764ba2',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      cursor: 'pointer'
                    }}
                  >
                    Copier
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Boutons fixes en bas */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          borderTop: '1px solid #eee',
          paddingTop: '1.5rem',
          flexShrink: 0
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '0.8rem',
              background: 'white',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '0.95rem',
              cursor: 'pointer'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSendInvites}
            disabled={sending || selectedIds.length === 0}
            style={{
              flex: 2,
              padding: '0.8rem',
              background: sending || selectedIds.length === 0 ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: sending || selectedIds.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {sending ? 'Envoi...' : `Inviter ${selectedIds.length} personne${selectedIds.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

// Styles
const modalStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)'
};

const modalContentStyle = {
  background: 'white',
  borderRadius: '12px',
  width: '90%',
  boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
};

const buttonStyle = {
  primary: {
    padding: '0.6rem 1.5rem',
    background: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.95rem',
    cursor: 'pointer'
  },
  secondary: {
    padding: '0.6rem 1.5rem',
    background: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.95rem',
    cursor: 'pointer'
  }
};

export default InviteSelector;