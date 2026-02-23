import React from 'react';

const OffresSection = () => {
  const offres = [
    {
      id: 'pot-depart',
      icon: '🎉',
      title: 'Pot de départ',
      description: 'Offrez un souvenir à un collègue qui part, avec les messages et photos de toute l\'équipe'
    },
    {
      id: 'fin-projet',
      icon: '🚀',
      title: 'Fin de projet',
      description: 'Immortalisez la réussite collective avec les témoignages de chaque membre'
    },
    {
      id: 'mariage',
      icon: '💍',
      title: 'Mariage',
      description: 'Faites participer tous les invités pour un album de mariage unique'
    },
    {
      id: 'vacances',
      icon: '✈️',
      title: 'Souvenirs de vacances',
      description: 'Partagez les meilleurs clichés et anecdotes entre voyageurs'
    },
    {
      id: 'anniversaire',
      icon: '🎂',
      title: 'Anniversaire',
      description: 'Surprenez vos proches avec un livre cadeau personnalisé'
    },
    {
      id: 'retraite',
      icon: '🌅',
      title: 'Départ en retraite',
      description: 'Un livre rempli de témoignages pour une nouvelle vie'
    }
  ];

  return (
    <section className="offres">
      <h2>Pour tous vos événements</h2>
      <div className="offres-grid">
        {offres.map(offre => (
          <div key={offre.id} className="offre-card">
            <div className="offre-icon">{offre.icon}</div>
            <h3>{offre.title}</h3>
            <p>{offre.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default OffresSection;