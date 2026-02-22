// C:\Users\USER\bookfete\frontend\src\components\book\CoverEditor.js
import React, { useState } from 'react';

const CoverEditor = ({ book, onUpdateBook }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [coverConfig, setCoverConfig] = useState(
    book.cover_config || {
      title: book.title || '',
      subtitle: '',
      template: 'classic',
      color: '#8B4513',
      font: 'Playfair Display'
    }
  );

  // Templates disponibles
  const templates = [
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

  // Polices disponibles
  const fonts = [
    { id: 'Playfair Display', name: 'Élégante', style: 'font-family: Playfair Display, serif' },
    { id: 'Montserrat', name: 'Moderne', style: 'font-family: Montserrat, sans-serif' },
    { id: 'Lato', name: 'Lisible', style: 'font-family: Lato, sans-serif' }
  ];

  const handleSave = () => {
    onUpdateBook({ cover_config: coverConfig });
    setIsEditing(false);
  };

  // Aperçu de la couverture
  const CoverPreview = () => (
    <div style={{
      width: '100%',
      height: '400px',
      background: coverConfig.color,
      borderRadius: '8px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem',
      textAlign: 'center',
      color: coverConfig.color === '#FFFFFF' ? '#333' : 'white',
      fontFamily: coverConfig.font,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Décor selon le template */}
      {coverConfig.template === 'classic' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          border: '20px solid rgba(255,255,255,0.1)',
          pointerEvents: 'none'
        }} />
      )}
      
      {coverConfig.template === 'modern' && (
        <div style={{
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          pointerEvents: 'none'
        }} />
      )}

      <h1 style={{
        fontSize: '3rem',
        margin: '0 0 1rem',
        fontWeight: 'bold',
        textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
        position: 'relative',
        zIndex: 2
      }}>
        {coverConfig.title || 'Titre du livre'}
      </h1>
      
      {coverConfig.subtitle && (
        <p style={{
          fontSize: '1.2rem',
          margin: '0',
          opacity: 0.9,
          fontStyle: 'italic',
          position: 'relative',
          zIndex: 2
        }}>
          {coverConfig.subtitle}
        </p>
      )}

      <div style={{
        position: 'absolute',
        bottom: '2rem',
        right: '2rem',
        fontSize: '0.9rem',
        opacity: 0.6,
        zIndex: 2
      }}>
        {templates.find(t => t.id === coverConfig.template)?.name}
      </div>
    </div>
  );

  if (isEditing) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ margin: '0 0 2rem', color: '#333' }}>📕 Personnaliser la couverture</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Colonne gauche : Éditeur */}
          <div>
            {/* Titre personnalisé */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                color: '#555'
              }}>
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
              <small style={{ color: '#999', display: 'block', marginTop: '0.3rem' }}>
                Laissez vide pour utiliser le titre du livre
              </small>
            </div>

            {/* Sous-titre (optionnel) */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                color: '#555'
              }}>
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

            {/* Choix du template */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
                color: '#555'
              }}>
                Style de couverture
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                {templates.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setCoverConfig({ ...coverConfig, template: t.id })}
                    style={{
                      padding: '1rem',
                      border: coverConfig.template === t.id ? '2px solid #764ba2' : '1px solid #ddd',
                      borderRadius: '8px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: coverConfig.template === t.id ? '#f3e8ff' : 'white'
                    }}
                  >
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{t.preview}</div>
                    <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.9rem' }}>{t.name}</h4>
                    <small style={{ color: '#666' }}>{t.description}</small>
                  </div>
                ))}
              </div>
            </div>

            {/* Choix de la couleur */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
                color: '#555'
              }}>
                Couleur principale
              </label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {templates.find(t => t.id === coverConfig.template)?.colors.map(color => (
                  <div
                    key={color}
                    onClick={() => setCoverConfig({ ...coverConfig, color })}
                    style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      background: color,
                      cursor: 'pointer',
                      border: coverConfig.color === color ? '4px solid #764ba2' : '2px solid transparent',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Choix de la police */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
                color: '#555'
              }}>
                Police d'écriture
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                {fonts.map(f => (
                  <div
                    key={f.id}
                    onClick={() => setCoverConfig({ ...coverConfig, font: f.id })}
                    style={{
                      padding: '1rem',
                      border: coverConfig.font === f.id ? '2px solid #764ba2' : '1px solid #ddd',
                      borderRadius: '8px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      fontFamily: f.id,
                      background: coverConfig.font === f.id ? '#f3e8ff' : 'white'
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>Aa</span>
                    <small style={{ display: 'block', marginTop: '0.3rem' }}>{f.name}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Colonne droite : Aperçu */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#555'
            }}>
              Aperçu en direct
            </label>
            <CoverPreview />
          </div>
        </div>

        {/* Boutons d'action */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
          <button
            onClick={() => setIsEditing(false)}
            style={{
              padding: '0.8rem 2rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.8rem 2rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            Enregistrer la couverture
          </button>
        </div>
      </div>
    );
  }

  // Mode visualisation
  return (
    <div style={{
      background: 'white',
      borderRadius: '10px',
      padding: '2rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, color: '#333' }}>📕 Couverture du livre</h2>
        <button
          onClick={() => setIsEditing(true)}
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
          ✏️ Personnaliser
        </button>
      </div>

      <CoverPreview />

      <p style={{
        marginTop: '2rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '5px',
        color: '#666',
        fontSize: '0.9rem',
        borderLeft: '4px solid #b8924a'
      }}>
        <strong>📌 Information :</strong> La couverture apparaîtra au début du livre, 
        avant le premier chapitre. Vous pouvez la personnaliser à tout moment.
      </p>
    </div>
  );
};

export default CoverEditor;