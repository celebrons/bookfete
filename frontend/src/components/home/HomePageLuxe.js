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

// ============================================
// ICÔNES COLORÉES ÉLÉGANTES
// ============================================

const IconChampagne = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 4L6 8H18L16 4H8Z" fill="#F4E3C6" stroke="#B8924A" strokeWidth="1.2"/>
    <path d="M12 8V20" stroke="#B8924A" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M9 20H15" stroke="#B8924A" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M14 12C14 12 15 13 16 13C17 13 18 12 18 12" stroke="#B8924A" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="12" cy="16" r="1.5" fill="#E6B87A" opacity="0.6"/>
  </svg>
);

const IconRocket = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4L4 12L6 18L12 20L18 18L20 12L12 4Z" fill="#E6E0F0" stroke="#764ba2" strokeWidth="1.2"/>
    <path d="M12 8V12" stroke="#764ba2" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="12" cy="15" r="1" fill="#764ba2"/>
    <path d="M16 6L19 3" stroke="#764ba2" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
  </svg>
);

const IconWedding = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4L8 10H16L12 4Z" fill="#FFE4E1" stroke="#D46B6B" strokeWidth="1.2"/>
    <rect x="10" y="10" width="4" height="8" fill="#FFF0F0" stroke="#D46B6B" strokeWidth="1.2"/>
    <path d="M6 18H18" stroke="#D46B6B" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="9" cy="14" r="1" fill="#D46B6B" opacity="0.4"/>
    <circle cx="15" cy="14" r="1" fill="#D46B6B" opacity="0.4"/>
  </svg>
);

const IconVacances = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="6" fill="#E0F2FE" stroke="#4A90E2" strokeWidth="1.2"/>
    <path d="M12 6V4" stroke="#4A90E2" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 20V18" stroke="#4A90E2" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M18 12H20" stroke="#4A90E2" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M4 12H6" stroke="#4A90E2" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M17 7L19 5" stroke="#4A90E2" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    <path d="M7 7L5 5" stroke="#4A90E2" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    <path d="M17 17L19 19" stroke="#4A90E2" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    <path d="M7 17L5 19" stroke="#4A90E2" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    <circle cx="12" cy="12" r="2" fill="#4A90E2" opacity="0.3"/>
  </svg>
);

const IconAnniversaire = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" fill="#FFF4E0" stroke="#E6A14A" strokeWidth="1.2"/>
    <path d="M12 8V12L14 14" stroke="#E6A14A" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M16 4L18 6" stroke="#E6A14A" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    <path d="M8 4L6 6" stroke="#E6A14A" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    <circle cx="9" cy="11" r="1" fill="#E6A14A" opacity="0.5"/>
    <circle cx="15" cy="11" r="1" fill="#E6A14A" opacity="0.5"/>
  </svg>
);

const IconRetraite = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 8L12 4L18 8V16L12 20L6 16V8Z" fill="#E8F0E8" stroke="#5A8F5A" strokeWidth="1.2"/>
    <path d="M12 12L14 14" stroke="#5A8F5A" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 8V12" stroke="#5A8F5A" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M8 11L10 13" stroke="#5A8F5A" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    <path d="M16 11L14 13" stroke="#5A8F5A" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    <circle cx="12" cy="16" r="1" fill="#5A8F5A" opacity="0.4"/>
  </svg>
);

const IconDeparture = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="7" width="10" height="10" rx="2" fill="#EEF2F7" stroke="#5B7189" strokeWidth="1.2"/>
    <path d="M8 7.5V6.5C8 5.67 8.67 5 9.5 5H10.5C11.33 5 12 5.67 12 6.5V7.5" stroke="#5B7189" strokeWidth="1.2"/>
    <path d="M16 12H20" stroke="#5B7189" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M18 10L20 12L18 14" stroke="#5B7189" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="10" cy="12" r="1" fill="#5B7189" opacity="0.35"/>
  </svg>
);

const IconBirth = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 12C6 8.69 8.69 6 12 6C15.31 6 18 8.69 18 12C18 15.31 15.31 18 12 18C8.69 18 6 15.31 6 12Z" fill="#FFF1E8" stroke="#C9865B" strokeWidth="1.2"/>
    <path d="M9.5 13C10.4 14 11.2 14.5 12 14.5C12.8 14.5 13.6 14 14.5 13" stroke="#C9865B" strokeWidth="1.4" strokeLinecap="round"/>
    <circle cx="10" cy="11" r="0.8" fill="#C9865B" opacity="0.5"/>
    <circle cx="14" cy="11" r="0.8" fill="#C9865B" opacity="0.5"/>
    <path d="M12 4V2.8" stroke="#C9865B" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
  </svg>
);

const IconFamily = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="10" r="2.2" fill="#F2ECFF" stroke="#7C6AA6" strokeWidth="1.2"/>
    <circle cx="16" cy="10" r="2.2" fill="#F2ECFF" stroke="#7C6AA6" strokeWidth="1.2"/>
    <circle cx="12" cy="7.5" r="2.2" fill="#F2ECFF" stroke="#7C6AA6" strokeWidth="1.2"/>
    <path d="M5.5 17C6.3 15.5 7.8 14.5 9.6 14.5H14.4C16.2 14.5 17.7 15.5 18.5 17" stroke="#7C6AA6" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M9 17.5H15" stroke="#7C6AA6" strokeWidth="1.3" strokeLinecap="round" opacity="0.55"/>
  </svg>
);

