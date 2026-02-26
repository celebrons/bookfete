// C:\Users\USER\bookfete\frontend\src\components\home\HomePageLuxe.js
import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/luxe-theme.css';
import './HomeLuxe.css';

const HomePageLuxe = () => {
  // Références pour les animations
  const sectionsRef = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    sectionsRef.current.forEach((section) => {
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  // Événements
  const events = [
    {
      title: 'Pot de départ',
      description: 'Offrez un souvenir à un collègue qui part, avec les messages et photos de votre équipe.',
      icon: '🍾',
      link: '/create-book?event=pot-depart'
    },
    {
      title: 'Fin de projet',
      description: 'Immortalisez la réussite collective avec les témoignages de chaque membre.',
      icon: '🚀',
      link: '/create-book?event=fin-projet'
    },
    {
      title: 'Mariage',
      description: 'Faites participer tous les invités pour un album de mariage unique.',
      icon: '💍',
      link: '/create-book?event=mariage'
    },
    {
      title: 'Souvenirs de vacances',
      description: 'Partagez les meilleurs clichés et anecdotes de votre voyage.',
      icon: '✈️',
      link: '/create-book?event=vacances'
    },
    {
      title: 'Anniversaire',
      description: 'Surprenez vos proches avec un livre cadeau personnalisé.',
      icon: '🎂',
      link: '/create-book?event=anniversaire'
    },
    {
      title: 'Départ en retraite',
      description: 'Un livre rempli de témoignages pour une nouvelle vie.',
      icon: '🌅',
      link: '/create-book?event=retraite'
    }
  ];

  // Étapes avec chiffres stylisés (version luxe)
  const steps = [
    {
      number: '01',
      title: 'Créez votre projet',
      description: 'Choisissez votre événement, votre style et vos besoins.'
    },
    {
      number: '02',
      title: 'Invitez vos proches',
      description: 'Partagez les liens d\'invitation pour collecter messages et photos.'
    },
    {
      number: '03',
      title: 'Validez les contributions',
      description: 'Approuvez les messages et photos avant l\'impression.'
    },
    {
      number: '04',
      title: 'Recevez votre livre',
      description: 'Commandez votre livre et recevez-le chez vous.'
    }
  ];

  return (
    <div className="home-luxe">
      {/* HERO SECTION */}
      <section 
        ref={el => sectionsRef.current[0] = el}
        className="fade-in-section"
        style={{
          minHeight: '90vh',
          display: 'flex',
          alignItems: 'center',
          background: 'linear-gradient(135deg, var(--white) 0%, var(--silk) 100%)',
          padding: 'var(--space-xxl) 0',
          borderBottom: 'var(--border-fine)'
        }}
      >
        <div className="container-luxe">
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <span className="label-gold" style={{ marginBottom: 'var(--space-md)' }}>
              ÉDITION COLLABORATIVE
            </span>
            
            <h1 style={{
              fontSize: 'clamp(40px, 8vw, 64px)',
              fontWeight: '700',
              letterSpacing: '-0.02em',
              lineHeight: '1.1',
              marginBottom: 'var(--space-lg)',
              color: 'var(--ink)'
            }}>
              Transformez vos souvenirs<br />en un livre unique
            </h1>
            
            <p style={{
              fontSize: '18px',
              color: 'var(--text-light)',
              marginBottom: 'var(--space-xl)',
              maxWidth: '600px',
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: '1.6'
            }}>
              Créez un livre souvenir collaboratif pour marquer tous vos événements importants.
            </p>
            
            <div style={{
              display: 'flex',
              gap: 'var(--space-md)',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <Link to="/create-book" style={{ textDecoration: 'none' }}>
                <button className="btn btn-primary" style={{ padding: '16px 40px' }}>
                  Commencez gratuitement
                </button>
              </Link>
              
              <Link to="/how-it-works" style={{ textDecoration: 'none' }}>
                <button className="btn btn-outline" style={{ padding: '16px 40px' }}>
                  Découvrir
                </button>
              </Link>
            </div>

            <div className="separator-gold" style={{ 
              margin: 'var(--space-xl) auto 0',
              width: '100px' 
            }} />
          </div>
        </div>
      </section>

      {/* ÉVÉNEMENTS SECTION */}
      <section 
        ref={el => sectionsRef.current[1] = el}
        className="fade-in-section"
        style={{
          padding: 'var(--space-xxl) 0',
          backgroundColor: 'var(--white)'
        }}
      >
        <div className="container-luxe">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
            <span className="label-gold">POUR TOUS MOMENTS</span>
            <h2 style={{
              fontSize: 'clamp(32px, 6vw, 48px)',
              fontWeight: '600',
              letterSpacing: '-0.02em',
              marginTop: 'var(--space-sm)',
              color: 'var(--ink)'
            }}>
              Pour tous vos événements
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 'var(--space-lg)'
          }}>
            {events.map((event, index) => (
              <Link 
                to={event.link} 
                key={index}
                style={{ textDecoration: 'none' }}
              >
                <div className="card" style={{
                  height: '100%',
                  padding: 'var(--space-lg)',
                  transition: 'all var(--transition-fast)',
                  cursor: 'pointer'
                }}>
                  <div style={{
                    fontSize: '48px',
                    marginBottom: 'var(--space-md)',
                    lineHeight: 1
                  }}>
                    {event.icon}
                  </div>
                  <h3 style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    marginBottom: 'var(--space-sm)',
                    color: 'var(--ink)'
                  }}>
                    {event.title}
                  </h3>
                  <p className="body-text" style={{
                    color: 'var(--text-light)',
                    margin: 0,
                    lineHeight: '1.6',
                    fontSize: '14px'
                  }}>
                    {event.description}
                  </p>
                  
                  <div style={{
                    marginTop: 'var(--space-md)',
                    color: 'var(--gold)',
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}>
                    Découvrir →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE - Version luxe avec chiffres stylisés */}
      <section 
        ref={el => sectionsRef.current[2] = el}
        className="fade-in-section"
        style={{
          padding: 'var(--space-xxl) 0',
          backgroundColor: 'var(--silk)',
          borderTop: 'var(--border-fine)',
          borderBottom: 'var(--border-fine)'
        }}
      >
        <div className="container-luxe">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
            <span className="label-gold">LE PROCESSUS</span>
            <h2 style={{
              fontSize: 'clamp(32px, 6vw, 48px)',
              fontWeight: '600',
              letterSpacing: '-0.02em',
              marginTop: 'var(--space-sm)',
              color: 'var(--ink)'
            }}>
              Comment ça marche ?
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-lg)'
          }}>
            {steps.map((step, index) => (
              <div key={index} className="card" style={{
                padding: 'var(--space-xl) var(--space-lg)',
                textAlign: 'center',
                position: 'relative',
                backgroundColor: 'var(--white)',
                overflow: 'hidden'
              }}>
                {/* Chiffre stylisé version luxe */}
                <div style={{
                  fontSize: '64px',
                  fontWeight: '700',
                  color: 'var(--gold)',
                  opacity: 0.1,
                  position: 'absolute',
                  top: '10px',
                  right: '20px',
                  lineHeight: 1,
                  fontFamily: 'var(--font-primary)',
                  letterSpacing: '-0.02em'
                }}>
                  {step.number}
                </div>
                
                {/* Cercle décoratif */}
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  border: '2px solid var(--gold)',
                  margin: '0 auto var(--space-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 1,
                  backgroundColor: 'var(--white)'
                }}>
                  <span style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    color: 'var(--gold)'
                  }}>
                    {step.number}
                  </span>
                </div>
                
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  marginBottom: 'var(--space-sm)',
                  color: 'var(--ink)',
                  position: 'relative',
                  zIndex: 1
                }}>
                  {step.title}
                </h3>
                
                <p className="body-text" style={{
                  color: 'var(--text-light)',
                  margin: 0,
                  fontSize: '14px',
                  position: 'relative',
                  zIndex: 1
                }}>
                  {step.description}
                </p>

                {/* Ligne décorative fine */}
                <div style={{
                  width: '30px',
                  height: '1px',
                  backgroundColor: 'var(--gold)',
                  margin: 'var(--space-md) auto 0',
                  opacity: 0.3
                }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section 
        ref={el => sectionsRef.current[3] = el}
        className="fade-in-section"
        style={{
          padding: 'var(--space-xxl) 0',
          backgroundColor: 'var(--ink)',
          color: 'var(--white)'
        }}
      >
        <div className="container-luxe" style={{ maxWidth: '800px', textAlign: 'center' }}>
          <span className="label-gold" style={{ 
            color: 'var(--gold)',
            marginBottom: 'var(--space-md)'
          }}>
            PRÊT À CRÉER ?
          </span>
          
          <h2 style={{
            fontSize: 'clamp(32px, 6vw, 48px)',
            fontWeight: '600',
            letterSpacing: '-0.02em',
            marginBottom: 'var(--space-md)',
            color: 'var(--white)'
          }}>
            Créez vos souvenirs inoubliables
          </h2>
          
          <p style={{
            fontSize: '18px',
            color: 'var(--mist)',
            marginBottom: 'var(--space-xl)',
            lineHeight: '1.6'
          }}>
            Rejoignez des milliers de familles qui ont déjà créé leur livre de souvenirs.
          </p>
          
          <Link to="/create-book" style={{ textDecoration: 'none' }}>
            <button className="btn btn-primary" style={{
              padding: '16px 48px',
              backgroundColor: 'var(--gold)',
              border: 'none',
              fontSize: '14px'
            }}>
              Créer mon livre gratuitement
            </button>
          </Link>

          {/* Statistiques */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 'var(--space-xl)',
            marginTop: 'var(--space-xl)',
            paddingTop: 'var(--space-xl)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            flexWrap: 'wrap'
          }}>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--gold)' }}>10k+</div>
              <div style={{ fontSize: '12px', color: 'var(--mist)' }}>LIVRES CRÉÉS</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--gold)' }}>50k+</div>
              <div style={{ fontSize: '12px', color: 'var(--mist)' }}>CONTRIBUTEURS</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--gold)' }}>4.9★</div>
              <div style={{ fontSize: '12px', color: 'var(--mist)' }}>SATISFACTION</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePageLuxe;