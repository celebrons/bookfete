// C:\Users\USER\bookfete\frontend\src\components\organisateur\moderation\ContributionCard.js
import React, { useState } from 'react';

const ContributionCard = ({ contribution, onApprove, onReject, onEdit }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedMessage, setEditedMessage] = useState(contribution.edited_message || contribution.message);

  const getStatusColor = (status) => {
    switch(status) {
      case 'approved': return '#28a745';
      case 'rejected': return '#dc3545';
      case 'pending': return '#ffc107';
      default: return '#6c757d';
    }
  };

  const getStatusLabel = (status) => {
    switch(status) {
      case 'approved': return '✅ Approuvée';
      case 'rejected': return '❌ Rejetée';
      case 'pending': return '⏳ En attente';
      default: return '📝 Nouvelle';
    }
  };

  return (
    <div style={{
      border: '1px solid #dee2e6',
      borderRadius: '10px',
      padding: '1.5rem',
      marginBottom: '1rem',
      background: 'white',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}>
      {/* En-tête */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{
            padding: '0.25rem 0.75rem',
            background: getStatusColor(contribution.status),
            color: 'white',
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: 'bold'
          }}>
            {getStatusLabel(contribution.status)}
          </span>
          <span style={{ fontWeight: 'bold', color: '#333' }}>
            {contribution.contributor_email}
          </span>
        </div>
        <small style={{ color: '#999' }}>
          {new Date(contribution.created_at).toLocaleDateString('fr-FR')}
        </small>
      </div>

      {/* Message éditable */}
      <div style={{ marginBottom: '1rem' }}>
        {isExpanded ? (
          <textarea
            value={editedMessage}
            onChange={(e) => setEditedMessage(e.target.value)}
            rows="4"
            style={{
              width: '100%',
              padding: '0.8rem',
              border: '1px solid #764ba2',
              borderRadius: '5px',
              fontSize: '1rem'
            }}
          />
        ) : (
          <p style={{ 
            margin: 0, 
            lineHeight: '1.6',
            color: '#333',
            background: '#f8f9fa',
            padding: '1rem',
            borderRadius: '5px'
          }}>
            {editedMessage}
          </p>
        )}
      </div>

      {/* Photos */}
      {contribution.photo_urls && contribution.photo_urls.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
          gap: '0.5rem',
          marginBottom: '1rem'
        }}>
          {contribution.photo_urls.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`photo-${idx}`}
              style={{
                width: '100%',
                height: '80px',
                objectFit: 'cover',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
              onClick={() => window.open(url, '_blank')}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        justifyContent: 'flex-end',
        borderTop: '1px solid #eee',
        paddingTop: '1rem',
        marginTop: '0.5rem'
      }}>
        {contribution.status !== 'approved' && (
          <button
            onClick={() => {
              if (editedMessage !== contribution.message) {
                onEdit({ ...contribution, edited_message: editedMessage });
              }
              onApprove(contribution.id);
            }}
            style={{
              padding: '0.5rem 1rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            ✅ Approuver
          </button>
        )}
        
        {contribution.status !== 'rejected' && (
          <button
            onClick={() => onReject(contribution.id)}
            style={{
              padding: '0.5rem 1rem',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            ❌ Rejeter
          </button>
        )}
        
        <button
          onClick={() => {
            if (isExpanded && editedMessage !== contribution.message) {
              onEdit({ ...contribution, edited_message: editedMessage });
            }
            setIsExpanded(!isExpanded);
          }}
          style={{
            padding: '0.5rem 1rem',
            background: isExpanded ? '#764ba2' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          {isExpanded ? '💾 Sauvegarder' : '✏️ Modifier'}
        </button>
      </div>
    </div>
  );
};

export default ContributionCard;