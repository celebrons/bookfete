// C:\Users\USER\bookfete\frontend\src\components\ui\Tooltip.js
import React, { useState, useRef, useEffect } from 'react';

const Tooltip = ({ children, text, position = 'top' }) => {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const targetRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (show && targetRef.current && tooltipRef.current) {
      const targetRect = targetRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = targetRect.top - tooltipRect.height - 8;
          left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'bottom':
          top = targetRect.bottom + 8;
          left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'left':
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
          left = targetRect.left - tooltipRect.width - 8;
          break;
        case 'right':
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
          left = targetRect.right + 8;
          break;
        default:
          break;
      }

      // Éviter que le tooltip sorte de l'écran
      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }
      if (top < 10) top = 10;
      if (top + tooltipRect.height > window.innerHeight - 10) {
        top = window.innerHeight - tooltipRect.height - 10;
      }

      setCoords({ top, left });
    }
  }, [show, position]);

  return (
    <div
      ref={targetRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            backgroundColor: '#333',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            fontWeight: 'normal',
            letterSpacing: '0.3px'
          }}
        >
          {text}
          <div
            style={{
              position: 'absolute',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              ...(position === 'top' && {
                bottom: -6,
                left: '50%',
                transform: 'translateX(-50%)',
                borderTop: '6px solid #333'
              }),
              ...(position === 'bottom' && {
                top: -6,
                left: '50%',
                transform: 'translateX(-50%)',
                borderBottom: '6px solid #333'
              }),
              ...(position === 'left' && {
                right: -6,
                top: '50%',
                transform: 'translateY(-50%)',
                borderLeft: '6px solid #333'
              }),
              ...(position === 'right' && {
                left: -6,
                top: '50%',
                transform: 'translateY(-50%)',
                borderRight: '6px solid #333'
              })
            }}
          />
        </div>
      )}
    </div>
  );
};

export default Tooltip;