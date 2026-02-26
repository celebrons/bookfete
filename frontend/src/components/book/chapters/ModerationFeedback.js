// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ModerationFeedback.js
import React, { useState } from 'react';

const ModerationFeedback = ({ contribution, onSubmit, onCancel }) => {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      alert('Veuillez saisir une remarque pour le contributeur');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(contribution.id, feedback);
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '16px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h3 style={{ marginBottom: '1rem', color: '#333' }}>
          ✏️ Demander une modification
        </h3>
        
        <p style={{ marginBottom: '1rem', color: '#666' }}>
          Contribution de <strong>{contribution.contributor_name}</strong>
        </p>

        <div style={{
          background: '#f8f9fa',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          <p style={{ margin: 0, color: '#333', fontStyle: 'italic' }}>
            "{contribution.message}"
          </p>
        </div>

        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Expliquez au contributeur ce qui doit être modifié..."
          rows="5"
          style={{
            width: '100%',
            padding: '1rem',
            border: '2px solid #e9ecef',
            borderRadius: '8px',
            fontSize: '1rem',
            marginBottom: '1.5rem',
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
          autoFocus
        />

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.8rem 2rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              cursor: 'pointer'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !feedback.trim()}
            style={{
              padding: '0.8rem 2rem',
              background: submitting || !feedback.trim() ? '#ccc' : '#ffc107',
              color: '#333',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 'bold',
              cursor: submitting || !feedback.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? 'Envoi...' : 'Envoyer la demande'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModerationFeedback;