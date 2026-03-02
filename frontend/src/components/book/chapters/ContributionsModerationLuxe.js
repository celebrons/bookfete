// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionsModerationLuxe.js
import React, { useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import '../BookLuxe.css';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';

const ContributionsModerationLuxe = ({
  chapterTitle,
  contributions,
  loading,
  onApprove,
  onDelete,
  onBack,
  userEmail // ← Ajoute cette prop
}) => {
  const [feedback, setFeedback] = useState('');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedContribution, setSelectedContribution] = useState(null);

  // Filtrer les contributions pour exclure l'organisateur
  const filteredContributions = contributions?.filter(c => 
    c.contributor_email !== userEmail &&
    c.contributor_email !== CHAPTER_STATE_EMAIL &&
    c.is_finalized !== false
  ) || [];

  const handleRequestRevision = (contribution) => {
    setSelectedContribution(contribution);
    setShowFeedbackModal(true);
  };

  const sendRevisionRequest = async () => {
    if (!feedback.trim()) {
      alert('Veuillez indiquer les modifications à apporter');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${process.env.REACT_APP_API_URL}/invites/request-revision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          contributionId: selectedContribution.id,
          feedback: feedback
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de l\'envoi');
      }

      setShowFeedbackModal(false);
      setFeedback('');
      onBack();
      alert('✅ Demande de modification envoyée');
    } catch (error) {
      console.error('❌ Erreur:', error);
      alert(error.message || 'Erreur lors de l\'envoi');
    }
  };

  const getContributionStatus = (contribution) => {
    if (contribution.approved) {
      return { text: 'Approuvée', color: '#1f7a3d', bg: '#e9f7ef' };
    }
    if (contribution.needs_revision) {
      return { text: 'Modification demandée', color: '#9a6b00', bg: '#fff8e1' };
    }
    return { text: 'En attente', color: '#856404', bg: '#fff7d6' };
  };

  if (loading) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-xxl)' }}>
        <div className="spinner" style={{
          border: '2px solid var(--mist)',
          borderTop: '2px solid var(--gold)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          animation: 'spin 1s linear infinite',
          margin: '0 auto var(--space-md)'
        }} />
        <p>Chargement des contributions...</p>
      </div>
    );
  }

  if (filteredContributions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📭</div>
        <h3>Aucune contribution</h3>
        <p>Les contributions des invités apparaîtront ici.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: 'var(--ink)' }}>
          Contributions - {chapterTitle}
        </h2>
        <button onClick={onBack} className="btn btn-outline">
          Retour au chapitre
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {filteredContributions.map(contribution => {
          const status = getContributionStatus(contribution);
          
          return (
            <div
              key={contribution.id}
              className="card"
              style={{
                borderColor: contribution.approved ? '#d9eadf' : 'var(--mist)',
                position: 'relative',
                padding: 'var(--space-lg)',
                boxShadow: 'none'
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: 'var(--space-md)',
                flexWrap: 'wrap',
                gap: 'var(--space-sm)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <span style={{ fontWeight: '600', color: 'var(--ink)' }}>
                    {contribution.contributor_name}
                  </span>
                  <span style={{ color: 'var(--text-light)', fontSize: '13px' }}>
                    {new Date(contribution.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '500',
                  background: status.bg,
                  color: status.color,
                  border: `1px solid ${status.color}`
                }}>
                  {status.text}
                </span>
              </div>

              <p style={{ 
                margin: '0 0 var(--space-md)', 
                lineHeight: '1.6', 
                color: 'var(--ink)',
                padding: 'var(--space-md)',
                background: '#fcfbf8',
                border: '1px solid var(--mist)',
                borderRadius: 'var(--radius)',
                fontStyle: 'normal'
              }}>
                {contribution.message}
              </p>

              {contribution.photo_urls && contribution.photo_urls.length > 0 && (
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <span className="label-gold" style={{ marginBottom: 'var(--space-sm)' }}>
                    Photos jointes ({contribution.photo_urls.length})
                  </span>
                  <div className="photo-grid" style={{ marginTop: 'var(--space-sm)' }}>
                    {contribution.photo_urls.map((url, idx) => (
                      <div
                        key={idx}
                        className="photo-item"
                        onClick={() => window.open(url, '_blank')}
                        style={{ cursor: 'pointer' }}
                      >
                        <img src={url} alt={`Photo ${idx + 1}`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {contribution.needs_revision && contribution.moderation_feedback && (
                <div style={{
                  marginTop: 'var(--space-md)',
                  padding: 'var(--space-md)',
                  background: '#fff3cd',
                  border: '1px solid #ffeeba',
                  borderRadius: 'var(--radius)',
                  color: '#856404'
                }}>
                  <span style={{ fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                    Modification demandée
                  </span>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    {contribution.moderation_feedback}
                  </p>
                </div>
              )}

              <div style={{ 
                display: 'flex', 
                gap: 'var(--space-sm)', 
                marginTop: 'var(--space-lg)',
                justifyContent: 'flex-end',
                borderTop: 'var(--border-fine)',
                paddingTop: 'var(--space-lg)'
              }}>
                {!contribution.approved && (
                  <>
                    <button
                      onClick={() => onApprove(contribution.id)}
                      className="btn btn-primary"
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                      Approuver
                    </button>
                    {!contribution.needs_revision && (
                      <button
                        onClick={() => handleRequestRevision(contribution)}
                        className="btn btn-outline"
                        style={{ 
                          padding: '8px 16px', 
                          fontSize: '13px',
                          borderColor: '#ffc107',
                          color: '#ffc107'
                        }}
                      >
                        Demander une modification
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => onDelete(contribution.id)}
                  className="btn btn-outline"
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    borderColor: '#dc3545',
                    color: '#dc3545'
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showFeedbackModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h3 className="modal-title">Demander une modification</h3>
            <p className="modal-text">
              Indiquez au contributeur ce qu'il doit modifier :
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows="4"
              className="input-luxe"
              placeholder="Ex: Pourriez-vous ajouter plus de détails sur ce moment ?"
              style={{ width: '100%', marginBottom: 'var(--space-lg)' }}
            />
            <div className="modal-actions">
              <button onClick={() => setShowFeedbackModal(false)} className="modal-btn modal-btn-secondary">
                Annuler
              </button>
              <button onClick={sendRevisionRequest} className="modal-btn modal-btn-primary">
                Envoyer la demande
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContributionsModerationLuxe;
