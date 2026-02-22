// C:\Users\USER\bookfete\frontend\src\components\book\cover\CoverPreview.js
import React from 'react';

const CoverPreview = ({ coverConfig, book }) => {
  return (
    <div style={{
      width: '100%',
      minHeight: '300px',
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
      overflow: 'hidden',
      marginBottom: '1rem'
    }}>
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
        fontSize: '2.5rem',
        margin: '0 0 1rem',
        fontWeight: 'bold',
        textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
        position: 'relative',
        zIndex: 2
      }}>
        {coverConfig.title || book?.title || 'Titre du livre'}
      </h1>
      
      {coverConfig.subtitle && (
        <p style={{
          fontSize: '1.1rem',
          margin: '0',
          opacity: 0.9,
          fontStyle: 'italic',
          position: 'relative',
          zIndex: 2
        }}>
          {coverConfig.subtitle}
        </p>
      )}
    </div>
  );
};

export default CoverPreview;