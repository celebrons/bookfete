// C:\Users\USER\bookfete\frontend\src\components\book\backcover\BackCoverPreview.js
import React from 'react';

const BackCoverPreview = ({ backCoverConfig, contributors }) => {
  return (
    <div style={{
      width: '100%',
      minHeight: '300px',
      background: backCoverConfig.color,
      borderRadius: '8px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      padding: '2rem',
      color: '#333',
      position: 'relative',
      overflow: 'hidden',
      marginBottom: '1rem'
    }}>
      {backCoverConfig.template === 'classic' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '10px',
          background: 'linear-gradient(90deg, #b8924a, #d4af37)'
        }} />
      )}
      
      {backCoverConfig.template === 'elegant' && (
        <div style={{
          position: 'absolute',
          top: '2rem',
          left: '2rem',
          fontSize: '4rem',
          opacity: 0.1,
          transform: 'rotate(-15deg)'
        }}>
          ✨
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3 style={{ 
          margin: '0 0 1.5rem',
          color: '#b8924a',
          fontSize: '1.3rem'
        }}>
          Cet ouvrage a été rédigé par :
        </h3>

        {backCoverConfig.show_contributors && (
          <div style={{ marginBottom: '1.5rem' }}>
            {contributors.length > 0 ? (
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                columns: contributors.length > 5 ? '2' : '1',
                columnGap: '2rem'
              }}>
                {contributors.map((name, index) => (
                  <li key={index} style={{
                    marginBottom: '0.5rem',
                    fontSize: '1rem',
                    borderBottom: '1px dotted #ddd',
                    paddingBottom: '0.3rem'
                  }}>
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontStyle: 'italic', color: '#999' }}>
                Aucun contributeur pour l'instant
              </p>
            )}
          </div>
        )}

        {backCoverConfig.custom_text && (
          <div style={{
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '2px solid #e8e8e8',
            fontStyle: 'italic',
            color: '#666'
          }}>
            {backCoverConfig.custom_text}
          </div>
        )}
      </div>
    </div>
  );
};

export default BackCoverPreview;