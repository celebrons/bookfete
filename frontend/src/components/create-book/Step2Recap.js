// C:\Users\USER\bookfete\frontend\src\components\create-book\Step2Recap.js
import React from 'react';

const Step2Recap = ({ bookData, price, loading, onCreate, onPrevious, chapters }) => {
  const eventLabels = {
    generique: 'Générique',
    anniversaire: 'Anniversaire',
    mariage: 'Mariage',
    naissance: 'Naissance',
    depart: 'Départ'
  };

  const finitionLabels = {
    livret: 'Livret (souple)',
    classique: 'Classique (rigide)',
    luxe: 'Luxe (toilé)'
  };

  const papierLabels = {
    satine: 'Satiné - Brillant',
    mat: 'Mat - Doux',
    verge: 'Vergé Ivoire - Texturé'
  };

  const styleLabels = {
    poetique: 'Poétique',
    factuel: 'Factuel',
    intime: 'Intime'
  };

  return (
    <div>
      <h2 style={{ marginBottom: '2rem', color: '#333', textAlign: 'center' }}>
        Vérifiez votre configuration
      </h2>

      {/* Récapitulatif des choix */}
      <div style={{
        background: '#f8f9fa',
        padding: '2rem',
        borderRadius: '10px',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>Titre</div>
            <div style={{ fontWeight: 'bold' }}>{bookData.title}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>Événement</div>
            <div style={{ fontWeight: 'bold' }}>{eventLabels[bookData.event_type]}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>Finition</div>
            <div style={{ fontWeight: 'bold' }}>{finitionLabels[bookData.finition]}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>Papier</div>
            <div style={{ fontWeight: 'bold' }}>{papierLabels[bookData.papier]}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>Style</div>
            <div style={{ fontWeight: 'bold' }}>{styleLabels[bookData.style_narratif]}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>Pages</div>
            <div style={{ fontWeight: 'bold' }}>{bookData.pages} pages</div>
          </div>
        </div>
      </div>

      {/* Aperçu des chapitres qui seront créés */}
      <div style={{
        background: 'white',
        border: '1px solid #e9ecef',
        borderRadius: '10px',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h3 style={{ margin: '0 0 1rem', color: '#764ba2' }}>
          📖 {chapters.length} chapitres seront créés
        </h3>
        <p style={{ marginBottom: '1rem', color: '#666' }}>
          Après validation, votre livre contiendra ces chapitres :
        </p>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
          gap: '0.5rem',
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '0.5rem',
          background: '#f8f9fa',
          borderRadius: '8px'
        }}>
          {chapters.map((ch, index) => (
            <div key={index} style={{
              padding: '0.5rem',
              borderBottom: '1px solid #e9ecef',
              fontSize: '0.95rem'
            }}>
              • {ch.title}
            </div>
          ))}
        </div>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#999', fontStyle: 'italic' }}>
          * Vous pourrez modifier ces chapitres après la création
        </p>
      </div>

      {/* Prix final */}
      <div style={{
        background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
        padding: '2rem',
        borderRadius: '10px',
        color: 'white',
        textAlign: 'center',
        marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '1.1rem', opacity: 0.9 }}>Total à payer</div>
        <div style={{ fontSize: '4rem', fontWeight: 'bold', lineHeight: '1.2' }}>{Math.round(price)}€</div>
        <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>TTC • Livraison offerte</div>
      </div>

      {/* Boutons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <button
          onClick={onPrevious}
          disabled={loading}
          style={{
            padding: '1rem 2rem',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1
          }}
        >
          ← Modifier
        </button>
        <button
          onClick={onCreate}
          disabled={loading}
          style={{
            padding: '1rem 3rem',
            background: loading ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Création en cours...' : '🚀 Créer mon livre'}
        </button>
      </div>
    </div>
  );
};

export default Step2Recap;