// C:\Users\USER\bookfete\frontend\src\components\create-book\Step1Type.js
import React from 'react';

const Step1Type = ({ bookData, setBookData, chapterTemplates, onNext }) => {
  const eventTypes = [
    { id: 'generique', label: 'Générique', icon: '📚' },
    { id: 'anniversaire', label: 'Anniversaire', icon: '🎂' },
    { id: 'mariage', label: 'Mariage', icon: '💍' },
    { id: 'naissance', label: 'Naissance', icon: '👶' },
    { id: 'depart', label: 'Départ', icon: '✈️' }
  ];

  const finitions = [
    { id: 'livret', label: 'Livret' },
    { id: 'classique', label: 'Classique' },
    { id: 'luxe', label: 'Luxe' }
  ];

  const papiers = [
    { id: 'satine', label: 'Satiné' },
    { id: 'mat', label: 'Mat' },
    { id: 'verge', label: 'Vergé Ivoire' }
  ];

  const styles = [
    { id: 'poetique', label: 'Poétique' },
    { id: 'factuel', label: 'Factuel' },
    { id: 'intime', label: 'Intime' }
  ];

  const currentTemplates = chapterTemplates[bookData.event_type] || chapterTemplates.generique;

  return (
    <div>
      {/* 1. Type / Finition / Papier / Style */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '10px'
      }}>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.3rem' }}>1. Type</div>
          <div style={{ fontWeight: 'bold' }}>{eventTypes.find(e => e.id === bookData.event_type)?.label}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.3rem' }}>2. Finition</div>
          <div style={{ fontWeight: 'bold' }}>{finitions.find(f => f.id === bookData.finition)?.label}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.3rem' }}>3. Papier</div>
          <div style={{ fontWeight: 'bold' }}>{papiers.find(p => p.id === bookData.papier)?.label}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.3rem' }}>4. Style</div>
          <div style={{ fontWeight: 'bold' }}>{styles.find(s => s.id === bookData.style_narratif)?.label}</div>
        </div>
      </div>

      {/* Titre */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{
          display: 'block',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#555'
        }}>
          2. Titre de votre livre <span style={{ color: '#dc3545' }}>*</span>
        </label>
        <input
          type="text"
          value={bookData.title}
          onChange={(e) => setBookData({ ...bookData, title: e.target.value })}
          placeholder="Ex: Les 60 ans de Maman, Notre Mariage..."
          style={{
            width: '100%',
            padding: '1rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '1rem'
          }}
        />
      </div>

      {/* Type d'événement */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{
          display: 'block',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#555'
        }}>
          3. Type d'événement <span style={{ color: '#dc3545' }}>*</span>
        </label>
        <select
          value={bookData.event_type}
          onChange={(e) => setBookData({ ...bookData, event_type: e.target.value })}
          style={{
            width: '100%',
            padding: '1rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '1rem',
            background: 'white'
          }}
        >
          {eventTypes.map(e => (
            <option key={e.id} value={e.id}>{e.icon} {e.label}</option>
          ))}
        </select>
        <p style={{
          margin: '0.5rem 0 0',
          fontSize: '0.9rem',
          color: '#666',
          fontStyle: 'italic'
        }}>
          Les chapitres et questions seront adaptés à votre type d'événement
        </p>
      </div>

      {/* Aperçu des chapitres */}
      <div style={{
        background: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '10px',
        marginBottom: '2rem'
      }}>
        <h3 style={{ margin: '0 0 1rem', color: '#764ba2', fontSize: '1.1rem' }}>
          📖 Chapitres proposés pour {eventTypes.find(e => e.id === bookData.event_type)?.label}
        </h3>
        
        <div style={{ display: 'grid', gap: '1rem' }}>
          {currentTemplates.map((chapter, index) => (
            <div key={index} style={{
              padding: '1rem',
              background: 'white',
              borderRadius: '8px',
              borderLeft: '4px solid #764ba2'
            }}>
              <strong>{chapter.title}</strong>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem', color: '#666' }}>
                {chapter.description}
              </p>
            </div>
          ))}
        </div>

        <p style={{
          margin: '1rem 0 0',
          fontSize: '0.9rem',
          color: '#666',
          fontStyle: 'italic',
          textAlign: 'center'
        }}>
          Vous pourrez modifier ces chapitres et leurs questions après la création
        </p>
      </div>

      {/* Aperçu du livre */}
      <div style={{
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
        padding: '1.5rem',
        borderRadius: '10px',
        marginBottom: '2rem',
        border: '1px solid #dee2e6'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.9rem', color: '#666' }}>Aperçu du livre</span>
            <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#764ba2' }}>24</span>
                <span style={{ marginLeft: '0.3rem', color: '#666' }}>chapitres</span>
              </div>
              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#764ba2' }}>96</span>
                <span style={{ marginLeft: '0.3rem', color: '#666' }}>pages</span>
              </div>
              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#764ba2' }}>3 min</span>
                <span style={{ marginLeft: '0.3rem', color: '#666' }}>/ chapitre</span>
              </div>
            </div>
          </div>
          <div style={{
            background: '#764ba2',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '20px',
            fontSize: '0.9rem'
          }}>
            Estimation
          </div>
        </div>
      </div>

      {/* Bouton suivant */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onNext}
          disabled={!bookData.title}
          style={{
            padding: '1rem 3rem',
            background: bookData.title ? '#28a745' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: bookData.title ? 'pointer' : 'not-allowed'
          }}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
};

export default Step1Type;