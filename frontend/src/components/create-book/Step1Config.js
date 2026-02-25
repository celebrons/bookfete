// C:\Users\USER\bookfete\frontend\src\components\create-book\Step1Config.js
import React from 'react';

const Step1Config = ({ bookData, setBookData, onNext, loading }) => {
  const eventTypes = [
    { id: 'generique', label: 'Générique', icon: '📚' },
    { id: 'anniversaire', label: 'Anniversaire', icon: '🎂' },
    { id: 'mariage', label: 'Mariage', icon: '💍' },
    { id: 'naissance', label: 'Naissance', icon: '👶' },
    { id: 'depart', label: 'Départ', icon: '✈️' }
  ];

  const finitions = [
    { id: 'livret', label: 'Livret', description: 'Souple' },
    { id: 'classique', label: 'Classique', description: 'Rigide' },
    { id: 'luxe', label: 'Luxe', description: 'Toilé' }
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

  // Calcul du nombre de chapitres (8 pages par chapitre)
  const chaptersCount = Math.floor(bookData.pages / 8);

  return (
    <div>
      <h2 style={{ marginBottom: '2rem', color: '#333' }}>Configurez votre livre</h2>

      {/* Type d'événement */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
          Type d'événement *
        </label>
        <select
          value={bookData.event_type}
          onChange={(e) => setBookData({ ...bookData, event_type: e.target.value })}
          style={{
            width: '100%',
            padding: '1rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '1rem',
            background: 'white'
          }}
        >
          {eventTypes.map(e => (
            <option key={e.id} value={e.id}>{e.icon} {e.label}</option>
          ))}
        </select>
      </div>

      {/* Titre */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
          Titre de votre livre *
        </label>
        <input
          type="text"
          value={bookData.title}
          onChange={(e) => setBookData({ ...bookData, title: e.target.value })}
          placeholder="Ex: Les 60 ans de Maman, Notre Mariage..."
          style={{
            width: '100%',
            padding: '1rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '1rem'
          }}
        />
      </div>

      {/* Finition - SANS PRIX */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '1rem' }}>
          Finition
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          {finitions.map(f => (
            <div
              key={f.id}
              onClick={() => setBookData({ ...bookData, finition: f.id })}
              style={{
                padding: '1rem',
                border: bookData.finition === f.id ? '2px solid #764ba2' : '1px solid #ddd',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: bookData.finition === f.id ? '#f3e8ff' : 'white',
                transition: 'all 0.2s'
              }}
            >
              <strong>{f.label}</strong>
              <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.3rem' }}>
                {f.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Papier */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '1rem' }}>
          Papier
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
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
              <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.3rem' }}>
                {p.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Style narratif */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '1rem' }}>
          Style narratif
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
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
              <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.3rem' }}>
                {s.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nombre de pages - 8 pages par chapitre */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label style={{ fontWeight: 'bold' }}>
            Nombre de pages
          </label>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#764ba2' }}>{bookData.pages}</span>
            <span style={{ marginLeft: '0.5rem', color: '#666' }}>pages</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>{chaptersCount} chapitres</span>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>8 pages / chapitre</span>
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
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            outline: 'none',
            cursor: 'pointer'
          }}
        />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>64 pages (8 chapitres)</span>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>216 pages (27 chapitres)</span>
        </div>
      </div>

      {/* Note : le prix n'est plus affiché ici, il sera calculé dans le récapitulatif */}

      {/* Bouton suivant */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onNext}
          disabled={loading || !bookData.title}
          style={{
            padding: '1rem 3rem',
            background: loading || !bookData.title ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: loading || !bookData.title ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Génération...' : 'Continuer →'}
        </button>
      </div>
    </div>
  );
};

export default Step1Config;