const IconSpark = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4L13.6 8.4L18 10L13.6 11.6L12 16L10.4 11.6L6 10L10.4 8.4L12 4Z" fill="#FFF4E8" stroke="#B8924A" strokeWidth="1.2"/>
    <path d="M18.5 4.5L19.2 6.3L21 7L19.2 7.7L18.5 9.5L17.8 7.7L16 7L17.8 6.3L18.5 4.5Z" fill="#FFF4E8" stroke="#B8924A" strokeWidth="1"/>
    <path d="M5.5 15.5L6.1 17L7.5 17.6L6.1 18.2L5.5 19.7L4.9 18.2L3.5 17.6L4.9 17L5.5 15.5Z" fill="#FFF4E8" stroke="#B8924A" strokeWidth="1"/>
  </svg>
);

// ============================================
// LISTE DES ÉVÉNEMENTS (à remplacer)
// ============================================

const events = [
  {
    title: 'Pot de départ',
    description: 'Offrez un souvenir à un collègue qui part, avec les messages et photos de votre équipe.',
    icon: <IconChampagne />,
    link: '/create-book?event=pot-depart'
  },
  {
    title: 'Fin de projet',
    description: 'Immortalisez la réussite collective avec les témoignages de chaque membre.',
    icon: <IconRocket />,
    link: '/create-book?event=fin-projet'
  },
  {
    title: 'Mariage',
    description: 'Faites participer tous les invités pour un album de mariage unique.',
    icon: <IconWedding />,
    link: '/create-book?event=mariage'
  },
  {
    title: 'Souvenirs de vacances',
    description: 'Partagez les meilleurs clichés et anecdotes de votre voyage.',
    icon: <IconVacances />,
    link: '/create-book?event=vacances'
  },
  {
    title: 'Anniversaire',
    description: 'Surprenez vos proches avec un livre cadeau personnalisé.',
    icon: <IconAnniversaire />,
    link: '/create-book?event=anniversaire'
  },
  {
    title: 'Départ en retraite',
    description: 'Un livre rempli de témoignages pour une nouvelle vie.',
    icon: <IconRetraite />,
    link: '/create-book?event=retraite'
  },
  {
    title: 'Naissance',
    description: 'Rassemblez les mots des proches autour d une arrivée très attendue.',
    icon: <IconAnniversaire />,
    link: '/create-book?event=naissance'
  },
  {
    title: 'Réunion de famille',
    description: 'Capturez les rituels, les légendes et la transmission entre générations.',
    icon: <IconVacances />,
    link: '/create-book?event=famille'
  },
  {
    title: 'Choix libre',
    description: 'Un parcours souple pour les événements qui ne rentrent dans aucune case.',
    icon: <IconRocket />,
    link: '/create-book?event=choix-libre'
  }
];

  // Étapes avec chiffres stylisés (version luxe)
const homepageEvents = events.slice(0, 0).concat([
  {
    title: 'Anniversaire',
    description: 'Creez un livre chaleureux pour celebrer un age, une personnalite et tous les souvenirs partages.',
    icon: <IconAnniversaire />,
    link: '/create-book?event=anniversaire'
  },
  {
    title: 'Retraite',
    description: 'Rassemblez les voix des collegues, de la famille ou des deux pour marquer un grand passage.',
    icon: <IconRetraite />,
    link: '/create-book?event=retraite'
  },
  {
    title: 'Depart',
    description: 'Accompagnez un changement de vie, un nouveau poste, un demenagement ou un grand envol.',
    icon: <IconDeparture />,
    link: '/create-book?event=depart'
  },
  {
    title: 'Mariage / union',
    description: 'Faites participer les proches pour raconter une rencontre, une complicite et une promesse.',
    icon: <IconWedding />,
    link: '/create-book?event=mariage'
  },
  {
    title: 'Naissance',
    description: 'Rassemblez les mots des proches autour d une arrivee attendue ou d une grossesse deja pleine d amour.',
    icon: <IconBirth />,
    link: '/create-book?event=naissance'
  },
  {
    title: 'Voyage / vacances',
    description: 'Transformez un voyage en recit collectif avec photos, anecdotes et moments inattendus.',
    icon: <IconVacances />,
    link: '/create-book?event=voyage'
  },
  {
    title: 'Fin de projet',
    description: 'Immortalisez une aventure d equipe, un defi surmonte et tout ce que le projet a change.',
    icon: <IconRocket />,
    link: '/create-book?event=fin-projet'
  },
  {
    title: 'Reunion de famille',
    description: 'Capturez les rituels, les legendes et les transmissions qui soudent une famille au fil du temps.',
    icon: <IconFamily />,
    link: '/create-book?event=famille'
  },
  {
    title: 'Choix libre',
    description: 'Un parcours souple pour les evenements qui ne rentrent dans aucune case.',
    icon: <IconSpark />,
    link: '/create-book?event=choix-libre'
  }
]);

  const steps = [
    {
      number: '01',
      title: 'Créez votre projet',
      description: 'Choisissez votre événement et donnez un titre à votre livre.'
    },
    {
      number: '02',
      title: 'Ajoutez vos photos et textes',
      description: 'Importez vos photos et écrivez vos souvenirs directement dans l\'éditeur.'
    },
    {
      number: '03',
      title: 'Choisissez le style',
      description: 'Sélectionnez une mise en page et le nombre de pages, l\'aperçu se met à jour en direct.'
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
              MISE EN PAGE SANS IA
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
              Ajoutez vos photos et vos textes, choisissez un style : votre livre souvenir prend forme sous vos yeux.
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
            <p style={{
              marginTop: 'var(--space-sm)',
              color: 'var(--text-light)',
              fontSize: '15px'
            }}>
              9 parcours disponibles, du plus classique au plus libre.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 'var(--space-lg)'
          }}>
            {homepageEvents.map((event, index) => (
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
                  <div className="feature-icon" style={{ color: 'var(--gold)' }}>
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
              <div style={{ fontSize: '12px', color: 'var(--mist)' }}>PAGES COMPOSÉES</div>
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
