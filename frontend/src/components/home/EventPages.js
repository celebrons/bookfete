// C:\Users\USER\bookfete\frontend\src\components\home\EventPages.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Layout from '../layout/Layout';
import BookConfigurator from '../create-book/BookConfigurator';
import './EventPages.css';

const EventPages = () => {
  const { eventType } = useParams();
  const navigate = useNavigate();
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [stats, setStats] = useState({
    booksCreated: 0,
    contributions: 0,
    photos: 0,
    happyCustomers: 0
  });

  // Données spécifiques à chaque événement
  const eventData = {
    'pot-depart': {
      title: 'Pot de départ',
      icon: '🎉',
      subtitle: 'Offrez un souvenir inoubliable à un collègue',
      description: 'Rassemblez les messages et photos de toute l\'équipe pour créer un livre unique qui marquera le départ de votre collègue.',
      heroImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800',
      testimonial: {
        text: "Nous avons offert ce livre à notre collègue Marie pour son départ. Toute l'équipe a participé, le résultat était magnifique !",
        author: "Sophie, RH chez TechCorp"
      },
      features: [
        "Messages personnalisés de chaque collègue",
        "Photos des meilleurs moments",
        "Dédicaces et souvenirs",
        "Livraison avant le dernier jour"
      ]
    },
    'fin-projet': {
      title: 'Fin de projet',
      icon: '🚀',
      subtitle: 'Immortalisez la réussite collective',
      description: 'Conservez une trace des moments forts, des défis relevés et des succès de votre équipe.',
      heroImage: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=800',
      testimonial: {
        text: "Après 2 ans de projet, ce livre a permis à toute l'équipe de se remémorer les moments clés. Un véritable trésor !",
        author: "Thomas, Chef de projet"
      },
      features: [
        "Témoignages de chaque membre",
        "Photos des étapes clés",
        "Bilan et perspectives",
        "Messages de remerciement"
      ]
    },
    'mariage': {
      title: 'Mariage',
      icon: '💍',
      subtitle: 'Un album unique avec tous vos invités',
      description: 'Faites participer tous vos proches pour créer un livre de mariage rempli d\'émotions.',
      heroImage: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=800',
      testimonial: {
        text: "Tous nos invités ont pu laisser un message et des photos. C'est le plus beau souvenir de notre mariage !",
        author: "Julien & Aurélie"
      },
      features: [
        "Messages des invités",
        "Photos de la cérémonie",
        "Anecdotes et souvenirs",
        "Vœux pour les mariés"
      ]
    },
    'vacances': {
      title: 'Souvenirs de vacances',
      icon: '✈️',
      subtitle: 'Revivez vos plus beaux voyages',
      description: 'Partagez vos meilleurs clichés et anecdotes avec vos compagnons de voyage.',
      heroImage: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80&w=800',
      testimonial: {
        text: "Chacun a pu ajouter ses photos et ses anecdotes. Ce livre nous fait revivre nos vacances à chaque page !",
        author: "Claire & Antoine"
      },
      features: [
        "Photos de chaque voyageur",
        "Anecdotes drôles",
        "Bonnes adresses",
        "Souvenirs partagés"
      ]
    },
    'anniversaire': {
      title: 'Anniversaire',
      icon: '🎂',
      subtitle: 'Surprenez vos proches',
      description: 'Créez un livre cadeau unique rempli de messages et de photos.',
      heroImage: 'https://images.unsplash.com/photo-1464349153735-7db50ed83c84?auto=format&fit=crop&q=80&w=800',
      testimonial: {
        text: "Pour les 60 ans de mon père, nous avons rassemblé des messages de toute la famille. Il a été très ému !",
        author: "Marie"
      },
      features: [
        "Messages des proches",
        "Photos souvenirs",
        "Anecdotes familiales",
        "Vœux d'anniversaire"
      ]
    },
    'retraite': {
      title: 'Départ en retraite',
      icon: '🌅',
      subtitle: 'Une nouvelle vie à célébrer',
      description: 'Rassemblez les témoignages de collègues et proches pour un départ en beauté.',
      heroImage: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&q=80&w=800',
      testimonial: {
        text: "Ce livre a été une belle surprise pour mon départ. Voir tous ces messages m'a beaucoup touché.",
        author: "Jean-Pierre"
      },
      features: [
        "Messages des collègues",
        "Photos des années passées",
        "Anecdotes professionnelles",
        "Vœux pour la retraite"
      ]
    }
  };

  const event = eventData[eventType] || eventData['pot-depart'];

  // Charger les statistiques en temps réel
  useEffect(() => {
    const fetchStats = async () => {
      // Compter les livres créés pour ce type d'événement
      const { count: booksCount } = await supabase
        .from('books')
        .select('*', { count: 'exact', head: true })
        .eq('type', eventType);

      // Compter toutes les contributions
      const { count: contributionsCount } = await supabase
        .from('contributions')
        .select('*', { count: 'exact', head: true });

      // Compter les photos
      const { data: contributions } = await supabase
        .from('contributions')
        .select('photo_urls');
      
      const photosCount = contributions?.reduce((acc, c) => 
        acc + (c.photo_urls?.length || 0), 0) || 0;

      setStats({
        booksCreated: booksCount || 1247, // Fallback pour la démo
        contributions: contributionsCount || 8453,
        photos: photosCount || 15678,
        happyCustomers: booksCount ? Math.floor(booksCount * 0.95) : 1185
      });
    };

    fetchStats();

    // Mettre à jour les stats toutes les 30 secondes
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [eventType]);

  // Animation du compteur
  const Counter = ({ value, label, suffix = '' }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
      const duration = 2000; // 2 secondes
      const steps = 50;
      const stepValue = value / steps;
      let current = 0;
      
      const timer = setInterval(() => {
        current += stepValue;
        if (current >= value) {
          setDisplayValue(value);
          clearInterval(timer);
        } else {
          setDisplayValue(Math.floor(current));
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }, [value]);

    return (
      <div className="stat-item">
        <div className="stat-number">{displayValue.toLocaleString()}{suffix}</div>
        <div className="stat-label">{label}</div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="event-page">
        {/* Hero Section */}
        <section className="event-hero" style={{
          background: `linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%), url(${event.heroImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}>
          <div className="hero-content">
            <div className="event-icon">{event.icon}</div>
            <h1>{event.title}</h1>
            <p className="hero-subtitle">{event.subtitle}</p>
            <button 
              onClick={() => setShowConfigurator(true)}
              className="btn-primary btn-large"
            >
              Créer votre livre
            </button>
          </div>
        </section>

        {/* Statistiques en temps réel */}
        <section className="stats-section">
          <div className="stats-container">
            <Counter value={stats.booksCreated} label="livres créés" />
            <Counter value={stats.contributions} label="témoignages" />
            <Counter value={stats.photos} label="photos partagées" />
            <Counter value={stats.happyCustomers} label="personnes ravies" />
          </div>
        </section>

        {/* Description */}
        <section className="description-section">
          <div className="container">
            <div className="description-content">
              <h2>Pourquoi choisir ce livre ?</h2>
              <p className="description-text">{event.description}</p>
              
              <div className="features-grid">
                {event.features.map((feature, index) => (
                  <div key={index} className="feature-card">
                    <div className="feature-icon">✓</div>
                    <p>{feature}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Témoignage */}
        <section className="testimonial-section">
          <div className="container">
            <div className="testimonial-card">
              <div className="quote-mark">"</div>
              <p className="testimonial-text">{event.testimonial.text}</p>
              <p className="testimonial-author">— {event.testimonial.author}</p>
            </div>
          </div>
        </section>

        {/* Exemples de livres */}
        <section className="examples-section">
          <div className="container">
            <h2>Ils ont créé leur livre</h2>
            <div className="examples-grid">
              {[1, 2, 3].map(i => (
                <div key={i} className="example-card">
                  <div className="example-image" style={{
                    backgroundImage: `url(https://images.unsplash.com/photo-${i === 1 ? '1544716278-ca5e3f4abd8c' : i === 2 ? '1490117739941-1556d6c56536' : '1481624404172-6e6296b0e5ee'}?auto=format&fit=crop&q=80&w=400)`
                  }} />
                  <div className="example-overlay">
                    <h3>Livre {event.title}</h3>
                    <p>Voir l'exemple →</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="cta-section">
          <div className="container">
            <h2>Prêt à créer votre livre ?</h2>
            <p>Rejoignez les {stats.happyCustomers.toLocaleString()} personnes qui ont déjà créé leur livre</p>
            <button 
              onClick={() => setShowConfigurator(true)}
              className="btn-primary btn-large"
            >
              Commencer maintenant
            </button>
          </div>
        </section>

        {/* Configurateur Modal */}
        {showConfigurator && (
          <div className="configurator-modal">
            <div className="modal-content">
              <button 
                className="modal-close"
                onClick={() => setShowConfigurator(false)}
              >
                ×
              </button>
              <BookConfigurator />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default EventPages;