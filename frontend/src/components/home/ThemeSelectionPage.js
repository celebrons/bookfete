import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './ThemeSelectionPage.css';

const ThemeSelectionPage = () => {
  const { themeId } = useParams();
  const navigate = useNavigate();
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [showStyleComparison, setShowStyleComparison] = useState(false);
  const [showPriceComparison, setShowPriceComparison] = useState(false);
  const [showStyleSection, setShowStyleSection] = useState(false);
  
  const styleSectionRef = useRef(null);

  // SCROLL AUTOMATIQUE VERS LE HAUT AU CHARGEMENT
  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: 'instant' // 'smooth' pour un défilement fluide, 'instant' pour immédiat
    });
  }, []);

  const themeData = {
    famille: {
      title: 'Famille',
      subtitle: 'Livre souvenir',
      icon: '👨‍👩‍👧‍👦',
      description: 'Immortalisez les moments précieux en famille'
    },
    amour: {
      title: 'Amour',
      subtitle: 'Album romantique',
      icon: '❤️',
      description: 'Célébrez votre histoire d\'amour unique'
    },
    amitie: {
      title: 'Amitié',
      subtitle: 'Souvenirs entre amis',
      icon: '🤝',
      description: 'Les meilleurs moments partagés entre amis'
    },
    voyage: {
      title: 'Voyage',
      subtitle: 'Carnet de voyage',
      icon: '✈️',
      description: 'Retracez vos plus belles aventures'
    },
    entreprise: {
      title: 'Entreprise',
      subtitle: 'Livre corporate',
      icon: '💼',
      description: 'Valorisez votre culture d\'entreprise'
    }
  };

  const currentTheme = themeData[themeId] || themeData.famille;

  const designs = [
    {
      id: 'heritage',
      name: 'Héritage',
      description: 'Élégant et intemporel',
      price: 89,
      pages: 'jusqu\'à 150 pages',
      colors: ['#8B4513', '#D2691E', '#F4A460']
    },
    {
      id: 'contemporain',
      name: 'Contemporain',
      description: 'Moderne et épuré',
      price: 89,
      pages: 'jusqu\'à 150 pages',
      colors: ['#2C3E50', '#3498DB', '#ECF0F1']
    },
    {
      id: 'vintage',
      name: 'Vintage',
      description: 'Charme rétro',
      price: 89,
      pages: 'jusqu\'à 150 pages',
      colors: ['#D2B48C', '#8B4513', '#DEB887']
    }
  ];

  const writingStyles = [
    {
      id: 'odyssee',
      name: 'Odyssée',
      type: 'Épique & Solennel',
      icon: '⚡',
      description: 'Un style grandiose qui donne de l\'ampleur à vos souvenirs',
      example: 'Tel un héros antique, votre parcours à travers les âges mérite d\'être chanté...'
    },
    {
      id: 'humour',
      name: 'Humour',
      type: 'Léger & Taquin',
      icon: '😄',
      description: 'Une touche d\'humour pour des souvenirs qui font sourire',
      example: 'Souvenez-vous de cette fois où... un fou rire inoubliable !'
    },
    {
      id: 'journaliste',
      name: 'Journaliste',
      type: 'Factuel & Dynamique',
      icon: '📰',
      description: 'Un style direct et percutant qui va droit au but',
      example: 'Le 20 mars 2024, un événement marquant changea le cours des choses...'
    }
  ];

  const handleDesignSelect = (designId) => {
    setSelectedDesign(designId);
    setShowStyleSection(true);
    
    setTimeout(() => {
      styleSectionRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 300);
  };

  const handleStyleSelect = (styleId) => {
    setSelectedStyle(styleId);
  };

  const handleStartProject = () => {
    if (selectedDesign && selectedStyle) {
      navigate('/login', { 
        state: { 
          from: { pathname: '/create-project' },
          theme: currentTheme,
          design: designs.find(d => d.id === selectedDesign),
          style: writingStyles.find(s => s.id === selectedStyle)
        }
      });
    }
  };

  return (
    <div className="theme-selection-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      {/* En-tête avec la thématique */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '3rem', 
        padding: '2rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        borderRadius: '10px'
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{currentTheme.icon}</div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{currentTheme.title}</h1>
        <p style={{ fontSize: '1.2rem', opacity: 0.9, marginBottom: '1rem' }}>{currentTheme.subtitle}</p>
        <p style={{ maxWidth: '600px', margin: '0 auto', opacity: 0.8 }}>{currentTheme.description}</p>
      </div>

      {/* Section Choix du design */}
      <section style={{ marginBottom: '4rem' }}>
        <h2 style={{ 
          fontSize: '2rem', 
          color: '#333', 
          marginBottom: '2rem',
          textAlign: 'center',
          position: 'relative',
          paddingBottom: '1rem'
        }}>
          1. Choisissez un design de livre
          <span style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80px',
            height: '4px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '2px'
          }}></span>
        </h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem'
        }}>
          {designs.map((design) => (
            <div
              key={design.id}
              onClick={() => handleDesignSelect(design.id)}
              style={{
                background: 'white',
                borderRadius: '15px',
                padding: '2rem',
                boxShadow: selectedDesign === design.id 
                  ? '0 10px 30px rgba(118, 75, 162, 0.3)' 
                  : '0 5px 20px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: selectedDesign === design.id ? '3px solid #764ba2' : 'none',
                transform: selectedDesign === design.id ? 'translateY(-5px)' : 'none',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (selectedDesign !== design.id) {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedDesign !== design.id) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 5px 20px rgba(0,0,0,0.1)';
                }
              }}
            >
              <div style={{
                height: '150px',
                background: '#f8f9fa',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                overflow: 'hidden',
                display: 'flex'
              }}>
                {design.colors.map((color, index) => (
                  <div key={index} style={{ flex: 1, backgroundColor: color }} />
                ))}
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#333' }}>{design.name}</h3>
              <p style={{ color: '#666', marginBottom: '1rem' }}>{design.description}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '0.95rem' }}>
                <span>📄 {design.pages}</span>
                <span style={{ fontWeight: 'bold', color: '#764ba2' }}>À partir {design.price}€</span>
              </div>
              {selectedDesign === design.id && (
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  right: '-10px',
                  background: '#28a745',
                  color: 'white',
                  padding: '0.3rem 0.8rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}>
                  ✓ Sélectionné
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bouton comparer les designs */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button 
            onClick={() => setShowPriceComparison(!showPriceComparison)}
            style={{
              background: 'none',
              border: 'none',
              color: '#764ba2',
              fontSize: '1rem',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {showPriceComparison ? '▼ Masquer' : '▶ Comparer les designs'} -30% sur le 2ème livre
          </button>
        </div>

        {showPriceComparison && (
          <div style={{
            background: '#f8f9fa',
            borderRadius: '10px',
            padding: '2rem',
            margin: '2rem 0',
            border: '1px solid #dee2e6'
          }}>
            <h4 style={{ marginBottom: '1.5rem', color: '#333' }}>Offre spéciale</h4>
            <p style={{ marginBottom: '1.5rem' }}>Commandez 2 livres et bénéficiez de -30% sur le second !</p>
            <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', alignItems: 'flex-end' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#666', marginBottom: '0.5rem' }}>1 livre</div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>89€</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#666', marginBottom: '0.5rem' }}>2 livres</div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>151,30€</div>
                <div style={{ color: '#28a745', fontSize: '0.9rem' }}>(Économie de 26,70€)</div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Section Choix du style d'écriture */}
      {showStyleSection && (
        <section ref={styleSectionRef} style={{ marginBottom: '4rem' }}>
          <h2 style={{ 
            fontSize: '2rem', 
            color: '#333', 
            marginBottom: '2rem',
            textAlign: 'center',
            position: 'relative',
            paddingBottom: '1rem'
          }}>
            2. Définissez le style d'écriture
            <span style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '80px',
              height: '4px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '2px'
            }}></span>
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem'
          }}>
            {writingStyles.map((style) => (
              <div
                key={style.id}
                onClick={() => handleStyleSelect(style.id)}
                style={{
                  background: 'white',
                  borderRadius: '15px',
                  padding: '2rem',
                  boxShadow: selectedStyle === style.id 
                    ? '0 10px 30px rgba(118, 75, 162, 0.3)' 
                    : '0 5px 20px rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  border: selectedStyle === style.id ? '3px solid #764ba2' : 'none',
                  transform: selectedStyle === style.id ? 'translateY(-5px)' : 'none',
                  textAlign: 'center',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (selectedStyle !== style.id) {
                    e.currentTarget.style.transform = 'translateY(-5px)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedStyle !== style.id) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 5px 20px rgba(0,0,0,0.1)';
                  }
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{style.icon}</div>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#333' }}>{style.name}</h3>
                <p style={{ color: '#764ba2', fontWeight: '600', marginBottom: '1rem' }}>{style.type}</p>
                <p style={{ color: '#666' }}>{style.description}</p>
                {selectedStyle === style.id && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '-10px',
                    background: '#28a745',
                    color: 'white',
                    padding: '0.3rem 0.8rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}>
                    ✓ Sélectionné
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bouton comparer les styles */}
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button 
              onClick={() => setShowStyleComparison(!showStyleComparison)}
              style={{
                background: 'none',
                border: 'none',
                color: '#764ba2',
                fontSize: '1rem',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              {showStyleComparison ? '▼ Masquer' : '▶ Comparer les styles d\'écriture'}
            </button>
          </div>

          {showStyleComparison && (
            <div style={{
              background: '#f8f9fa',
              borderRadius: '10px',
              padding: '2rem',
              margin: '2rem 0',
              border: '1px solid #dee2e6'
            }}>
              <h4 style={{ marginBottom: '1.5rem', color: '#333' }}>Exemples de styles</h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '2rem'
              }}>
                {writingStyles.map((style) => (
                  <div key={style.id}>
                    <h5 style={{ marginBottom: '0.5rem' }}>{style.name} <span style={{ color: '#764ba2', fontSize: '0.9rem' }}>({style.type})</span></h5>
                    <p style={{ 
                      color: '#666', 
                      fontStyle: 'italic', 
                      padding: '1rem', 
                      background: 'white', 
                      borderRadius: '5px',
                      borderLeft: '3px solid #764ba2'
                    }}>
                      "{style.example}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Message gratuit */}
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        background: '#e8f4fd',
        borderRadius: '10px',
        margin: '3rem 0',
        border: '1px solid #bee5eb'
      }}>
        <p style={{ margin: '0.5rem 0', color: '#0c5460' }}>
          ✨ La création de compte est <strong style={{ color: '#764ba2' }}>gratuite</strong> et sans engagement !
        </p>
        <p style={{ margin: '0.5rem 0', color: '#0c5460' }}>
          Vous ne payez qu'à l'impression de votre livre.
        </p>
      </div>

      {/* Bouton Commencer */}
      {selectedDesign && selectedStyle && (
        <div style={{ textAlign: 'center', margin: '3rem 0', animation: 'fadeIn 0.5s ease' }}>
          <button
            onClick={handleStartProject}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              padding: '1.2rem 4rem',
              fontSize: '1.3rem',
              fontWeight: 'bold',
              borderRadius: '50px',
              cursor: 'pointer',
              boxShadow: '0 5px 20px rgba(118, 75, 162, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(118, 75, 162, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 5px 20px rgba(118, 75, 162, 0.3)';
            }}
          >
            Commencer mon projet de livre
          </button>
          <p style={{ marginTop: '1rem', color: '#666' }}>
            Vous serez invité à créer un compte gratuitement
          </p>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default ThemeSelectionPage;