// C:\Users\USER\bookfete\frontend\src\components\book\backcover\BackCoverEditor.js
import React from 'react';
import BackCoverPreview from './BackCoverPreview';

const backTemplates = [
  {
    id: 'classic',
    name: 'Classique',
    description: 'Liste simple des contributeurs',
    preview: '📘'
  },
  {
    id: 'elegant',
    name: 'Élégant',
    description: 'Avec citation et liste',
    preview: '📚'
  },
  {
    id: 'modern',
    name: 'Moderne',
    description: 'Design épuré',
    preview: '📖'
  }
];

const BackCoverEditor = ({ backCoverConfig, setBackCoverConfig, contributors, onSave, onCancel, isEditing }) => {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, color: '#17a2b8' }}>📘 Personnaliser la 4ème couverture</h2>
        {!isEditing ? (
          <button
            onClick={() => onSave('edit')}
            style={{
              padding: '0.6rem 1.2rem',
              background: '#17a2b8',
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

      <BackCoverPreview backCoverConfig={backCoverConfig} contributors={contributors} />

      {isEditing ? (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Style de la page
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              {backTemplates.map(t => (
                <div
                  key={t.id}
                  onClick={() => setBackCoverConfig({ ...backCoverConfig, template: t.id })}
                  style={{
                    padding: '1rem',
                    border: backCoverConfig.template === t.id ? '2px solid #17a2b8' : '1px solid #ddd',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: backCoverConfig.template === t.id ? '#e8f4fd' : 'white'
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
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={backCoverConfig.show_contributors}
                onChange={(e) => setBackCoverConfig({ ...backCoverConfig, show_contributors: e.target.checked })}
              />
              Afficher la liste des contributeurs
            </label>
            <small style={{ color: '#999', display: 'block', marginTop: '0.3rem' }}>
              {contributors.length} contributeur(s) trouvé(s)
            </small>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Message personnalisé (optionnel)
            </label>
            <textarea
              value={backCoverConfig.custom_text}
              onChange={(e) => setBackCoverConfig({ ...backCoverConfig, custom_text: e.target.value })}
              placeholder="ex: Merci à tous pour ces merveilleux souvenirs..."
              rows="4"
              style={{
                width: '100%',
                padding: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Couleur de fond
            </label>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {['#f5f5f5', '#ffffff', '#faf3e8', '#e8f4fd'].map(color => (
                <div
                  key={color}
                  onClick={() => setBackCoverConfig({ ...backCoverConfig, color })}
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    background: color,
                    cursor: 'pointer',
                    border: backCoverConfig.color === color ? '4px solid #17a2b8' : '2px solid transparent',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                  }}
                />
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
          borderLeft: '4px solid #17a2b8'
        }}>
          <strong>Configuration actuelle :</strong><br />
          Template : {backTemplates.find(t => t.id === backCoverConfig.template)?.name}<br />
          {contributors.length} contributeur(s) listé(s)
        </div>
      )}
    </div>
  );
};

export default BackCoverEditor;