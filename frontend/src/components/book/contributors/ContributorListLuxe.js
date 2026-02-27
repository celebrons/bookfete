// C:\Users\USER\bookfete\frontend\src\components\book\contributors\ContributorListLuxe.js
import React from 'react';
import '../BookLuxe.css';

const ContributorListLuxe = ({ contributors, onDelete }) => {
  if (contributors.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">👥</div>
        <h3>Aucun contributeur</h3>
        <p>Ajoutez des emails pour commencer à inviter</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: 'var(--border-fine)', background: 'var(--silk)' }}>
            <th style={{ padding: 'var(--space-md)', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--ink)' }}>Nom</th>
            <th style={{ padding: 'var(--space-md)', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--ink)' }}>Email</th>
            <th style={{ padding: 'var(--space-md)', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--ink)' }}>Statut</th>
            <th style={{ padding: 'var(--space-md)', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--ink)' }}>Ajouté le</th>
            <th style={{ padding: 'var(--space-md)', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--ink)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contributors.map(contributor => (
            <tr key={contributor.id} style={{ borderBottom: 'var(--border-fine)' }}>
              <td style={{ padding: 'var(--space-md)', fontWeight: '500' }}>
                {contributor.name || contributor.email.split('@')[0]}
              </td>
              <td style={{ padding: 'var(--space-md)', color: 'var(--text-light)' }}>
                {contributor.email}
              </td>
              <td style={{ padding: 'var(--space-md)' }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  background: contributor.invited ? '#d4edda' : '#fff3cd',
                  color: contributor.invited ? '#155724' : '#856404'
                }}>
                  {contributor.invited ? 'Invité' : 'En attente'}
                </span>
              </td>
              <td style={{ padding: 'var(--space-md)', color: 'var(--text-light)' }}>
                {new Date(contributor.created_at).toLocaleDateString('fr-FR')}
              </td>
              <td style={{ padding: 'var(--space-md)' }}>
                <button
                  onClick={() => onDelete(contributor.id)}
                  className="btn-outline"
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    borderColor: '#dc3545',
                    color: '#dc3545'
                  }}
                >
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ContributorListLuxe;