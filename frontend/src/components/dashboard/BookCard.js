// C:\Users\USER\bookfete\frontend\src\components\dashboard\BookCard.js
import React from 'react';
import { Link } from 'react-router-dom';

const BookCard = ({ book, onDelete }) => {
  const getProgressColor = (statut) => {
    return statut === 'termine' ? '#28a745' : '#ffc107';
  };

  const getProgressText = (statut) => {
    return statut === 'termine' ? 'Terminé' : 'En cours';
  };

  // Calculer le nombre de contributions
  const contributionsCount = book.contributions?.reduce((acc, ch) => 
    acc + (ch.contributions?.[0]?.count || 0), 0) || 0;

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
      border: '1px solid #e9ecef',
      transition: 'all 0.3s',
      position: 'relative'
    }}>
      {/* En-tête avec statut et bouton suppression */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <span style={{
          padding: '0.3rem 0.8rem',
          borderRadius: '20px',
          fontSize: '0.8rem',
          background: getProgressColor(book.statut),
          color: 'white',
          fontWeight: '500'
        }}>
          {getProgressText(book.statut)}
        </span>
        
        {/* BOUTON SUPPRESSION - ICI */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          style={{
            padding: '0.4rem 0.8rem',
            background: 'transparent',
            color: '#dc3545',
            border: '1px solid #dc3545',
            borderRadius: '6px',
            fontSize: '0.8rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#dc3545';
            e.target.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.color = '#dc3545';
          }}
        >
          <span>🗑️</span>
          Supprimer
        </button>
      </div>

      <Link to={`/book/${book.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        {/* Icône et titre */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📖</div>
          <h3 style={{ margin: '0 0 0.3rem', color: '#333', fontSize: '1.2rem' }}>
            {book.title}
          </h3>
          <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
            Créé le {new Date(book.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>

        {/* Statistiques */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          padding: '1rem 0',
          borderTop: '1px solid #e9ecef',
          borderBottom: '1px solid #e9ecef',
          marginBottom: '1rem'
        }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Chapitres</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#764ba2' }}>
              {book.chapters?.[0]?.count || 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Contributions</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#17a2b8' }}>
              {contributionsCount}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            padding: '0.2rem 0.6rem',
            background: '#f3e8ff',
            color: '#764ba2',
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}>
            {book.finition || 'Classique'}
          </span>
          <span style={{
            padding: '0.2rem 0.6rem',
            background: '#e8f4fd',
            color: '#0c5460',
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}>
            {book.papier || 'Mat'}
          </span>
          <span style={{
            padding: '0.2rem 0.6rem',
            background: '#d4edda',
            color: '#155724',
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}>
            {book.event_type || 'Générique'}
          </span>
        </div>
      </Link>
    </div>
  );
};

export default BookCard;