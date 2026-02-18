// C:\Users\USER\bookfete\frontend\src\components\organisateur\ContributionControls.js
import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

const ContributionControls = ({ project, onStatusChange }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCloseContributions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      if (!token) {
        throw new Error('Non authentifié');
      }

      const apiUrl = `${process.env.REACT_APP_API_URL}/projects/${project.id}/close`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la fermeture');
      }

      onStatusChange(data.project);
      setShowConfirm(false);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReopenContributions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      if (!token) {
        throw new Error('Non authentifié');
      }

      const apiUrl = `${process.env.REACT_APP_API_URL}/projects/${project.id}/reopen`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la réouverture');
      }

      onStatusChange(data.project);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = () => {
    const now = new Date();
    const deadline = new Date(project.contribution_deadline);
    const isDeadlinePassed = now > deadline;

    if (project.status === 'collecting') {
      return {
        badge: 'badge-success',
        text: '🔓 Collecte ouverte',
        deadlineWarning: isDeadlinePassed ? '⚠️ Date limite dépassée' : null
      };
    } else if (project.status === 'reviewing') {
      return {
        badge: 'badge-warning',
        text: project.manually_closed ? '🔒 Collecte fermée manuellement' : '📋 En relecture',
        deadlineWarning: null
      };
    }
    return { badge: 'badge-default', text: project.status, deadlineWarning: null };
  };

  const status = getStatusInfo();

  return (
    <div className="contribution-controls" style={{
      background: 'white',
      borderRadius: '10px',
      padding: '1.5rem',
      margin: '1rem 0',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <div style={{
        marginBottom: '1rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #eee'
      }}>
        <div style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <span style={{
            padding: '0.3rem 0.8rem',
            borderRadius: '20px',
            fontSize: '0.9rem',
            fontWeight: '500',
            background: status.badge === 'badge-success' ? '#d4edda' : 
                        status.badge === 'badge-warning' ? '#fff3cd' : '#e2e3e5',
            color: status.badge === 'badge-success' ? '#155724' : 
                   status.badge === 'badge-warning' ? '#856404' : '#383d41'
          }}>
            {status.text}
          </span>
          {status.deadlineWarning && (
            <span style={{
              padding: '0.3rem 0.8rem',
              background: '#fff3cd',
              color: '#856404',
              borderRadius: '20px',
              fontSize: '0.9rem'
            }}>
              {status.deadlineWarning}
            </span>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        {project.status === 'collecting' && (
          <>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading}
              style={{
                padding: '0.8rem 1.5rem',
                background: '#ffc107',
                color: '#333',
                border: 'none',
                borderRadius: '5px',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1
              }}
            >
              🔒 Fermer les contributions
            </button>
            <small style={{ color: '#666', fontSize: '0.85rem', fontStyle: 'italic' }}>
              Les contributeurs ne pourront plus ajouter de messages
            </small>
          </>
        )}

        {project.status === 'reviewing' && project.manually_closed && (
          <button
            onClick={handleReopenContributions}
            disabled={loading}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            🔓 Rouvrir les contributions
          </button>
        )}
      </div>

      {showConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '10px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#333' }}>Confirmer la fermeture</h3>
            <p style={{ marginBottom: '1rem' }}>Êtes-vous sûr de vouloir fermer les contributions ?</p>
            <p style={{
              color: '#dc3545',
              fontWeight: 'bold',
              margin: '1rem 0'
            }}>
              Les contributeurs ne pourront plus ajouter de messages ou de photos.
            </p>
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end',
              marginTop: '1.5rem'
            }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '0.8rem 1.5rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCloseContributions}
                disabled={loading}
                style={{
                  padding: '0.8rem 1.5rem',
                  background: '#ffc107',
                  color: '#333',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1
                }}
              >
                {loading ? 'Fermeture...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '1rem',
          padding: '0.8rem',
          background: '#f8d7da',
          color: '#721c24',
          borderRadius: '5px'
        }}>
          ❌ {error}
        </div>
      )}
    </div>
  );
};

export default ContributionControls;