// C:\Users\USER\bookfete\frontend\src\components\dashboard\BookCardLuxe.js
import React from 'react';
import { Link } from 'react-router-dom';
import Tooltip from '../ui/Tooltip';
import { IconArchive, IconRestore, IconDelete, IconChapter, IconContribution } from './DashboardIcons';
import './DashboardLuxe.css';

const BookCardLuxe = ({ 
  book, 
  onArchive, 
  onDelete, 
  onRestore, 
  showArchive = false, 
  showRestore = false,
  autoDeleteDate 
}) => {
  const getProgressColor = (statut) => {
    return statut === 'termine' ? 'var(--gold)' : 'var(--ink)';
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
    <div className="card" style={{ 
      position: 'relative',
      padding: 'var(--space-lg)',
      transition: 'all var(--transition-fast)'
    }}>
      {/* En-tête avec statut et boutons */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 'var(--space-md)'
      }}>
        <span className="label-gold" style={{
          padding: '4px 12px',
          borderRadius: '20px',
          background: getProgressColor(book.statut) === 'var(--gold)' 
            ? 'var(--gold-light)' 
            : 'var(--silk)',
          color: getProgressColor(book.statut),
          fontSize: '11px',
          marginBottom: 0
        }}>
          {getProgressText(book.statut)}
        </span>
        
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          {autoDeleteDate && (
            <Tooltip text={`Suppression auto le ${formatDate(autoDeleteDate)}`}>
              <span style={{
                fontSize: '11px',
                color: 'var(--text-light)',
                padding: '4px 8px',
                background: 'var(--silk)',
                borderRadius: 'var(--radius)',
                cursor: 'help'
              }}>
                📅
              </span>
            </Tooltip>
          )}

          {showArchive && (
            <Tooltip text="Archiver ce livre">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onArchive();
                }}
                className="btn-outline"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <IconArchive style={{ width: '14px', height: '14px' }} />
                Archiver
              </button>
            </Tooltip>
          )}

          {showRestore && (
            <Tooltip text="Restaurer ce livre">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRestore();
                }}
                className="btn-outline"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <IconRestore style={{ width: '14px', height: '14px' }} />
                Restaurer
              </button>
            </Tooltip>
          )}

          <Tooltip text="Supprimer définitivement">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="btn-outline"
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                borderColor: '#dc3545',
                color: '#dc3545'
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
              <IconDelete style={{ width: '14px', height: '14px' }} />
              Supprimer
            </button>
          </Tooltip>
        </div>
      </div>

      <Link to={`/book/${book.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <div style={{ fontSize: '40px', marginBottom: 'var(--space-sm)' }}>📖</div>
          <h3 style={{ 
            margin: '0 0 4px', 
            color: 'var(--ink)', 
            fontSize: '18px',
            fontWeight: '600'
          }}>
            {book.title}
          </h3>
          <p style={{ 
            margin: 0, 
            color: 'var(--text-light)', 
            fontSize: '13px' 
          }}>
            Créé le {new Date(book.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-md)',
          padding: 'var(--space-md) 0',
          borderTop: 'var(--border-fine)',
          borderBottom: 'var(--border-fine)',
          marginBottom: 'var(--space-md)'
        }}>
          <div>
            <div className="label-gold" style={{ fontSize: '10px', marginBottom: '4px' }}>
              Chapitres
            </div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconChapter style={{ width: '20px', height: '20px', color: 'var(--gold)' }} />
              {book.chapters?.[0]?.count || 0}
            </div>
          </div>
          <div>
            <div className="label-gold" style={{ fontSize: '10px', marginBottom: '4px' }}>
              Contributions
            </div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconContribution style={{ width: '20px', height: '20px', color: 'var(--gold)' }} />
              {contributionsCount}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          <span className="label-gold" style={{ 
            padding: '4px 8px',
            background: 'var(--silk)',
            color: 'var(--ink)',
            fontSize: '11px',
            marginBottom: 0
          }}>
            {book.finition || 'Classique'}
          </span>
          <span className="label-gold" style={{ 
            padding: '4px 8px',
            background: 'var(--silk)',
            color: 'var(--ink)',
            fontSize: '11px',
            marginBottom: 0
          }}>
            {book.papier || 'Mat'}
          </span>
          <span className="label-gold" style={{ 
            padding: '4px 8px',
            background: 'var(--silk)',
            color: 'var(--ink)',
            fontSize: '11px',
            marginBottom: 0
          }}>
            {book.event_type || 'Générique'}
          </span>
        </div>
      </Link>

      {autoDeleteDate && (
        <div style={{
          position: 'absolute',
          bottom: 'var(--space-sm)',
          right: 'var(--space-sm)',
          fontSize: '10px',
          color: 'var(--text-light)',
          fontStyle: 'italic'
        }}>
          Suppression: {formatDate(autoDeleteDate)}
        </div>
      )}
    </div>
  );
};

export default BookCardLuxe;