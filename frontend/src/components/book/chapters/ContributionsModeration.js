// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionsModeration.js
import React from 'react';

const ContributionsModeration = ({
  chapterTitle,
  contributions,
  loading,
  onApprove,
  onDelete,
  onBack,
  organizerEmail
}) => {
  
  // Filtrer les contributions pour exclure celles de l'organisateur
  const filteredContributions = contributions.filter(
    c => c.contributor_email !== organizerEmail
  );

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, color: '#333' }}>
          Contributions pour "{chapterTitle}"
        </h2>
        <button
          onClick={onBack}
          style={{
            padding: '0.5rem 1rem',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          ← Retour au chapitre
        </button>
      </div>

      {loading ? (
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
          <p>Chargement des contributions...</p>
        </div>
      ) : filteredContributions.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: '#f8f9fa',
          borderRadius: '8px',
          color: '#666'
        }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📭</span>
          <h3>Aucune contribution des invités pour ce chapitre</h3>
          <p>Les contributions des invités apparaîtront ici.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {filteredContributions.map(contribution => (
            <div
              key={contribution.id}
              style={{
                background: contribution.approved ? '#f3e8ff' : '#fff3cd',
                padding: '1.5rem',
                borderRadius: '10px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                border: contribution.approved ? '1px solid #764ba2' : '1px solid #ffc107',
                position: 'relative'
              }}
            >
              {/* En-tête avec nom, date et statut */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <div>
                  <strong>{contribution.contributor_name}</strong>
                  <span style={{ color: '#666', marginLeft: '1rem', fontSize: '0.9rem' }}>
                    {formatDate(contribution.created_at)}
                  </span>
                </div>
                
                {/* Badge de statut */}
                <span style={{
                  padding: '0.2rem 0.8rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: '500',
                  background: contribution.approved ? '#d4edda' : '#fff3cd',
                  color: contribution.approved ? '#155724' : '#856404'
                }}>
                  {contribution.approved ? '✓ Approuvée' : '⏳ En attente'}
                </span>
              </div>

              {/* Message */}
              <p style={{ margin: '0 0 1rem', lineHeight: '1.6' }}>
                {contribution.message}
              </p>

              {/* Photos */}
              {contribution.photo_urls && contribution.photo_urls.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                  gap: '0.5rem',
                  marginBottom: '1.5rem'
                }}>
                  {contribution.photo_urls.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Photo ${idx + 1}`}
                      style={{
                        width: '100%',
                        height: '100px',
                        objectFit: 'cover',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                      onClick={() => window.open(url, '_blank')}
                    />
                  ))}
                </div>
              )}

              {/* Boutons de modération en bas */}
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                borderTop: '1px solid rgba(0,0,0,0.05)',
                paddingTop: '1rem',
                marginTop: '0.5rem'
              }}>
                {!contribution.approved && (
                  <button
                    onClick={() => onApprove(contribution.id)}
                    style={{
                      padding: '0.5rem 1.2rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>✓</span>
                    Approuver
                  </button>
                )}
                <button
                  onClick={() => onDelete(contribution.id)}
                  style={{
                    padding: '0.5rem 1.2rem',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  <span>🗑️</span>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContributionsModeration;