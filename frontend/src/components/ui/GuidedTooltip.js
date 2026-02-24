// C:\Users\USER\bookfete\frontend\src\components\ui\GuidedTooltip.js
import React, { useState } from 'react';

const GuidedTooltip = ({ children, title, description, steps, position = 'right' }) => {
  const [show, setShow] = useState(false);

  const positions = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)' }
  };

  const arrows = {
    top: {
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      borderLeft: '8px solid transparent',
      borderRight: '8px solid transparent',
      borderTop: '8px solid #333'
    },
    bottom: {
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      borderLeft: '8px solid transparent',
      borderRight: '8px solid transparent',
      borderBottom: '8px solid #333'
    },
    left: {
      left: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      borderTop: '8px solid transparent',
      borderBottom: '8px solid transparent',
      borderLeft: '8px solid #333'
    },
    right: {
      right: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      borderTop: '8px solid transparent',
      borderBottom: '8px solid transparent',
      borderRight: '8px solid #333'
    }
  };

  return (
    <div 
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute',
          ...positions[position],
          backgroundColor: '#333',
          color: 'white',
          padding: '1rem',
          borderRadius: '8px',
          minWidth: '250px',
          maxWidth: '300px',
          zIndex: 1000,
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          fontSize: '0.9rem',
          lineHeight: '1.5'
        }}>
          {/* Titre */}
          {title && (
            <div style={{ 
              fontWeight: 'bold', 
              marginBottom: '0.5rem',
              color: '#b8924a',
              fontSize: '1rem'
            }}>
              {title}
            </div>
          )}
          
          {/* Description */}
          {description && (
            <div style={{ marginBottom: steps ? '1rem' : 0 }}>
              {description}
            </div>
          )}
          
          {/* Étapes */}
          {steps && steps.length > 0 && (
            <div>
              {steps.map((step, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  alignItems: 'flex-start'
                }}>
                  <span style={{
                    background: '#764ba2',
                    color: 'white',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    flexShrink: 0
                  }}>
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Flèche */}
          <div style={{
            position: 'absolute',
            width: 0,
            height: 0,
            ...arrows[position]
          }} />
        </div>
      )}
    </div>
  );
};

export default GuidedTooltip;