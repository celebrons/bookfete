// C:\Users\USER\bookfete\frontend\src\components\home\EventPages.js
import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './EventPages.css';

const EventPages = () => {
  const { eventType } = useParams();

  // FORCER LE SCROLL EN HAUT DE PAGE À CHAQUE CHARGEMENT
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Données pour chaque type d'événement
  const eventData = {
    'pot-depart': {
      title: 'Livre de pot de départ',
      subtitle: 'Un dernier souvenir en équipe',
      description: 'Rassemblez les messages et photos de toute l\'équipe pour marquer le départ d\'un collègue.',
      icon: '🍾',
      color: '#9B59B6',
      features: [
        'Messages des collègues',
        'Photos des soirées',
        'Meilleurs souvenirs',
        'Mots d\'au revoir'
      ]
    },
    'fin-projet': {
      title: 'Livre de fin de projet',
      subtitle: 'Célébrez la réussite collective',
      description: 'Immortalisez la fin d\'un projet avec les témoignages de toute l\'équipe.',
      icon: '🚀',
      color: '#E67E22',
      features: [
        'Témoignages de l\'équipe',
        'Photos des étapes clés',
        'Leçons apprises',
        'Célébration du succès'
      ]
    },
    'mariage': {
      title: 'Livre de mariage',
      subtitle: 'Un souvenir éternel de votre grand jour',
      description: 'Faites participer tous vos invités pour créer un album de mariage unique rempli de témoignages.',
      icon: '💍',
      color: '#D4AF37',
      features: [
        'Messages des invités',
        'Photos de la cérémonie',
        'Souvenirs de la rencontre',
        'Conseils pour les mariés'
      ]
    },
    'vacances': {
      title: 'Livre de vacances',
      subtitle: 'Immortalisez vos plus beaux voyages',
      description: 'Partagez les meilleurs moments de vos vacances avec vos proches à travers un livre collaboratif.',
      icon: '✈️',
      color: '#20B2AA',
      features: [
        'Photos de voyage',
        'Anecdotes et souvenirs',
        'Recommandations',
        'Moments partagés'
      ]
    },
    'anniversaire': {
      title: "Livre d'anniversaire",
      subtitle: 'Célébrez un anniversaire inoubliable',
      description: 'Rassemblez les messages, photos et souvenirs de tous vos proches pour créer un livre unique.',
      icon: '🎂',
      color: '#FF6B6B',
      features: [
        'Messages personnalisés',
        'Photos des meilleurs moments',
        'Souvenirs d\'enfance',
        'Vœux pour l\'avenir'
      ]
    },
    'retraite': {
      title: 'Livre de départ en retraite',
      subtitle: 'Une nouvelle vie qui commence',
      description: 'Célébrez le départ à la retraite d\'un collègue avec un livre rempli de témoignages chaleureux.',
      icon: '🌅',
      color: '#FFA07A',
      features: [
        'Messages de l\'équipe',
        'Photos des années passées',
        'Souvenirs et anecdotes',
        'Projets pour la retraite'
      ]
    }
  };

  // Si l'événement n'existe pas, prendre 'anniversaire' par défaut
  const data = eventData[eventType] || eventData['anniversaire'];

  return (
    <div className="event-page">
      {/* SECTION 1 - HERO */}
      <section className="event-hero" style={{ 
        background: `linear-gradient(135deg, ${data.color}dd 0%, ${data.color} 100%)`,
        padding: '80px 0',
        color: 'white'
      }}>
        <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>{data.icon}</div>
            <h1 style={{ fontSize: '3rem', marginBottom: '1rem', fontWeight: 'bold' }}>{data.title}</h1>
            <p style={{ fontSize: '1.5rem', marginBottom: '1.5rem', opacity: 0.9 }}>{data.subtitle}</p>
            <p style={{ fontSize: '1.2rem', marginBottom: '2.5rem', opacity: 0.8, lineHeight: '1.6' }}>
              {data.description}
            </p>
            <Link 
              to={`/create-book?event=${eventType}`} 
              className="btn-create"
              style={{
                display: 'inline-block',
                padding: '1.2rem 3rem',
                background: 'white',
                color: data.color,
                textDecoration: 'none',
                borderRadius: '50px',
                fontSize: '1.2rem',
                fontWeight: 'bold',
                boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
                transition: 'all 0.3s',
                border: 'none',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-3px)';
                e.target.style.boxShadow = '0 15px 30px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
              }}
            >
              Créer mon livre
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 2 - CARACTÉRISTIQUES */}
      <section style={{ padding: '60px 0', background: '#f8fafc' }}>
        <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <h2 style={{ 
            fontSize: '2.2rem', 
            textAlign: 'center', 
            marginBottom: '3rem',
            color: '#333',
            fontWeight: '600'
          }}>
            Ce que votre livre contiendra
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '2rem',
            maxWidth: '800px',
            margin: '0 auto'
          }}>
            {data.features.map((feature, index) => (
              <div key={index} style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '10px',
                boxShadow: '0 5px 15px rgba(0,0,0,0.05)',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  background: data.color,
                  color: 'white',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                  fontSize: '1.2rem',
                  fontWeight: 'bold'
                }}>
                  ✓
                </div>
                <p style={{ color: '#666', fontSize: '1.1rem' }}>{feature}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 - EXEMPLE */}
      <section style={{ padding: '60px 0', background: 'white' }}>
        <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4rem',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ 
                fontSize: '2.2rem', 
                marginBottom: '1.5rem',
                color: '#333',
                fontWeight: '600'
              }}>
                Un exemple de réalisation
              </h2>
              <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '2rem', lineHeight: '1.6' }}>
                Des livres magnifiques, imprimés avec soin et livrés chez vous.
              </p>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <span style={{ color: data.color, fontSize: '1.3rem' }}>✨</span>
                  <span style={{ color: '#555' }}>Couverture personnalisable</span>
                </li>
                <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <span style={{ color: data.color, fontSize: '1.3rem' }}>📖</span>
                  <span style={{ color: '#555' }}>Papier de qualité supérieure</span>
                </li>
                <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <span style={{ color: data.color, fontSize: '1.3rem' }}>📸</span>
                  <span style={{ color: '#555' }}>Photos en haute définition</span>
                </li>
                <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <span style={{ color: data.color, fontSize: '1.3rem' }}>🎁</span>
                  <span style={{ color: '#555' }}>Livraison offerte</span>
                </li>
              </ul>
            </div>
            <div style={{
              background: '#f0f0f0',
              height: '350px',
              borderRadius: '15px',
              backgroundImage: 'url(https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=800)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
            }} />
          </div>
        </div>
      </section>
    </div>
  );
};

export default EventPages;