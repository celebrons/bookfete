// frontend/src/components/organisateur/editor/ToneSelector.js
import React from 'react';

const ToneSelector = ({ selectedTone, onSelect }) => {
  const tones = [
    { id: 'emotionnel', label: 'Émotionnel', icon: '❤️', color: '#e83e8c' },
    { id: 'drole', label: 'Drôle', icon: '😂', color: '#ffc107' },
    { id: 'solemnel', label: 'Solennel', icon: '🎗️', color: '#6c757d' },
    { id: 'inspirant', label: 'Inspirant', icon: '✨', color: '#17a2b8' },
    { id: 'professionnel', label: 'Professionnel', icon: '💼', color: '#007bff' },
    { id: 'poetique', label: 'Poétique', icon: '📜', color: '#6610f2' },
    { id: 'minimaliste', label: 'Minimaliste', icon: '◻️', color: '#343a40' }
  ];

  return (
    <div>
      <h3>Choisissez le ton du livre</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '1rem',
        marginTop: '1rem'
      }}>
        {tones.map(tone => (
          <div
            key={tone.id}
            onClick={() => onSelect(tone.id)}
            style={{
              padding: '1rem',
              background: selectedTone === tone.id ? tone.color : '#f8f9fa',
              color: selectedTone === tone.id ? 'white' : '#333',
              borderRadius: '10px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
              border: selectedTone === tone.id ? 'none' : '2px solid #eee'
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{tone.icon}</div>
            <div style={{ fontWeight: 'bold' }}>{tone.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ToneSelector;