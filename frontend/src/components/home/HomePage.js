// C:\Users\USER\bookfete\frontend\src\components\home\HomePage.js
import React from 'react';
import { Link } from 'react-router-dom';
import HeroSection from './HeroSection';
import CTASection from './CTASection';
import Layout from '../layout/Layout';
import './Home.css';

const HomePage = () => {
  const events = [
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

  const testimonials = [
    {
      id: 1,
      text: "Nous avons offert ce livre à notre collègue Marie pour son départ. Toute l'équipe a participé, le résultat était magnifique !",
      author: "Sophie, RH chez TechCorp",
      rating: 5
    },
    {
      id: 2,
      text: "Pour notre mariage, tous nos invités ont pu laisser un message et des photos. C'est le plus beau souvenir de notre journée !",
      author: "Julien & Aurélie",
      rating: 5
    },
    {
      id: 3,
      text: "Après 2 ans de projet, ce livre a permis à toute l'équipe de se remémorer les moments clés. Un véritable trésor !",
      author: "Thomas, Chef de projet",
      rating: 5
    }
  ];

  return (
    <Layout>
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Transformez vos souvenirs en un livre unique</h1>
          <p className="hero-subtitle">
            Créez un livre souvenir collaboratif pour marquer tous vos événements importants
          </p>
          <div className="hero-buttons">
            <Link to="/register" className="btn-primary">
              Commencer gratuitement
            </Link>
            <Link to="/comment-ca-marche" className="btn-secondary">
              Découvrir comment ça marche
            </Link>
          </div>
        </div>
        <div className="hero-image">
          <img src="https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=800" alt="Livre souvenir" />
        </div>
      </section>

      {/* Section Événements */}
      <section className="offres">
        <h2>Pour tous vos événements</h2>
        <div className="offres-grid">
          {events.map(event => (
            <Link 
              key={event.id}
              to={`/evenement/${event.id}`}
              className="offre-card-link"
            >
              <div className="offre-card">
                <div className="offre-icon">{event.icon}</div>
                <h3>{event.title}</h3>
                <p>{event.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Section Témoignages */}
      <section className="temoignages">
        <h2>Ils nous ont fait confiance</h2>
        <div className="temoignages-grid">
          {testimonials.map(t => (
            <div key={t.id} className="temoignage-card">
              <div className="quote">"</div>
              <p className="texte">{t.text}</p>
              <div className="auteur">{t.author}</div>
              <div className="notes">{'⭐'.repeat(t.rating)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Section Statistiques */}
      <section className="stats-section">
        <div className="stats-container">
          <div className="stat-item">
            <div className="stat-number">1500+</div>
            <div className="stat-label">livres créés</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">8500+</div>
            <div className="stat-label">témoignages</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">15k+</div>
            <div className="stat-label">photos partagées</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">98%</div>
            <div className="stat-label">clients satisfaits</div>
          </div>
        </div>
      </section>

      {/* Section Comment ça marche */}
      <section className="how-it-works">
        <h2>Comment ça marche ?</h2>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3>Créez votre livre</h3>
            <p>Choisissez votre format, votre style et personnalisez votre livre en quelques clics</p>
          </div>
          <div className="step-card">
            <div className="step-number">2</div>
            <h3>Invitez vos proches</h3>
            <p>Partagez des liens uniques par chapitre et collectez les témoignages de tous</p>
          </div>
          <div className="step-card">
            <div className="step-number">3</div>
            <h3>L'IA harmonise le tout</h3>
            <p>Notre intelligence artificielle structure et met en forme toutes les contributions</p>
          </div>
          <div className="step-card">
            <div className="step-number">4</div>
            <h3>Commandez votre livre</h3>
            <p>Recevez un livre imprimé de qualité professionnelle chez vous</p>
          </div>
        </div>
      </section>

      {/* Section CTA Final */}
      <CTASection />
    </Layout>
  );
};

export default HomePage;