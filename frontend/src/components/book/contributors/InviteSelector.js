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

      // Afficher le résultat avec les liens
      setResult({
        success: true,
        message: `${toInvite.length} invitation(s) envoyée(s)`,
        invites: data.invites || []
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
          <h2 style={{ 
            marginBottom: '1.5rem', 
            color: result.success ? '#28a745' : '#dc3545',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            {result.success ? '✅' : '❌'} 
            {result.success ? 'Invitations envoyées' : 'Erreur'}
          </h2>
          
          {result.success ? (
            <>
              <p style={{ marginBottom: '1.5rem', color: '#666' }}>{result.message}</p>
              
              {/* Liste des liens d'invitation */}
              {result.invites && result.invites.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ 
                    marginBottom: '1rem', 
                    fontSize: '1rem', 
                    color: '#333',
                    fontWeight: '600'
                  }}>
                    🔗 Liens d'invitation (pour tests) :
                  </h3>
                  <div style={{ 
                    background: '#f8f9fa', 
                    padding: '1rem', 
                    borderRadius: '8px',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}>
                    {result.invites.map((invite, idx) => {
                      const link = `${window.location.origin}/invite/${invite.token}`;
                      const contributor = contributors.find(c => c.id === invite.contributor_id);
                      return (
                        <div key={idx} style={{ 
                          marginBottom: '1rem',
                          padding: '1rem',
                          background: 'white',
                          borderRadius: '8px',
                          border: '1px solid #e9ecef',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                        }}>
                          <div style={{ 
                            fontWeight: 'bold', 
                            marginBottom: '0.5rem',
                            color: '#764ba2'
                          }}>
                            👤 {contributor?.name || contributor?.email?.split('@')[0] || 'Invité'}
                          </div>
                          <div style={{ 
                            display: 'flex', 
                            gap: '0.5rem', 
                            alignItems: 'center',
                            flexWrap: 'wrap'
                          }}>
                            <input
                              type="text"
                              value={link}
                              readOnly
                              style={{
                                flex: 1,
                                minWidth: '250px',
                                padding: '0.6rem',
                                border: '1px solid #dee2e6',
                                borderRadius: '6px',
                                fontSize: '0.9rem',
                                background: '#f8f9fa',
                                color: '#495057'
                              }}
                            />
                            <button
                              onClick={() => copyToClipboard(link)}
                              style={{
                                padding: '0.6rem 1.2rem',
                                background: '#764ba2',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem'
                              }}
                            >
                              📋 Copier
                            </button>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                padding: '0.6rem 1.2rem',
                                background: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontSize: '0.9rem',
                                fontWeight: '500',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem'
                              }}
                            >
                              🔗 Tester
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ 
              background: '#fff3cd', 
              padding: '1rem', 
              borderRadius: '8px',
              color: '#856404',
              marginBottom: '1.5rem'
            }}>
              <p style={{ margin: 0 }}>{result.error}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
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
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {result.success ? 'Fermer' : 'Réessayer'}
            </button>
            {!result.success && (
              <button 
                onClick={() => setShowResult(false)} 
                style={{
                  padding: '0.8rem 2rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
            )}
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
            <p>Chargement des contributeurs...</p>
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
          <p style={{ marginBottom: '1rem' }}>{error}</p>
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
      <div style={modalContentStyle}>
        <h2 style={{ marginBottom: '1.5rem' }}>Inviter des contributeurs</h2>

        {/* Stats rapides */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '1.5rem',
          padding: '1rem',
          background: '#f8f9fa',
          borderRadius: '8px'
        }}>
          <div><strong>Total:</strong> {contributors.length}</div>
          <div><strong>Disponibles:</strong> {availableContributors.length}</div>
          <div><strong>Déjà invités:</strong> {invitedContributors.length}</div>
        </div>

        {/* Si aucun contributeur disponible */}
        {availableContributors.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            <p style={{ marginBottom: '1rem' }}>Aucun contributeur disponible à inviter.</p>
            {invitedContributors.length > 0 && (
              <>
                <p style={{ fontSize: '0.9rem', color: '#28a745', marginBottom: '1rem' }}>
                  ✓ {invitedContributors.length} contributeur(s) déjà invité(s)
                </p>
                
                {/* Afficher les liens des déjà invités */}
                <details style={{ marginBottom: '1rem', textAlign: 'left' }}>
                  <summary style={{ color: '#764ba2', cursor: 'pointer', fontWeight: '500' }}>
                    Voir les liens d'invitation existants
                  </summary>
                  <div style={{ marginTop: '1rem' }}>
                    {invitedContributors.map(contributor => (
                      <div key={contributor.id} style={{
                        marginBottom: '1rem',
                        padding: '1rem',
                        background: '#f8f9fa',
                        borderRadius: '8px',
                        border: '1px solid #e9ecef'
                      }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#333' }}>
                          {contributor.name || contributor.email.split('@')[0]}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            value={`${window.location.origin}/invite/${contributor.token}`}
                            readOnly
                            style={{
                              flex: 1,
                              minWidth: '200px',
                              padding: '0.5rem',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '0.9rem',
                              background: 'white'
                            }}
                          />
                          <button
                            onClick={() => copyToClipboard(`${window.location.origin}/invite/${contributor.token}`)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: '#764ba2',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.9rem'
                            }}
                          >
                            Copier
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
            <button onClick={onClose} style={{ ...buttonStyle.secondary, marginTop: '1rem' }}>
              Fermer
            </button>
          </div>
        )}

        {/* Liste des contributeurs disponibles */}
        {availableContributors.length > 0 && (
          <>
            {/* Tout sélectionner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem',
              background: '#f8f9fa',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <input
                type="checkbox"
                checked={selectedIds.length === availableContributors.length}
                onChange={handleToggleAll}
                style={{ width: '18px', height: '18px' }}
              />
              <label style={{ fontWeight: 'bold' }}>Tous sélectionner</label>
              <span style={{ color: '#666' }}>
                ({selectedIds.length}/{availableContributors.length} sélectionnés)
              </span>
            </div>

            {/* Liste des contributeurs disponibles */}
            <div style={{ 
              maxHeight: '300px', 
              overflowY: 'auto',
              marginBottom: '2rem',
              border: '1px solid #e9ecef',
              borderRadius: '8px'
            }}>
              {availableContributors.map(contributor => (
                <div
                  key={contributor.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    borderBottom: '1px solid #e9ecef',
                    background: selectedIds.includes(contributor.id) ? '#f3e8ff' : 'white',
                    transition: 'background 0.2s'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(contributor.id)}
                    onChange={() => handleToggle(contributor.id)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: '#333' }}>
                      {contributor.name || contributor.email.split('@')[0]}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                      {contributor.email}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Boutons */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={buttonStyle.secondary}
              >
                Annuler
              </button>
              <button
                onClick={handleSendInvites}
                disabled={sending || selectedIds.length === 0}
                style={{
                  ...buttonStyle.primary,
                  opacity: sending || selectedIds.length === 0 ? 0.5 : 1,
                  cursor: sending || selectedIds.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                {sending ? 'Envoi...' : `Inviter (${selectedIds.length})`}
              </button>
            </div>
          </>
        )}
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
  padding: '2rem',
  borderRadius: '16px',
  maxWidth: '700px',
  width: '90%',
  maxHeight: '80vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
};

const buttonStyle = {
  primary: {
    padding: '0.8rem 2rem',
    background: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  secondary: {
    padding: '0.8rem 2rem',
    background: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
};

export default InviteSelector;