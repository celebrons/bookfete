// C:\Users\USER\bookfete\frontend\src\components\create-book\Step2Finition.js
import React from 'react';

const Step2Finition = ({ bookData, setBookData, price, onNext, onPrevious }) => {
  const finitions = [
    { 
      id: 'livret', 
      label: 'Livret', 
      price: 69,
      description: 'Souple',
      image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800'
    },
    { 
      id: 'classique', 
      label: 'Classique', 
      price: 89,
      description: 'Rigide',
      image: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=800'
    },
    { 
      id: 'luxe', 
      label: 'Luxe', 
      price: 129,
      description: 'Toilé',
      image: 'https://images.unsplash.com/photo-1621351123023-7550a28861bd?auto=format&fit=crop&q=80&w=800'
    }
  ];

  const papiers = [
    { id: 'satine', label: 'Satiné', description: 'Brillant et lisse' },
    { id: 'mat', label: 'Mat', description: 'Doux et élégant' },
    { id: 'verge', label: 'Vergé Ivoire', description: 'Texturé et noble' }
  ];

  const styles = [
    { id: 'poetique', label: 'Poétique', description: 'Langage imagé et émouvant' },
    { id: 'factuel', label: 'Factuel', description: 'Direct et concret' },
    { id: 'intime', label: 'Intime', description: 'Chaleureux et personnel' }
  ];

  // Calcul du prix total
  const calculateTotal = () => {
    return price + (bookData.pages - 96) * 0.25; // 0.25€ par page supplémentaire
  };

  return (
    <div>
      {/* Rappel des choix précédents */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '10px'
      }}>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Titre</div>
          <div style={{ fontWeight: 'bold' }}>{bookData.title || 'Non défini'}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Événement</div>
          <div style={{ fontWeight: 'bold' }}>{bookData.event_type}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Pages</div>
          <div style={{ fontWeight: 'bold' }}>{bookData.pages} pages</div>
        </div>
      </div>

      <h3 style={{ margin: '0 0 1.5rem', color: '#333' }}>Choisissez la finition</h3>

      {/* Options de finition */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {finitions.map(f => (
          <div
            key={f.id}
            onClick={() => setBookData({ ...bookData, finition: f.id })}
            style={{
              border: bookData.finition === f.id ? '3px solid #764ba2' : '1px solid #e0e0e0',
              borderRadius: '12px',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'all 0.3s',
              boxShadow: bookData.finition === f.id ? '0 10px 20px rgba(118, 75, 162, 0.2)' : '0 2px 5px rgba(0,0,0,0.05)',
              transform: bookData.finition === f.id ? 'scale(1.02)' : 'scale(1)'
            }}
          >
            <div style={{
              height: '150px',
              backgroundImage: `url(${f.image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              position: 'relative'
            }}>
              {bookData.finition === f.id && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: '#28a745',
                  color: 'white',
                  width: '25px',
                  height: '25px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px'
                }}>
                  ✓
                </div>
              )}
            </div>
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>{f.label}</h4>
              <p style={{ margin: '0 0 1rem', color: '#666', fontSize: '0.9rem' }}>{f.description}</p>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#764ba2' }}>{f.price}€</div>
            </div>
          </div>
        ))}
      </div>

      {/* Papier */}
      <div style={{ marginBottom: '2rem' }}>
        <h4 style={{ margin: '0 0 1rem', color: '#333' }}>Choix du papier</h4>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem'
        }}>
          {papiers.map(p => (
            <div
              key={p.id}
              onClick={() => setBookData({ ...bookData, papier: p.id })}
              style={{
                padding: '1rem',
                border: bookData.papier === p.id ? '2px solid #764ba2' : '1px solid #ddd',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: bookData.papier === p.id ? '#f3e8ff' : 'white'
              }}
            >
              <strong>{p.label}</strong>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: '#666' }}>
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Style narratif */}
      <div style={{ marginBottom: '2rem' }}>
        <h4 style={{ margin: '0 0 1rem', color: '#333' }}>Style narratif de l'IA</h4>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem'
        }}>
          {styles.map(s => (
            <div
              key={s.id}
              onClick={() => setBookData({ ...bookData, style_narratif: s.id })}
              style={{
                padding: '1rem',
                border: bookData.style_narratif === s.id ? '2px solid #764ba2' : '1px solid #ddd',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: bookData.style_narratif === s.id ? '#f3e8ff' : 'white'
              }}
            >
              <strong>{s.label}</strong>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: '#666' }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Ajustement des pages */}
      <div style={{
        background: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '10px',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0 }}>Nombre de pages</h4>
          <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#764ba2' }}>{bookData.pages}</span>
        </div>
        
        <input
          type="range"
          min="64"
          max="216"
          step="8"
          value={bookData.pages}
          onChange={(e) => setBookData({ ...bookData, pages: parseInt(e.target.value) })}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '3px',
            background: 'linear-gradient(90deg, #764ba2 0%, #667eea 100%)',
            outline: 'none',
            cursor: 'pointer'
          }}
        />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>64 pages</span>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>216 pages</span>
        </div>
      </div>

      {/* Récapitulatif prix */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '1.5rem',
        borderRadius: '10px',
        color: 'white',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Prix total</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{calculateTotal()}€</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>dont {bookData.pages - 96} pages supplémentaires</div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.2)',
            padding: '0.5rem 1rem',
            borderRadius: '20px',
            fontSize: '0.9rem'
          }}>
            Estimation
          </div>
        </div>
      </div>

      {/* Boutons de navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <button
          onClick={onPrevious}
          style={{
            padding: '1rem 2rem',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          ← Précédent
        </button>
        <button
          onClick={onNext}
          style={{
            padding: '1rem 3rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
};

export default Step2Finition;