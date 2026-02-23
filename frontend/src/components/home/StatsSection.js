// C:\Users\USER\bookfete\frontend\src\components\home\StatsSection.js
import React from 'react';

const StatsSection = () => {
  const stats = [
    { value: '1247', label: 'LIVRES CRÉÉS' },
    { value: '17', label: 'TÉMOIGNAGES' },
    { value: '5', label: 'PHOTOS PARTAGÉES' },
    { value: '1185', label: 'PERSONNES RAVIES' }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '2rem',
      textAlign: 'center'
    }}>
      {stats.map((stat, index) => (
        <div key={index}>
          <div style={{
            fontSize: '3rem',
            fontWeight: 'bold',
            color: '#764ba2',
            marginBottom: '0.5rem'
          }}>
            {stat.value}
          </div>
          <div style={{
            fontSize: '0.9rem',
            color: '#666',
            letterSpacing: '1px'
          }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsSection;