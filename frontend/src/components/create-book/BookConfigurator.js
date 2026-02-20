// C:\Users\USER\bookfete\frontend\src\components\create-book\BookConfigurator.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const BookConfigurator = ({ initialBook, onSave }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // États pour la configuration
  const [format, setFormat] = useState(initialBook?.finition || 'luxe');
  const [paper, setPaper] = useState(initialBook?.papier || 'Satiné');
  const [tone, setTone] = useState(initialBook?.style_narratif || 'Poétique');
  const [pageIndex, setPageIndex] = useState(2); // 0-7 pour les paliers
  const [color, setColor] = useState('transparent');
  const [bookTitle, setBookTitle] = useState(initialBook?.title || '');

  // Paliers de pages disponibles
  const stepsStandard = [24, 48, 96, 120, 144, 168, 192, 216];
  const stepsLivret = [24, 48];
  
  // Images de prévisualisation par format
  const previews = {
    livret: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800",
    classique: "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=800",
    luxe: "https://images.unsplash.com/photo-1621351123023-7550a28861bd?auto=format&fit=crop&q=80&w=800"
  };

  // Calculer les pages disponibles selon le format
  const steps = format === 'livret' ? stepsLivret : stepsStandard;
  const pages = steps[pageIndex];
  const chapters = Math.ceil(pages / 4);

  // Calculer le prix
  const calculatePrice = () => {
    const basePrice = format === 'luxe' ? 85 : (format === 'classique' ? 55 : 29);
    const perPagePrice = format === 'luxe' ? 0.50 : (format === 'classique' ? 0.35 : 0.25);
    return Math.round(basePrice + (pages * perPagePrice));
  };

  const totalPrice = calculatePrice();

  // Mettre à jour le style de teinte
  const tintStyle = {
    '--book-tint': color
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Non authentifié');

      const bookData = {
        owner_id: user.id,
        title: bookTitle,
        finition: format,
        papier: paper,
        style_narratif: tone,
        pages: pages,
        chapters: chapters,
        statut: 'en_cours'
      };

      let bookId;
      
      if (initialBook?.id) {
        // Mise à jour d'un livre existant
        const { error } = await supabase
          .from('books')
          .update(bookData)
          .eq('id', initialBook.id);
        
        if (error) throw error;
        bookId = initialBook.id;
      } else {
        // Création d'un nouveau livre
        const { data, error } = await supabase
          .from('books')
          .insert([bookData])
          .select()
          .single();
        
        if (error) throw error;
        bookId = data.id;

        // Créer automatiquement les chapitres
        const chaptersToCreate = [];
        for (let i = 0; i < chapters; i++) {
          chaptersToCreate.push({
            book_id: bookId,
            title: `Chapitre ${i + 1}`,
            description: '',
            order_index: i,
            questions_ia: []
          });
        }
        
        await supabase.from('chapters').insert(chaptersToCreate);
      }

      if (onSave) {
        onSave(bookId);
      } else {
        navigate(`/book/${bookId}`);
      }
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="configurator-card" style={{
      background: 'white',
      width: '100%',
      maxWidth: '1100px',
      margin: '0 auto',
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
        {initialBook ? 'Configurer votre livre' : 'Créez votre livre unique'}
      </h2>
      
      {/* Partie gauche - Sélections */}
      <div className="selection-area">
        {/* Titre du livre */}
        <div style={{ marginBottom: '25px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            marginBottom: '15px',
            color: '#888',
            fontWeight: '600'
          }}>
            Titre de votre livre
          </label>
          <input
            type="text"
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            placeholder="Ex: Les 60 ans de Maman"
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e8e8e8',
              fontSize: '16px',
              fontFamily: "'Inter', sans-serif"
            }}
            required
          />
        </div>

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
        
        {/* Sélecteur de format */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '10px',
          marginBottom: '25px'
        }}>
          {['livret', 'classique', 'luxe'].map(f => (
            <div
              key={f}
              onClick={() => setFormat(f)}
              style={{
                border: `1px solid ${format === f ? '#b8924a' : '#e8e8e8'}`,
                padding: '12px 5px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: '0.3s',
                background: format === f ? '#f4f0e6' : 'white',
                boxShadow: format === f ? 'inset 0 0 0 1px #b8924a' : 'none'
              }}
            >
              <span style={{ display: 'block', fontSize: '13px', fontWeight: '600' }}>
                {f === 'livret' ? 'Livret' : f === 'classique' ? 'Classique' : 'Luxe'}
              </span>
              <small style={{ fontSize: '10px', color: '#999' }}>
                {f === 'livret' ? 'Souple' : f === 'classique' ? 'Rigide' : 'Toilé'}
              </small>
            </div>
          ))}
        </div>

        {/* Sélecteur de couleur */}
        <div style={{
          display: 'flex',
          gap: '15px',
          marginBottom: '25px',
          paddingLeft: '5px'
        }}>
          {[
            { color: 'transparent', bg: '#333' },
            { color: 'rgba(74, 93, 78, 0.4)', bg: '#4a5d4e' },
            { color: 'rgba(93, 74, 74, 0.4)', bg: '#5d4a4a' }
          ].map(c => (
            <div
              key={c.color}
              onClick={() => setColor(c.color)}
              style={{
                width: '25px',
                height: '25px',
                borderRadius: '50%',
                cursor: 'pointer',
                border: '2px solid white',
                boxShadow: color === c.color ? '0 0 0 2px #b8924a' : '0 0 0 1px #eee',
                transform: color === c.color ? 'scale(1.1)' : 'none',
                transition: '0.2s',
                background: c.bg
              }}
            />
          ))}
        </div>

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
          {['Satiné', 'Mat', 'Vergé Ivoire'].map(p => (
            <div
              key={p}
              onClick={() => setPaper(p)}
              style={{
                padding: '8px 16px',
                border: `1px solid ${paper === p ? '#b8924a' : '#e8e8e8'}`,
                background: paper === p ? '#b8924a' : 'white',
                color: paper === p ? 'white' : '#555',
                fontSize: '12px',
                cursor: 'pointer',
                transition: '0.2s',
                borderRadius: '20px'
              }}
            >
              {p}
            </div>
          ))}
        </div>

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
          {['Poétique', 'Factuel', 'Intime'].map(t => (
            <div
              key={t}
              onClick={() => setTone(t)}
              style={{
                padding: '8px 16px',
                border: `1px solid ${tone === t ? '#b8924a' : '#e8e8e8'}`,
                background: tone === t ? '#b8924a' : 'white',
                color: tone === t ? 'white' : '#555',
                fontSize: '12px',
                cursor: 'pointer',
                transition: '0.2s',
                borderRadius: '20px'
              }}
            >
              {t}
            </div>
          ))}
        </div>

        <label style={{
          display: 'block',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          marginBottom: '15px',
          color: '#888',
          fontWeight: '600'
        }}>
          4. Pagination : <span style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '32px',
            color: '#b8924a',
            fontWeight: '700'
          }}>{pages}</span> pages
        </label>
        
        <input
          type="range"
          min="0"
          max={steps.length - 1}
          value={pageIndex}
          onChange={(e) => setPageIndex(parseInt(e.target.value))}
          style={{
            width: '100%',
            margin: '15px 0',
            accentColor: '#b8924a',
            cursor: 'pointer'
          }}
        />

        {/* Carte d'effort collaboratif */}
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
              }}>{chapters} Chapitres</span>
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
      <div className="preview-panel" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fdfdfd',
        padding: '20px',
        borderRadius: '4px'
      }}>
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
            backgroundImage: `url(${previews[format]})`,
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
            backgroundColor: color,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
            transition: '0.5s'
          }} />
        </div>

        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '48px',
          color: '#1f1f1f',
          marginBottom: '5px'
        }}>
          {totalPrice}€
        </div>

        <div style={{
          padding: '5px 12px',
          background: '#b8924a',
          color: 'white',
          fontSize: '10px',
          fontWeight: '700',
          borderRadius: '2px'
        }}>
          MÉTHODE ÉDITORIALE IA
        </div>

        <div style={{
          fontSize: '10px',
          color: '#b8924a',
          textTransform: 'uppercase',
          fontWeight: '700',
          letterSpacing: '1px',
          marginTop: '20px'
        }}>
          🔒 Contrôle & Validation finale par vos soins
        </div>

        <p style={{
          fontSize: '11px',
          color: '#999',
          marginTop: '10px',
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          Finition {format === 'livret' ? 'Livret' : format === 'classique' ? 'Classique' : 'Luxe'}, 
          Style {tone}, Papier {paper}.
        </p>

        {/* Boutons d'action */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '2rem',
          width: '100%'
        }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              flex: 1,
              padding: '1rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !bookTitle}
            style={{
              flex: 2,
              padding: '1rem',
              background: loading || !bookTitle ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: loading || !bookTitle ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Création...' : initialBook ? 'Mettre à jour' : 'Créer mon livre'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookConfigurator;