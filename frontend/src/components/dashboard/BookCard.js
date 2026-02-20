// C:\Users\USER\bookfete\frontend\src\components\dashboard\BookCard.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const BookCard = ({ book, type, onDelete }) => {
  const navigate = useNavigate();
  const [showActions, setShowActions] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getFinitionIcon = (finition) => {
    switch(finition) {
      case 'livret': return '📘';
      case 'classique': return '📕';
      case 'luxe': return '📚';
      default: return '📖';
    }
  };

  const getStyleIcon = (style) => {
    switch(style) {
      case 'poetique': return '🌸';
      case 'factuel': return '📰';
      case 'intime': return '💝';
      default: return '✨';
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement le livre "${book.title}" ?`)) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', book.id);

      if (error) throw error;
      
      if (onDelete) onDelete(book.id);
      
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const handleOrderMore = (e) => {
    e.stopPropagation();
    navigate(`/book/${book.id}/order-more`);
  };

  const stats = {
    chapitres: book.chapters?.length || 0,
    contributions: book.chapters?.reduce((acc, ch) => 
      acc + (ch.contributions?.[0]?.count || 0), 0) || 0
  };

  // ✅ Correction : extraire l'année de création
  const creationYear = new Date(book.created_at).toLocaleDateString('fr-FR').split('/')[2];

  return (
    <div
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      style={{
        background: 'white',
        borderRadius: '10px',
        padding: '1.5rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
        opacity: deleting ? 0.5 : 1,
        pointerEvents: deleting ? 'none' : 'auto',
        border: type === 'termine' ? '2px solid #28a745' : 'none'
      }}
      onClick={() => navigate(`/book/${book.id}`)}
      onMouseEnter={(e) => !deleting && (e.currentTarget.style.transform = 'translateY(-5px)')}
      onMouseLeave={(e) => !deleting && (e.currentTarget.style.transform = 'translateY(0)')}
    >
      {/* Badge de statut */}
      <div style={{
        position: 'absolute',
        top: '-5px',
        right: '-5px',
        background: type === 'en_cours' ? '#ffc107' : '#28a745',
        color: type === 'en_cours' ? '#333' : 'white',
        padding: '0.3rem 0.8rem',
        borderRadius: '20px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
      }}>
        {type === 'en_cours' ? '📝 En cours' : '✅ Terminé'}
      </div>

      {/* Actions rapides (au survol) */}
      {showActions && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          display: 'flex',
          gap: '0.5rem',
          zIndex: 10
        }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/book/${book.id}/edit`);
            }}
            style={{
              padding: '0.3rem 0.8rem',
              background: 'white',
              border: '1px solid #764ba2',
              color: '#764ba2',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            ✏️ Modifier
          </button>
          <button
            onClick={handleDelete}
            style={{
              padding: '0.3rem 0.8rem',
              background: 'white',
              border: '1px solid #dc3545',
              color: '#dc3545',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            🗑️ Supprimer
          </button>
        </div>
      )}

      {/* Icônes de configuration */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem'
      }}>
        <span style={{ fontSize: '2rem' }}>{getFinitionIcon(book.finition)}</span>
        <span style={{ fontSize: '1.5rem' }}>{getStyleIcon(book.style_narratif)}</span>
      </div>

      {/* Titre */}
      <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem' }}>{book.title}</h3>

      {/* Statistiques */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '1rem',
        padding: '0.5rem 0',
        borderTop: '1px solid #eee',
        borderBottom: '1px solid #eee'
      }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#764ba2' }}>
            {stats.chapitres}
          </span>
          <span style={{ display: 'block', fontSize: '0.8rem', color: '#666' }}>
            chapitre{stats.chapitres > 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ffc107' }}>
            {stats.contributions}
          </span>
          <span style={{ display: 'block', fontSize: '0.8rem', color: '#666' }}>
            contribution{stats.contributions > 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ textAlign: 'center' }}>
          {/* ✅ CORRIGÉ : affiche l'année au lieu du jour */}
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#17a2b8' }}>
            {creationYear}
          </span>
          <span style={{ display: 'block', fontSize: '0.8rem', color: '#666' }}>
            créé en
          </span>
        </div>
      </div>

      {/* Bouton supplémentaire pour les livres terminés */}
      {type === 'termine' && (
        <button
          onClick={handleOrderMore}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: 'white',
            color: '#764ba2',
            border: '2px solid #764ba2',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#764ba2';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
            e.currentTarget.style.color = '#764ba2';
          }}
        >
          📦 Commander d'autres exemplaires
        </button>
      )}
    </div>
  );
};

export default BookCard;