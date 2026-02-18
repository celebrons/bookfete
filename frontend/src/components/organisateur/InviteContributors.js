// C:\Users\USER\bookfete\frontend\src\components\organisateur\InviteContributors.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const InviteContributors = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [emails, setEmails] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [invites, setInvites] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchProject();
    fetchInvites();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      setProject(data);
    } catch (error) {
      console.error('Erreur chargement projet:', error);
    }
  };

  const fetchInvites = async () => {
    try {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvites(data || []);
    } catch (error) {
      console.error('Erreur chargement invitations:', error);
    }
  };

  const validateEmails = (emailList) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(email => !emailRegex.test(email));
    return {
      valid: invalidEmails.length === 0,
      invalidEmails
    };
  };

  const handleInvite = async () => {
    setError(null);
    setSuccess(null);
    
    const emailList = emails
      .split(/[\n,;]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (emailList.length === 0) {
      setError('Veuillez entrer au moins une adresse email');
      return;
    }

    if (emailList.length > 100) {
      setError('Maximum 100 invités par projet');
      return;
    }

    const validation = validateEmails(emailList);
    if (!validation.valid) {
      setError(`Emails invalides : ${validation.invalidEmails.join(', ')}`);
      return;
    }

    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      if (!token) {
        throw new Error('Non authentifié');
      }

      const apiUrl = `${process.env.REACT_APP_API_URL}/invites`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId,
          emails: emailList,
          customMessage
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur envoi invitations');
      }

      setSuccess(`${emailList.length} invitation(s) envoyée(s) avec succès !`);
      setEmails('');
      setCustomMessage('');
      fetchInvites();
      
    } catch (error) {
      console.error('Erreur:', error);
      setError(error.message);
    } finally {
      setSending(false);
    }
  };

  if (!project) return <div style={{ textAlign: 'center', padding: '2rem' }}>Chargement...</div>;

  const stats = {
    total: invites.length,
    contributed: invites.filter(i => i.contributed).length,
    pending: invites.filter(i => !i.contributed).length
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1>Inviter des contributeurs</h1>
      <h2 style={{ color: '#666', fontSize: '1.2rem', marginBottom: '2rem' }}>
        Projet : {project.name}
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem'
      }}>
        {/* Formulaire d'invitation */}
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Ajouter des invités</h3>
          
          {error && (
            <div style={{
              background: '#f8d7da',
              color: '#721c24',
              padding: '1rem',
              borderRadius: '5px',
              marginBottom: '1rem'
            }}>
              {error}
            </div>
          )}
          
          {success && (
            <div style={{
              background: '#d4edda',
              color: '#155724',
              padding: '1rem',
              borderRadius: '5px',
              marginBottom: '1rem'
            }}>
              {success}
            </div>
          )}
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Adresses email *
            </label>
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="exemple1@email.com, exemple2@email.com, ..."
              rows="6"
              style={{
                width: '100%',
                padding: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem'
              }}
              disabled={sending}
            />
            <p style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
              Séparez les emails par des virgules, points-virgules ou retours à la ligne
            </p>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Message personnalisé (optionnel)
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ajoutez un message personnel..."
              rows="3"
              style={{
                width: '100%',
                padding: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem'
              }}
              disabled={sending}
            />
          </div>

          <button 
            onClick={handleInvite} 
            disabled={sending || !emails.trim()}
            style={{
              width: '100%',
              padding: '1rem',
              background: sending || !emails.trim() ? '#ccc' : '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: sending || !emails.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {sending ? 'Envoi en cours...' : 'Envoyer les invitations'}
          </button>
        </div>

        {/* Statistiques */}
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>Récapitulatif</h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            margin: '1.5rem 0'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#333' }}>{stats.total}</div>
              <div style={{ color: '#666', fontSize: '0.9rem' }}>Total invités</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#28a745' }}>{stats.contributed}</div>
              <div style={{ color: '#666', fontSize: '0.9rem' }}>Ont contribué</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffc107' }}>{stats.pending}</div>
              <div style={{ color: '#666', fontSize: '0.9rem' }}>En attente</div>
            </div>
          </div>

          <h4 style={{ marginBottom: '1rem' }}>Dernières invitations</h4>
          {invites.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>
              Aucune invitation envoyée pour l'instant
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {invites.slice(0, 5).map(invite => (
                <li key={invite.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.8rem 0',
                  borderBottom: '1px solid #eee'
                }}>
                  <span style={{ color: '#333' }}>{invite.email}</span>
                  {invite.contributed ? (
                    <span style={{
                      background: '#d4edda',
                      color: '#155724',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '3px',
                      fontSize: '0.9rem'
                    }}>
                      ✓ Contribué
                    </span>
                  ) : (
                    <span style={{
                      background: '#fff3cd',
                      color: '#856404',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '3px',
                      fontSize: '0.9rem'
                    }}>
                      ⏳ En attente
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div style={{
            display: 'flex',
            gap: '1rem',
            marginTop: '2rem',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={() => navigate(`/project/${projectId}`)}
              style={{
                padding: '0.8rem 1.5rem',
                background: 'white',
                color: '#764ba2',
                border: '2px solid #764ba2',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Voir le projet
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '0.8rem 1.5rem',
                background: 'transparent',
                color: '#666',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Retour au tableau de bord
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteContributors;