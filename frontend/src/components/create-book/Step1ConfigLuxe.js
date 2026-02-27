// C:\Users\USER\bookfete\frontend\src\components\create-book\Step1ConfigLuxe.js
import React from 'react';
import './CreateBookSteps.css';
import '../../styles/luxe-theme.css';

const Step1ConfigLuxe = ({ bookData, setBookData, onNext, loading }) => {
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

  const chaptersCount = Math.floor(bookData.pages / 8);

  return (
    <div className="step-container">
      <h2 className="step-title">Configurez votre livre</h2>

      {/* Type d'événement */}
      <div className="config-section">
        <span className="config-label">Type d'événement *</span>
        <select
          value={bookData.event_type}
          onChange={(e) => setBookData({ ...bookData, event_type: e.target.value })}
          className="input-luxe"
          style={{ width: '100%' }}
        >
          {eventTypes.map(e => (
            <option key={e.id} value={e.id}>{e.icon} {e.label}</option>
          ))}
        </select>
      </div>

      {/* Titre */}
      <div className="config-section">
        <span className="config-label">Titre de votre livre *</span>
        <input
          type="text"
          value={bookData.title}
          onChange={(e) => setBookData({ ...bookData, title: e.target.value })}
          placeholder="Ex: Les 60 ans de Maman, Notre Mariage..."
          className="input-luxe"
        />
      </div>

      {/* Finition */}
      <div className="config-section">
        <span className="config-label">Finition</span>
        <div className="config-grid">
          {finitions.map(f => (
            <div
              key={f.id}
              onClick={() => setBookData({ ...bookData, finition: f.id })}
              className={`config-card ${bookData.finition === f.id ? 'selected' : ''}`}
            >
              <strong>{f.label}</strong>
              <small>{f.description}</small>
            </div>
          ))}
        </div>
      </div>

      {/* Papier */}
      <div className="config-section">
        <span className="config-label">Papier d'art</span>
        <div className="config-grid">
          {papiers.map(p => (
            <div
              key={p.id}
              onClick={() => setBookData({ ...bookData, papier: p.id })}
              className={`config-card ${bookData.papier === p.id ? 'selected' : ''}`}
            >
              <strong>{p.label}</strong>
              <small>{p.description}</small>
            </div>
          ))}
        </div>
      </div>

      {/* Style narratif */}
      <div className="config-section">
        <span className="config-label">Style narratif</span>
        <div className="config-grid">
          {styles.map(s => (
            <div
              key={s.id}
              onClick={() => setBookData({ ...bookData, style_narratif: s.id })}
              className={`config-card ${bookData.style_narratif === s.id ? 'selected' : ''}`}
            >
              <strong>{s.label}</strong>
              <small>{s.description}</small>
            </div>
          ))}
        </div>
      </div>

      {/* Nombre de pages */}
      <div className="slider-container">
        <div className="slider-header">
          <span className="config-label">Nombre de pages</span>
          <div>
            <span className="slider-value">{bookData.pages}</span>
            <span className="slider-units">pages</span>
          </div>
        </div>
        
        <div className="slider-stats">
          <span className="slider-stat">{chaptersCount} chapitres</span>
          <span className="slider-stat">8 pages / chapitre</span>
        </div>

        <input
          type="range"
          min="64"
          max="216"
          step="8"
          value={bookData.pages}
          onChange={(e) => setBookData({ ...bookData, pages: parseInt(e.target.value) })}
          className="slider-input"
        />
        
        <div className="slider-minmax">
          <span>64 pages (8 chapitres)</span>
          <span>216 pages (27 chapitres)</span>
        </div>
      </div>

      {/* Boutons */}
      <div className="action-buttons">
        <div></div> {/* Spacer */}
        <button
          onClick={onNext}
          disabled={loading || !bookData.title}
          className="btn btn-primary btn-next"
        >
          {loading ? 'Génération...' : 'Continuer →'}
        </button>
      </div>
    </div>
  );
};

export default Step1ConfigLuxe;