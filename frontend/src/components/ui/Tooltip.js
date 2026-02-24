// C:\Users\USER\bookfete\frontend\src\components\ui\Tooltip.js
import React, { useState } from 'react';

const Tooltip = ({ children, text, position = 'top' }) => {
  const [show, setShow] = useState(false);

  const positions = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)' }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
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
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          fontSize: '0.85rem',
          whiteSpace: 'nowrap',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          pointerEvents: 'none'
        }}>
          {text}
          <div style={{
            position: 'absolute',
            width: '0',
            height: '0',
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            ...(position === 'top' && {
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              borderTop: '6px solid #333'
            }),
            ...(position === 'bottom' && {
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              borderBottom: '6px solid #333'
            })
          }} />
        </div>
      )}
    </div>
  );
};

export default Tooltip;