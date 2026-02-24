// C:\Users\USER\bookfete\frontend\src\components\book\BookConfig.js
import React, { useState, useEffect } from 'react';

const BookConfig = ({ book, onUpdateBook, chaptersCount = 6 }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: book.title,
    finition: book.finition,
    papier: book.papier,
    style_narratif: book.style_narratif,
    pages: book.pages || chaptersCount * 8
  });

  // Constantes
  const MIN_PAGES = 32;
  const DEFAULT_PAGES_PER_CHAPTER = 8;

  // Recalculer quand le nombre de chapitres change
  useEffect(() => {
    if (!isEditing) {
      setFormData(prev => ({
        ...prev,
        pages: book.pages || chaptersCount * DEFAULT_PAGES_PER_CHAPTER
      }));
    }
  }, [chaptersCount, book.pages, isEditing]);

  // Options
  const finitions = [
    { id: 'livret', label: 'Livret', description: 'Souple' },
    { id: 'classique', label: 'Classique', description: 'Rigide' },
    { id: 'luxe', label: 'Luxe', description: 'Toilé' }
  ];

  const papiers = [
    { id: 'satine', label: 'Satiné' },
    { id: 'mat', label: 'Mat' },
    { id: 'verge', label: 'Vergé Ivoire' }
  ];

  const styles = [
    { id: 'poetique', label: 'Poétique' },
    { id: 'factuel', label: 'Factuel' },
    { id: 'intime', label: 'Intime' }
  ];

  // Calcul du nombre de chapitres basé sur les pages
  const calculatedChapters = Math.max(4, Math.floor(formData.pages / DEFAULT_PAGES_PER_CHAPTER));
  
  // Calcul du prix
  const calculatePrice = () => {
    const base = formData.finition === 'luxe' ? 85 : formData.finition === 'classique' ? 55 : 29;
    const perPage = formData.finition === 'luxe' ? 0.50 : formData.finition === 'classique' ? 0.35 : 0.25;
    return Math.round(base + (formData.pages * perPage));
  };

  const handleSave = () => {
    onUpdateBook(formData);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="configurator-card" style={{
        background: 'white',
        width: '100%',
        padding: '40px',
        borderRadius: '2px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
        border: '1px solid #e8e8e8',
      }}>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '28px',
          color: '#1f1f1f',
          textAlign: 'center',
          marginBottom: '30px'
        }}>
          Modifier la configuration
        </h2>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            marginBottom: '15px',
            color: '#888',
            fontWeight: '600'
          }}>
            Titre du livre
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e8e8e8',
              fontSize: '14px'
            }}
          />
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            marginBottom: '15px',
            color: '#888',
            fontWeight: '600'
          }}>
            1. Finition
          </label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '10px'
          }}>
            {finitions.map(f => (
              <div
                key={f.id}
                onClick={() => setFormData({ ...formData, finition: f.id })}
                style={{
                  border: `1px solid ${formData.finition === f.id ? '#b8924a' : '#e8e8e8'}`,
                  padding: '12px 5px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: formData.finition === f.id ? '#f4f0e6' : 'white',
                  boxShadow: formData.finition === f.id ? 'inset 0 0 0 1px #b8924a' : 'none'
                }}
              >
                <span style={{ display: 'block', fontSize: '13px', fontWeight: '600' }}>{f.label}</span>
                <small style={{ fontSize: '10px', color: '#999' }}>{f.description}</small>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            marginBottom: '15px',
            color: '#888',
            fontWeight: '600'
          }}>
            2. Papier d'Art
          </label>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {papiers.map(p => (
              <div
                key={p.id}
                onClick={() => setFormData({ ...formData, papier: p.id })}
                style={{
                  padding: '8px 16px',
                  border: `1px solid ${formData.papier === p.id ? '#b8924a' : '#e8e8e8'}`,
                  background: formData.papier === p.id ? '#b8924a' : 'white',
                  color: formData.papier === p.id ? 'white' : '#555',
                  fontSize: '12px',
                  cursor: 'pointer',
                  borderRadius: '20px'
                }}
              >
                {p.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            marginBottom: '15px',
            color: '#888',
            fontWeight: '600'
          }}>
            3. Style Narratif de l'IA
          </label>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {styles.map(s => (
              <div
                key={s.id}
                onClick={() => setFormData({ ...formData, style_narratif: s.id })}
                style={{
                  padding: '8px 16px',
                  border: `1px solid ${formData.style_narratif === s.id ? '#b8924a' : '#e8e8e8'}`,
                  background: formData.style_narratif === s.id ? '#b8924a' : 'white',
                  color: formData.style_narratif === s.id ? 'white' : '#555',
                  fontSize: '12px',
                  cursor: 'pointer',
                  borderRadius: '20px'
                }}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {/* Section Pagination avec lien vers les chapitres */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <label style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: '#888',
              fontWeight: '600'
            }}>
              4. Pagination
            </label>
            <span style={{
              fontSize: '12px',
              color: '#764ba2',
              background: '#f3e8ff',
              padding: '4px 12px',
              borderRadius: '20px'
            }}>
              {calculatedChapters} chapitres • 8 pages/chapitre
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '10px' }}>
            <span style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '32px',
              color: '#b8924a',
              fontWeight: '700'
            }}>
              {formData.pages}
            </span>
            <span style={{ color: '#666' }}>pages</span>
          </div>

          <input
            type="range"
            min={MIN_PAGES}
            max="216"
            step="8"
            value={formData.pages}
            onChange={(e) => setFormData({ ...formData, pages: parseInt(e.target.value) })}
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '2px',
              background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
              outline: 'none',
              cursor: 'pointer',
              marginBottom: '10px'
            }}
          />
          
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', color: '#999' }}>{MIN_PAGES} pages (min)</span>
            <span style={{ fontSize: '11px', color: '#999' }}>216 pages (max)</span>
          </div>

          <p style={{
            fontSize: '11px',
            color: '#764ba2',
            marginTop: '10px',
            fontStyle: 'italic'
          }}>
            💡 Adapté à vos {chaptersCount} chapitres ({chaptersCount * 8} pages recommandées)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
          <button
            onClick={() => setIsEditing(false)}
            style={{
              padding: '12px 24px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '12px 24px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Mettre à jour
          </button>
        </div>
      </div>
    );
  }

  // MODE VISUALISATION
  return (
    <div className="configurator-card" style={{
      background: 'white',
      width: '100%',
      padding: '40px',
      borderRadius: '2px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
      border: '1px solid #e8e8e8',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '50px'
    }}>
      <h2 style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '28px',
        color: '#1f1f1f',
        marginTop: 0,
        marginBottom: '30px',
        gridColumn: 'span 2',
        textAlign: 'center'
      }}>
        Votre Édition MonLivreLuxe
      </h2>
      
      {/* Partie gauche - Sélections */}
      <div className="selection-area">
        {/* 1. Finition & Teinte */}
        <label style={{
          display: 'block',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          marginBottom: '15px',
          color: '#888',
          fontWeight: '600'
        }}>
          1. Finition & Teinte
        </label>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '10px',
          marginBottom: '25px'
        }}>
          {finitions.map(f => (
            <div
              key={f.id}
              style={{
                border: `1px solid ${book.finition === f.id ? '#b8924a' : '#e8e8e8'}`,
                padding: '12px 5px',
                textAlign: 'center',
                background: book.finition === f.id ? '#f4f0e6' : 'white',
                boxShadow: book.finition === f.id ? 'inset 0 0 0 1px #b8924a' : 'none'
              }}
            >
              <span style={{ display: 'block', fontSize: '13px', fontWeight: '600' }}>{f.label}</span>
              <small style={{ fontSize: '10px', color: '#999' }}>{f.description}</small>
            </div>
          ))}
        </div>

        {/* Sélecteur de couleur (optionnel) */}
        <div style={{
          display: 'flex',
          gap: '15px',
          marginBottom: '25px',
          paddingLeft: '5px'
        }}>
          <div style={{
            width: '25px',
            height: '25px',
            borderRadius: '50%',
            cursor: 'pointer',
            border: '2px solid white',
            boxShadow: '0 0 0 2px #b8924a',
            transform: 'scale(1.1)',
            background: '#333'
          }} />
          <div style={{
            width: '25px',
            height: '25px',
            borderRadius: '50%',
            cursor: 'pointer',
            border: '2px solid white',
            boxShadow: '0 0 0 1px #eee',
            background: '#4a5d4e'
          }} />
          <div style={{
            width: '25px',
            height: '25px',
            borderRadius: '50%',
            cursor: 'pointer',
            border: '2px solid white',
            boxShadow: '0 0 0 1px #eee',
            background: '#5d4a4a'
          }} />
        </div>

        {/* 2. Papier d'Art */}
        <label style={{
          display: 'block',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          marginBottom: '15px',
          color: '#888',
          fontWeight: '600'
        }}>
          2. Papier d'Art
        </label>
        
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '25px'
        }}>
          {papiers.map(p => (
            <div
              key={p.id}
              style={{
                padding: '8px 16px',
                border: `1px solid ${book.papier === p.id ? '#b8924a' : '#e8e8e8'}`,
                background: book.papier === p.id ? '#b8924a' : 'white',
                color: book.papier === p.id ? 'white' : '#555',
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '20px'
              }}
            >
              {p.label}
            </div>
          ))}
        </div>

        {/* 3. Style Narratif de l'IA */}
        <label style={{
          display: 'block',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          marginBottom: '15px',
          color: '#888',
          fontWeight: '600'
        }}>
          3. Style Narratif de l'IA
        </label>
        
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '25px'
        }}>
          {styles.map(s => (
            <div
              key={s.id}
              style={{
                padding: '8px 16px',
                border: `1px solid ${book.style_narratif === s.id ? '#b8924a' : '#e8e8e8'}`,
                background: book.style_narratif === s.id ? '#b8924a' : 'white',
                color: book.style_narratif === s.id ? 'white' : '#555',
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '20px'
              }}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* 4. Pagination - CORRIGÉ */}
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: '#888',
              fontWeight: '600'
            }}>
              4. Pagination
            </label>
            <span style={{
              fontSize: '12px',
              color: '#764ba2',
              background: '#f3e8ff',
              padding: '4px 12px',
              borderRadius: '20px'
            }}>
              {/* CORRECTION : Utiliser chaptersCount au lieu de calculer */}
              {chaptersCount} chapitres • 8 pages/chapitre
            </span>
          </div>
          <span style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '32px',
            color: '#b8924a',
            fontWeight: '700',
            display: 'block',
            marginTop: '5px'
          }}>{book.pages || chaptersCount * 8}</span>
          <span style={{ fontSize: '11px', color: '#999', marginLeft: '5px' }}>pages</span>
        </div>

        {/* Slider (simulé) */}
        <div style={{
          width: '100%',
          height: '4px',
          background: '#e8e8e8',
          margin: '15px 0 25px',
          position: 'relative'
        }}>
          <div style={{
            width: `${((book.pages || chaptersCount * 8) / 216) * 100}%`,
            height: '4px',
            background: '#b8924a',
            position: 'absolute'
          }} />
        </div>

        {/* Effort Card */}
        <div style={{
          background: '#fafafa',
          border: '1px solid #eee',
          padding: '20px',
          borderRadius: '4px'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '15px',
            marginBottom: '10px'
          }}>
            <div>
              <span style={{
                fontSize: '10px',
                color: '#888',
                textTransform: 'uppercase'
              }}>Structure</span>
              <span style={{
                fontSize: '15px',
                fontWeight: '700',
                color: '#1f1f1f',
                display: 'block'
              }}>{chaptersCount} Chapitres</span>
            </div>
            <div>
              <span style={{
                fontSize: '10px',
                color: '#888',
                textTransform: 'uppercase'
              }}>Contenu / Chapitre</span>
              <span style={{
                fontSize: '15px',
                fontWeight: '700',
                color: '#1f1f1f',
                display: 'block'
              }}>3 min • 2 photos max.</span>
            </div>
          </div>
          <div style={{
            fontSize: '11px',
            color: '#777',
            lineHeight: '1.4',
            borderTop: '1px solid #eee',
            paddingTop: '10px'
          }}>
            <strong>Collaboratif :</strong> Répartissez les chapitres entre vos proches. L'IA guide chaque participant et harmonise l'ensemble.
          </div>
        </div>
      </div>

      {/* Partie droite - Prévisualisation */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fdfdfd',
        padding: '20px',
        borderRadius: '4px'
      }}>
        {/* Book Container */}
        <div style={{
          width: '100%',
          height: '280px',
          position: 'relative',
          marginBottom: '20px',
          borderRadius: '4px',
          boxShadow: '0 15px 35px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            backgroundImage: `url(${
              book.finition === 'luxe' 
                ? 'https://images.unsplash.com/photo-1621351123023-7550a28861bd?auto=format&fit=crop&q=80&w=800'
                : book.finition === 'classique'
                ? 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=800'
                : 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800'
            })`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transition: '0.5s ease'
          }} />
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
            transition: '0.5s'
          }} />
        </div>

        {/* Prix */}
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '48px',
          color: '#1f1f1f',
          marginBottom: '5px'
        }}>
          {calculatePrice()}€
        </div>

        {/* Badge IA */}
        <div style={{
          padding: '5px 12px',
          background: '#b8924a',
          color: 'white',
          fontSize: '10px',
          fontWeight: '700',
          borderRadius: '2px',
          marginBottom: '10px'
        }}>
          MÉTHODE ÉDITORIALE IA
        </div>

        {/* Validation */}
        <div style={{
          fontSize: '10px',
          color: '#b8924a',
          textTransform: 'uppercase',
          fontWeight: '700',
          letterSpacing: '1px',
          marginTop: '10px',
          marginBottom: '10px'
        }}>
          🔒 Contrôle & Validation finale par vos soins
        </div>

        {/* Légende */}
        <p style={{
          fontSize: '11px',
          color: '#999',
          marginTop: '10px',
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          Finition {finitions.find(f => f.id === book.finition)?.label}, Style {styles.find(s => s.id === book.style_narratif)?.label}, Papier {papiers.find(p => p.id === book.papier)?.label}.
        </p>

        {/* Boutons d'action */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '2rem',
          width: '100%'
        }}>
          <button
            onClick={() => window.history.back()}
            style={{
              flex: 1,
              padding: '12px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => setIsEditing(true)}
            style={{
              flex: 1,
              padding: '12px',
              background: '#b8924a',
              color: 'white',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Modifier
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookConfig;