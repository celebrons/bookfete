// C:\Users\USER\bookfete\frontend\src\components\dashboard\StatsCards.js
import React from 'react';

const StatsCards = ({ stats }) => {
  const cards = [
    {
      title: 'Livres en cours',
      value: stats.enCours,
      icon: '📖',
      color: '#764ba2',
      bgColor: '#f3e8ff'
    },
    {
      title: 'Livres terminés',
      value: stats.termines,
      icon: '✅',
      color: '#28a745',
      bgColor: '#d4edda'
    },
    {
      title: 'Chapitres',
      value: stats.totalChapitres,
      icon: '📑',
      color: '#17a2b8',
      bgColor: '#d1ecf1'
    },
    {
      title: 'Contributions',
      value: stats.totalContributions,
      icon: '💬',
      color: '#ffc107',
      bgColor: '#fff3cd'
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1.5rem',
      marginBottom: '3rem'
    }}>
      {cards.map((card, index) => (
        <div
          key={index}
          style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '10px',
            background: card.bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.8rem'
          }}>
            {card.icon}
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: card.color }}>
              {card.value}
            </div>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>{card.title}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;