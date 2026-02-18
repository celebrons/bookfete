import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="hero">
      <div className="hero-content">
        <h1>Transformez vos souvenirs en un livre unique</h1>
        <p className="hero-subtitle">
          Créez un livre souvenir collaboratif pour marquer tous vos événements importants
        </p>
        <div className="hero-buttons">
          <button onClick={() => navigate('/register')} className="btn-primary">
            Commencer gratuitement
          </button>
          <button onClick={() => navigate('/how-it-works')} className="btn-secondary">
            Découvrir comment ça marche
          </button>
        </div>
      </div>
      <div className="hero-image">
        <img src="/images/hero-book.jpg" alt="Livre souvenir" />
      </div>
    </section>
  );
};

export default HeroSection;