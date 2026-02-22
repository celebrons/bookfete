// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionsModeration.js
import React from 'react';

const ContributionsModeration = ({
  chapterTitle,
  contributions,
  loading,
  onApprove,
  onDelete,
  onBack
}) => {
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
      ) : contributions.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: '#f8f9fa',
          borderRadius: '8px',
          color: '#666'
        }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📭</span>
          <h3>Aucune contribution pour ce chapitre</h3>
          <p>Les contributions apparaîtront ici une fois que les invités auront répondu.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {contributions.map(contribution => (
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
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
              }}>
                <div>
                  <strong>{contribution.contributor_name}</strong>
                  <span style={{ color: '#666', marginLeft: '1rem', fontSize: '0.9rem' }}>
                    {new Date(contribution.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!contribution.approved && (
                    <button
                      onClick={() => onApprove(contribution.id)}
                      style={{
                        padding: '0.3rem 0.8rem',
                        background: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      ✓ Approuver
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(contribution.id)}
                    style={{
                      padding: '0.3rem 0.8rem',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>

              <p style={{ margin: '0 0 1rem', lineHeight: '1.6' }}>
                {contribution.message}
              </p>

              {contribution.photo_urls && contribution.photo_urls.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                  gap: '0.5rem',
                  marginTop: '1rem'
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

              {!contribution.approved && (
                <span style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  background: '#ffc107',
                  color: '#333',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '3px',
                  fontSize: '0.8rem'
                }}>
                  En attente
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContributionsModeration;