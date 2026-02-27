// C:\Users\USER\bookfete\frontend\src\components\book\chapters\ContributionsModerationLuxe.js
import React from 'react';
import '../BookLuxe.css';

const ContributionsModerationLuxe = ({
  chapterTitle,
  contributions,
  loading,
  onApprove,
  onDelete,
  onBack
}) => {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '600', color: 'var(--ink)' }}>
          Contributions pour "{chapterTitle}"
        </h2>
        <button onClick={onBack} className="btn btn-outline">
          ← Retour au chapitre
        </button>
      </div>

      {loading ? (
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
      ) : contributions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3>Aucune contribution</h3>
          <p>Les contributions apparaîtront ici une fois que les invités auront répondu.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {contributions.map(contribution => (
            <div
              key={contribution.id}
              className="card"
              style={{
                borderColor: contribution.approved ? 'var(--gold)' : 'var(--mist)',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <div>
                  <span style={{ fontWeight: '600', color: 'var(--ink)' }}>
                    {contribution.contributor_name}
                  </span>
                  <span style={{ color: 'var(--text-light)', marginLeft: 'var(--space-md)', fontSize: '13px' }}>
                    {new Date(contribution.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {!contribution.approved && (
                    <button
                      onClick={() => onApprove(contribution.id)}
                      className="btn btn-primary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      ✓ Approuver
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(contribution.id)}
                    className="btn btn-outline"
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      borderColor: '#dc3545',
                      color: '#dc3545'
                    }}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>

              <p style={{ margin: '0 0 var(--space-md)', lineHeight: '1.6', color: 'var(--ink)' }}>
                {contribution.message}
              </p>

              {contribution.photo_urls && contribution.photo_urls.length > 0 && (
                <div className="photo-grid" style={{ marginTop: 'var(--space-md)' }}>
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
              )}

              {!contribution.approved && (
                <span style={{
                  position: 'absolute',
                  top: '-8px',
                  right: 'var(--space-md)',
                  background: 'var(--gold)',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius)',
                  fontSize: '11px',
                  fontWeight: '600'
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

export default ContributionsModerationLuxe;