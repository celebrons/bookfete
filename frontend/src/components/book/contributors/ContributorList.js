// C:\Users\USER\bookfete\frontend\src\components\book\contributors\ContributorList.js
import React from 'react';

const ContributorList = ({ contributors, onDelete }) => {
  if (contributors.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '3rem',
        background: '#f8f9fa',
        borderRadius: '10px',
        color: '#666'
      }}>
        <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>👥</span>
        <h3>Aucun contributeur</h3>
        <p>Ajoutez des emails pour commencer à inviter</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e9ecef' }}>
            <th style={{ padding: '1rem', textAlign: 'left' }}>Nom</th>
            <th style={{ padding: '1rem', textAlign: 'left' }}>Email</th>
            <th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th>
            <th style={{ padding: '1rem', textAlign: 'left' }}>Ajouté le</th>
            <th style={{ padding: '1rem', textAlign: 'left' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contributors.map(contributor => (
            <tr key={contributor.id} style={{ borderBottom: '1px solid #e9ecef' }}>
              <td style={{ padding: '1rem', fontWeight: '500' }}>
                {contributor.name || contributor.email.split('@')[0]}
              </td>
              <td style={{ padding: '1rem' }}>{contributor.email}</td>
              <td style={{ padding: '1rem' }}>
                <span style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  background: contributor.invited ? '#d4edda' : '#fff3cd',
                  color: contributor.invited ? '#155724' : '#856404'
                }}>
                  {contributor.invited ? 'Invité' : 'En attente'}
                </span>
              </td>
              <td style={{ padding: '1rem', color: '#666' }}>
                {new Date(contributor.created_at).toLocaleDateString('fr-FR')}
              </td>
              <td style={{ padding: '1rem' }}>
                <button
                  onClick={() => onDelete(contributor.id)}
                  style={{
                    padding: '0.3rem 0.8rem',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
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

export default ContributorList;