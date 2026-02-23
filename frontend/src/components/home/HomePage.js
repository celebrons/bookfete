// C:\Users\USER\bookfete\frontend\src\components\home\HomePage.js
import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

const HomePage = () => {
  // Liste des événements avec liens vers pages événements
  const events = [
    {
      title: 'Pot de départ',
      description: 'Offrez un souvenir à un collègue qui part, avec les messages et photos de votre équipe.',
      icon: '🍾',
      link: '/evenement/pot-depart'
    },
    {
      title: 'Fin de projet',
      description: 'Immortalisez la réussite collective avec les témoignages de chaque membre.',
      icon: '🚀',
      link: '/evenement/fin-projet'
    },
    {
      title: 'Mariage',
      description: 'Faites participer tous les invités pour un album de mariage unique.',
      icon: '💍',
      link: '/evenement/mariage'
    },
    {
      title: 'Souvenirs de vacances',
      description: 'Partagez les meilleurs clichés et anecdotes de votre voyage.',
      icon: '✈️',
      link: '/evenement/vacances'
    },
    {
      title: 'Anniversaire',
      description: 'Surprenez vos proches avec un livre cadeau personnalisé.',
      icon: '🎂',
      link: '/evenement/anniversaire'
    },
    {
      title: 'Départ en retraite',
      description: 'Un livre rempli de témoignages pour une nouvelle vie.',
      icon: '🌅',
      link: '/evenement/retraite'
    }
  ];

  // Étapes
  const steps = [
    {
      number: '1️⃣',
      title: 'Créez votre projet',
      description: 'Choisissez votre événement, votre style et vos besoins pour une bonne prise en charge.'
    },
    {
      number: '2️⃣',
      title: 'Invitez vos proches',
      description: 'Partagez les liens d\'invitation pour collecter messages et photos.'
    },
    {
      number: '3️⃣',
      title: 'Validez les contributions',
      description: 'Approuvez les messages et photos avant l\'impression.'
    },
    {
      number: '4️⃣',
      title: 'Recevez votre livre',
      description: 'Commandez votre livre et recevez-le chez vous.'
    }
  ];

  return (
    <div className="home-page">
      {/* HERO SECTION */}
      <section className="hero-section">
        <div className="container">
          <h1>Transformer vos souvenirs en un livre unique</h1>
          <p>Créez un livre souvenir collaboratif pour marquer tous vos événements importants.</p>
          <div className="hero-buttons">
            <Link to="/create-book" className="btn btn-primary">Commencez gratuitement</Link>
            <a href="#how-it-works" className="btn btn-secondary">Découvrir comment ça marche</a>
          </div>
        </div>
      </section>

      {/* ÉVÉNEMENTS SECTION */}
      <section className="events-section">
        <div className="container">
          <h2>Pour tous vos événements</h2>
          <div className="events-grid">
            {events.map((event, index) => (
              <Link to={event.link} key={index} className="event-card-link">
                <div className="event-card">
                  <div className="event-icon">{event.icon}</div>
                  <h3>{event.title}</h3>
                  <p>{event.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION MARKETING - REMPLACE LES STATS */}
      <section style={{
        padding: '80px 0',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
        textAlign: 'center'
      }}>
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px' }}>
          <h2 style={{
            fontSize: '2.5rem',
            color: '#333',
            marginBottom: '1.5rem',
            fontWeight: '700',
            fontFamily: "'Playfair Display', serif"
          }}>
            Des souvenirs partagés,<br />immortalisés dans un livre unique.
          </h2>
          <p style={{
            fontSize: '1.3rem',
            color: '#666',
            marginBottom: '2.5rem',
            lineHeight: '1.6'
          }}>
            Offrez un cadeau qui reste à jamais.
          </p>
          <Link 
            to="/create-book" 
            style={{
              display: 'inline-block',
              padding: '1.2rem 3rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '50px',
              fontSize: '1.2rem',
              fontWeight: '600',
              boxShadow: '0 10px 20px rgba(118, 75, 162, 0.3)',
              transition: 'all 0.3s'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-3px)';
              e.target.style.boxShadow = '0 15px 30px rgba(118, 75, 162, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 10px 20px rgba(118, 75, 162, 0.3)';
            }}
          >
            Créer mon livre →
          </Link>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="how-it-works-section">
        <div className="container">
          <h2>Comment ça marche ?</h2>
          <div className="steps-grid">
            {steps.map((step, index) => (
              <div key={index} className="step-card">
                <div className="step-number">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="cta-section">
        <div className="container">
          <h2>Prêt à créer des souvenirs inoubliables ?</h2>
          <p>Inscrivez-vous gratuitement et créez votre premier projet en quelques minutes.</p>
          <Link to="/register" className="btn btn-primary btn-large">Créez mon projet gratuitement</Link>
        </div>
      </section>
    </div>
  );
};

export default HomePage;