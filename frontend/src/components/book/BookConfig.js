// C:\Users\USER\bookfete\frontend\src\components\book\BookConfig.js
import React, { useState } from 'react';

const BookConfig = ({ book, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: book.title,
    finition: book.finition,
    papier: book.papier,
    style_narratif: book.style_narratif
  });

  const finitions = [
    { id: 'livret', label: 'Livret', icon: '📘' },
    { id: 'classique', label: 'Classique', icon: '📕' },
    { id: 'luxe', label: 'Luxe', icon: '📚' }
  ];

  const papiers = [
    { id: 'satine', label: 'Satiné', icon: '✨' },
    { id: 'mat', label: 'Mat', icon: '🎨' },
    { id: 'verge', label: 'Vergé Ivoire', icon: '📜' }
  ];

  const styles = [
    { id: 'poetique', label: 'Poétique', icon: '🌸' },
    { id: 'factuel', label: 'Factuel', icon: '📰' },
    { id: 'intime', label: 'Intime', icon: '💝' }
  ];

  const handleSave = () => {
    onUpdate(formData);
    setIsEditing(false);
  };

  return (
    <div style={{
      background: 'white',
      padding: '2rem',
      borderRadius: '10px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h2>Configuration du livre</h2>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            style={{
              padding: '0.5rem 1rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            ✏️ Modifier
          </button>
        )}
      </div>

      {!isEditing ? (
        // Mode visualisation
        <div>
          <p><strong>Titre :</strong> {book.title}</p>
          <p><strong>Finition :</strong> {finitions.find(f => f.id === book.finition)?.label}</p>
          <p><strong>Papier :</strong> {papiers.find(p => p.id === book.papier)?.label}</p>
          <p><strong>Style narratif :</strong> {styles.find(s => s.id === book.style_narratif)?.label}</p>
        </div>
      ) : (
        // Mode édition
        <div>
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Titre du livre
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '5px'
              }}
            />
          </div>

          <h3>Finition</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            {finitions.map(f => (
              <div
                key={f.id}
                onClick={() => setFormData(prev => ({ ...prev, finition: f.id }))}
                style={{
                  padding: '1rem',
                  background: formData.finition === f.id ? '#f3e8ff' : '#f8f9fa',
                  border: formData.finition === f.id ? '2px solid #764ba2' : '1px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <span style={{ fontSize: '2rem' }}>{f.icon}</span>
                <p style={{ margin: '0.5rem 0 0', fontWeight: 'bold' }}>{f.label}</p>
              </div>
            ))}
          </div>

          <h3>Papier</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            {papiers.map(p => (
              <div
                key={p.id}
                onClick={() => setFormData(prev => ({ ...prev, papier: p.id }))}
                style={{
                  padding: '1rem',
                  background: formData.papier === p.id ? '#f3e8ff' : '#f8f9fa',
                  border: formData.papier === p.id ? '2px solid #764ba2' : '1px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <span style={{ fontSize: '2rem' }}>{p.icon}</span>
                <p style={{ margin: '0.5rem 0 0', fontWeight: 'bold' }}>{p.label}</p>
              </div>
            ))}
          </div>

          <h3>Style narratif</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            {styles.map(s => (
              <div
                key={s.id}
                onClick={() => setFormData(prev => ({ ...prev, style_narratif: s.id }))}
                style={{
                  padding: '1rem',
                  background: formData.style_narratif === s.id ? '#f3e8ff' : '#f8f9fa',
                  border: formData.style_narratif === s.id ? '2px solid #764ba2' : '1px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <span style={{ fontSize: '2rem' }}>{s.icon}</span>
                <p style={{ margin: '0.5rem 0 0', fontWeight: 'bold' }}>{s.label}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsEditing(false)}
              style={{
                padding: '0.8rem 1.5rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '0.8rem 1.5rem',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              💾 Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookConfig;