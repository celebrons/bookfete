// C:\Users\USER\bookfete\frontend\src\components\book\cover\CoverEditor.js
import React from 'react';
import CoverPreview from './CoverPreview';

const coverTemplates = [
  {
    id: 'classic',
    name: 'Classique',
    description: 'Élégant et intemporel',
    preview: '📕',
    colors: ['#8B4513', '#2C3E50', '#27AE60']
  },
  {
    id: 'modern',
    name: 'Moderne',
    description: 'Design contemporain',
    preview: '📘',
    colors: ['#000000', '#4A235A', '#1A5276']
  },
  {
    id: 'minimal',
    name: 'Minimaliste',
    description: 'Sobre et épuré',
    preview: '📗',
    colors: ['#FFFFFF', '#F5F5F5', '#E8E8E8']
  }
];

const fonts = [
  { id: 'Playfair Display', name: 'Élégante' },
  { id: 'Montserrat', name: 'Moderne' },
  { id: 'Lato', name: 'Lisible' }
];

const CoverEditor = ({ coverConfig, setCoverConfig, book, onSave, onCancel, isEditing }) => {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, color: '#b8924a' }}>📕 Personnaliser la couverture</h2>
        {!isEditing ? (
          <button
            onClick={() => onSave('edit')}
            style={{
              padding: '0.6rem 1.2rem',
              background: '#b8924a',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            ✏️ Modifier
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '0.6rem 1.2rem',
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
              onClick={onSave}
              style={{
                padding: '0.6rem 1.2rem',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Enregistrer
            </button>
          </div>
        )}
      </div>

      <CoverPreview coverConfig={coverConfig} book={book} />

      {isEditing ? (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Titre personnalisé
            </label>
            <input
              type="text"
              value={coverConfig.title}
              onChange={(e) => setCoverConfig({ ...coverConfig, title: e.target.value })}
              placeholder="ex: Pour toi Gégé"
              style={{
                width: '100%',
                padding: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Sous-titre (optionnel)
            </label>
            <input
              type="text"
              value={coverConfig.subtitle}
              onChange={(e) => setCoverConfig({ ...coverConfig, subtitle: e.target.value })}
              placeholder="ex: 50 ans de souvenirs"
              style={{
                width: '100%',
                padding: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Style de couverture
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              {coverTemplates.map(t => (
                <div
                  key={t.id}
                  onClick={() => setCoverConfig({ ...coverConfig, template: t.id })}
                  style={{
                    padding: '1rem',
                    border: coverConfig.template === t.id ? '2px solid #b8924a' : '1px solid #ddd',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: coverConfig.template === t.id ? '#fff3e0' : 'white'
                  }}
                >
                  <div style={{ fontSize: '2rem' }}>{t.preview}</div>
                  <h4 style={{ margin: '0.3rem 0', fontSize: '0.9rem' }}>{t.name}</h4>
                  <small>{t.description}</small>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Couleur principale
            </label>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {coverTemplates.find(t => t.id === coverConfig.template)?.colors.map(color => (
                <div
                  key={color}
                  onClick={() => setCoverConfig({ ...coverConfig, color })}
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    background: color,
                    cursor: 'pointer',
                    border: coverConfig.color === color ? '4px solid #b8924a' : '2px solid transparent',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Police d'écriture
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              {fonts.map(f => (
                <div
                  key={f.id}
                  onClick={() => setCoverConfig({ ...coverConfig, font: f.id })}
                  style={{
                    padding: '1rem',
                    border: coverConfig.font === f.id ? '2px solid #b8924a' : '1px solid #ddd',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    fontFamily: f.id,
                    background: coverConfig.font === f.id ? '#fff3e0' : 'white'
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>Aa</span>
                  <small style={{ display: 'block', marginTop: '0.3rem' }}>{f.name}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '1rem',
          background: '#f8f9fa',
          borderRadius: '5px',
          color: '#666',
          borderLeft: '4px solid #b8924a'
        }}>
          <strong>Configuration actuelle :</strong><br />
          Template : {coverTemplates.find(t => t.id === coverConfig.template)?.name}<br />
          Police : {fonts.find(f => f.id === coverConfig.font)?.name}
        </div>
      )}
    </div>
  );
};

export default CoverEditor;