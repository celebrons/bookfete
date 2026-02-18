// frontend/src/components/organisateur/moderation/ContributionModerator.js
import React, { useState } from 'react';
import ContributionCard from './ContributionCard';
import PhotoManager from './PhotoManager';

const ContributionModerator = ({ contributions, onUpdate }) => {
  const [filter, setFilter] = useState('all'); // all, pending, approved, rejected
  const [selectedContribution, setSelectedContribution] = useState(null);

  const filteredContributions = contributions.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const stats = {
    total: contributions.length,
    pending: contributions.filter(c => c.status === 'pending').length,
    approved: contributions.filter(c => c.status === 'approved').length,
    rejected: contributions.filter(c => c.status === 'rejected').length
  };

  const handleApprove = async (contributionId) => {
    // Appel API pour approuver
    const updated = contributions.map(c => 
      c.id === contributionId ? {...c, status: 'approved'} : c
    );
    onUpdate(updated);
  };

  const handleReject = async (contributionId) => {
    // Appel API pour rejeter
    const updated = contributions.map(c => 
      c.id === contributionId ? {...c, status: 'rejected'} : c
    );
    onUpdate(updated);
  };

  const handleEdit = (contribution) => {
    setSelectedContribution(contribution);
  };

  return (
    <div style={{ padding: '2rem' }}>
      {/* Statistiques */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={statCardStyle}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#764ba2' }}>{stats.total}</div>
          <div>Total</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffc107' }}>{stats.pending}</div>
          <div>En attente</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#28a745' }}>{stats.approved}</div>
          <div>Approuvées</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc3545' }}>{stats.rejected}</div>
          <div>Rejetées</div>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ marginBottom: '2rem' }}>
        <button onClick={() => setFilter('all')}>Toutes</button>
        <button onClick={() => setFilter('pending')}>En attente</button>
        <button onClick={() => setFilter('approved')}>Approuvées</button>
        <button onClick={() => setFilter('rejected')}>Rejetées</button>
      </div>

      {/* Liste des contributions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredContributions.map(contribution => (
          <ContributionCard
            key={contribution.id}
            contribution={contribution}
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEdit}
          />
        ))}
      </div>

      {/* Modal d'édition */}
      {selectedContribution && (
        <div style={modalStyle}>
          <div style={modalContentStyle}>
            <h3>Modifier la contribution</h3>
            <textarea
              value={selectedContribution.edited_message || selectedContribution.message}
              onChange={(e) => setSelectedContribution({
                ...selectedContribution,
                edited_message: e.target.value
              })}
              rows="6"
              style={{ width: '100%', marginBottom: '1rem' }}
            />
            <PhotoManager
              photos={selectedContribution.photo_urls || []}
              onUpdate={(newPhotos) => setSelectedContribution({
                ...selectedContribution,
                photo_urls: newPhotos
              })}
            />
            <button onClick={() => setSelectedContribution(null)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
};

const statCardStyle = {
  background: 'white',
  padding: '1.5rem',
  borderRadius: '10px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  textAlign: 'center'
};

const modalStyle = {
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
};

const modalContentStyle = {
  background: 'white',
  padding: '2rem',
  borderRadius: '10px',
  maxWidth: '600px',
  width: '90%',
  maxHeight: '80vh',
  overflow: 'auto'
};

export default ContributionModerator;