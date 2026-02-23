// C:\Users\USER\bookfete\frontend\src\components\home\WhyChooseSection.js
import React from 'react';

const WhyChooseSection = () => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '4rem',
      alignItems: 'center'
    }}>
      <div>
        <h2 style={{
          fontSize: '2.5rem',
          color: '#333',
          marginBottom: '1.5rem'
        }}>
          Pourquoi choisir ce livre ?
        </h2>
        <p style={{
          fontSize: '1.1rem',
          color: '#666',
          lineHeight: '1.6',
          marginBottom: '2rem'
        }}>
          Rassemblez les messages et photos de toute l'équipe pour créer un livre unique 
          qui marquera le départ de votre collègue.
        </p>
        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0
        }}>
          <li style={{
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              background: '#764ba2',
              color: 'white',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px'
            }}>
              ✓
            </span>
            <span>Messages personnalisés de chaque collègue</span>
          </li>
          <li style={{
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              background: '#764ba2',
              color: 'white',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px'
            }}>
              ✓
            </span>
            <span>Photos des meilleurs moments</span>
          </li>
          <li style={{
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              background: '#764ba2',
              color: 'white',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px'
            }}>
              ✓
            </span>
            <span>Dédicaces et souvenirs</span>
          </li>
          <li style={{
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              background: '#764ba2',
              color: 'white',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px'
            }}>
              ✓
            </span>
            <span>Livraison avant le dernier jour</span>
          </li>
        </ul>
      </div>
      <div style={{
        background: '#f0f0f0',
        height: '400px',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999'
      }}>
        [Image livre]
      </div>
    </div>
  );
};

export default WhyChooseSection;