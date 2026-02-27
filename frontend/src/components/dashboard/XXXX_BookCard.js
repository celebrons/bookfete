// C:\Users\USER\bookfete\frontend\src\components\dashboard\BookCard.js
import React from 'react';
import { Link } from 'react-router-dom';
import Tooltip from '../ui/Tooltip';

const BookCard = ({ 
  book, 
  onArchive, 
  onDelete, 
  onRestore, 
  showArchive = false, 
  showRestore = false,
  autoDeleteDate 
}) => {
  const getProgressColor = (statut) => {
    return statut === 'termine' ? '#28a745' : '#ffc107';
  };

  const getProgressText = (statut) => {
    return statut === 'termine' ? 'Terminé' : 'En cours';
  };

  const contributionsCount = book.contributions?.reduce((acc, ch) => 
    acc + (ch.contributions?.[0]?.count || 0), 0) || 0;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
  };

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
      {/* En-tête avec statut et boutons discrets */}
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
        
        {/* Boutons discrets en haut à droite */}
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {/* Date de suppression automatique pour les archivés (affichée discrètement) */}
          {autoDeleteDate && (
            <Tooltip text={`Suppression auto le ${formatDate(autoDeleteDate)}`}>
              <span style={{
                fontSize: '0.7rem',
                color: '#999',
                padding: '0.2rem 0.4rem',
                background: '#f8f9fa',
                borderRadius: '4px',
                cursor: 'help'
              }}>
                📅
              </span>
            </Tooltip>
          )}

          {/* Bouton Archiver (discret) */}
          {showArchive && (
            <Tooltip text="Archiver ce livre">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onArchive();
                }}
                style={{
                  padding: '0.2rem 0.5rem',
                  background: 'transparent',
                  color: '#ffc107',
                  border: '1px solid #ffc107',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#ffc107';
                  e.target.style.color = '#333';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'transparent';
                  e.target.style.color = '#ffc107';
                }}
              >
                <span>📦</span>
                Archiver
              </button>
            </Tooltip>
          )}

          {/* Bouton Restaurer (discret) */}
          {showRestore && (
            <Tooltip text="Restaurer ce livre">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRestore();
                }}
                style={{
                  padding: '0.2rem 0.5rem',
                  background: 'transparent',
                  color: '#28a745',
                  border: '1px solid #28a745',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#28a745';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'transparent';
                  e.target.style.color = '#28a745';
                }}
              >
                <span>↻</span>
                Restaurer
              </button>
            </Tooltip>
          )}

          {/* Bouton Supprimer (discret) - comme avant */}
          <Tooltip text="Supprimer définitivement">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              style={{
                padding: '0.2rem 0.5rem',
                background: 'transparent',
                color: '#dc3545',
                border: '1px solid #dc3545',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
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
          </Tooltip>
        </div>
      </div>

      {/* Date de suppression auto en petit (alternative) */}
      {autoDeleteDate && (
        <div style={{
          position: 'absolute',
          bottom: '0.5rem',
          right: '0.5rem',
          fontSize: '0.65rem',
          color: '#999',
          fontStyle: 'italic'
        }}>
          Suppression: {formatDate(autoDeleteDate)}
        </div>
      )}

      <Link to={`/book/${book.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📖</div>
          <h3 style={{ margin: '0 0 0.3rem', color: '#333', fontSize: '1.2rem' }}>
            {book.title}
          </h3>
          <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
            Créé le {new Date(book.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>

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