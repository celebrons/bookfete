// C:\Users\USER\bookfete\frontend\src\components\create-book\Step3Recap.js
import React from 'react';

const Step3Recap = ({ bookData, price, loading, onCreate, onPrevious }) => {
  const finitions = {
    livret: { label: 'Livret', price: 69 },
    classique: { label: 'Classique', price: 89 },
    luxe: { label: 'Luxe', price: 129 }
  };

  const papiers = {
    satine: { label: 'Satiné' },
    mat: { label: 'Mat' },
    verge: { label: 'Vergé Ivoire' }
  };

  const styles = {
    poetique: { label: 'Poétique' },
    factuel: { label: 'Factuel' },
    intime: { label: 'Intime' }
  };

  const eventTypes = {
    generique: { label: 'Générique', icon: '📚' },
    anniversaire: { label: 'Anniversaire', icon: '🎂' },
    mariage: { label: 'Mariage', icon: '💍' },
    naissance: { label: 'Naissance', icon: '👶' },
    depart: { label: 'Départ', icon: '✈️' }
  };

  const totalPrice = price + (bookData.pages - 96) * 0.25;

  return (
    <div>
      <h2 style={{ margin: '0 0 2rem', color: '#333', textAlign: 'center' }}>
        Vérifiez votre livre avant création
      </h2>

      {/* Récapitulatif visuel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Aperçu couverture */}
        <div style={{
          background: '#8B4513',
          height: '200px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontFamily: 'Playfair Display',
          padding: '1rem',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
        }}>
          <div>
            <div style={{ fontSize: '1.2rem', opacity: 0.8 }}>📕</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.5rem 0' }}>
              {bookData.title}
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
              {finitions[bookData.finition]?.label} · {papiers[bookData.papier]?.label}
            </div>
          </div>
        </div>

        {/* Stats clés */}
        <div style={{
          background: '#f8f9fa',
          padding: '1.5rem',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>Chapitres</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#764ba2' }}>24</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>Pages</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#764ba2' }}>{bookData.pages}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>Événement</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                {eventTypes[bookData.event_type]?.icon} {eventTypes[bookData.event_type]?.label}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>Style IA</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{styles[bookData.style_narratif]?.label}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Détails de la configuration */}
      <div style={{
        background: 'white',
        border: '1px solid #e9ecef',
        borderRadius: '10px',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#333' }}>Détails de votre édition</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <span style={{ color: '#666' }}>Finition :</span>{' '}
            <strong>{finitions[bookData.finition]?.label}</strong>
          </div>
          <div>
            <span style={{ color: '#666' }}>Papier :</span>{' '}
            <strong>{papiers[bookData.papier]?.label}</strong>
          </div>
          <div>
            <span style={{ color: '#666' }}>Pages :</span>{' '}
            <strong>{bookData.pages} pages</strong>
          </div>
          <div>
            <span style={{ color: '#666' }}>Chapitres :</span>{' '}
            <strong>24 chapitres</strong>
          </div>
        </div>
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
        <div style={{ fontSize: '4rem', fontWeight: 'bold', lineHeight: '1.2' }}>{Math.round(totalPrice)}€</div>
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
          ← Précédent
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
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {loading ? 'Création en cours...' : 'Créer mon livre 🚀'}
        </button>
      </div>

      {/* Note */}
      <p style={{
        marginTop: '2rem',
        fontSize: '0.9rem',
        color: '#666',
        textAlign: 'center',
        fontStyle: 'italic'
      }}>
        Vous pourrez modifier tous les chapitres et questions après la création
      </p>
    </div>
  );
};

export default Step3Recap;