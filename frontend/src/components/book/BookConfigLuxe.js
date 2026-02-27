// C:\Users\USER\bookfete\frontend\src\components\book\BookConfigLuxe.js
import React, { useState, useEffect } from 'react';
import './BookLuxe.css';
import '../../styles/luxe-theme.css';

const BookConfigLuxe = ({ book, onUpdateBook, chaptersCount = 6 }) => {
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
    { id: 'satine', label: 'Satiné', description: 'Brillant et lisse' },
    { id: 'mat', label: 'Mat', description: 'Doux et élégant' },
    { id: 'verge', label: 'Vergé Ivoire', description: 'Texturé et noble' }
  ];

  const styles = [
    { id: 'poetique', label: 'Poétique', description: 'Langage imagé et émouvant' },
    { id: 'factuel', label: 'Factuel', description: 'Direct et concret' },
    { id: 'intime', label: 'Intime', description: 'Chaleureux et personnel' }
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

  // Icônes pour les finitions
  const getFinitionIcon = (id) => {
    switch(id) {
      case 'livret': return '📘';
      case 'classique': return '📕';
      case 'luxe': return '📚';
      default: return '📖';
    }
  };

  // Icônes pour les papiers
  const getPapierIcon = (id) => {
    switch(id) {
      case 'satine': return '✨';
      case 'mat': return '🎨';
      case 'verge': return '📜';
      default: return '📄';
    }
  };

  // Icônes pour les styles
  const getStyleIcon = (id) => {
    switch(id) {
      case 'poetique': return '🌸';
      case 'factuel': return '📝';
      case 'intime': return '💝';
      default: return '✍️';
    }
  };

  if (isEditing) {
    return (
      <div className="card" style={{ padding: 'var(--space-xl)' }}>
        <h2 style={{
          fontSize: '28px',
          fontWeight: '600',
          textAlign: 'center',
          marginBottom: 'var(--space-xl)',
          color: 'var(--ink)'
        }}>
          Modifier la configuration
        </h2>

        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <span className="label-gold">Titre du livre</span>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="input-luxe"
            placeholder="Titre du livre"
          />
        </div>

        {/* Finition */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <span className="label-gold">1. Finition</span>
          <div className="config-grid">
            {finitions.map(f => (
              <div
                key={f.id}
                onClick={() => setFormData({ ...formData, finition: f.id })}
                className={`config-card ${formData.finition === f.id ? 'selected' : ''}`}
              >
                <div style={{ fontSize: '32px', marginBottom: 'var(--space-xs)' }}>
                  {getFinitionIcon(f.id)}
                </div>
                <strong>{f.label}</strong>
                <small>{f.description}</small>
              </div>
            ))}
          </div>
        </div>

        {/* Papier */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <span className="label-gold">2. Papier d'Art</span>
          <div className="config-grid">
            {papiers.map(p => (
              <div
                key={p.id}
                onClick={() => setFormData({ ...formData, papier: p.id })}
                className={`config-card ${formData.papier === p.id ? 'selected' : ''}`}
              >
                <div style={{ fontSize: '32px', marginBottom: 'var(--space-xs)' }}>
                  {getPapierIcon(p.id)}
                </div>
                <strong>{p.label}</strong>
                <small>{p.description}</small>
              </div>
            ))}
          </div>
        </div>

        {/* Style narratif */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <span className="label-gold">3. Style Narratif de l'IA</span>
          <div className="config-grid">
            {styles.map(s => (
              <div
                key={s.id}
                onClick={() => setFormData({ ...formData, style_narratif: s.id })}
                className={`config-card ${formData.style_narratif === s.id ? 'selected' : ''}`}
              >
                <div style={{ fontSize: '32px', marginBottom: 'var(--space-xs)' }}>
                  {getStyleIcon(s.id)}
                </div>
                <strong>{s.label}</strong>
                <small>{s.description}</small>
              </div>
            ))}
          </div>
        </div>

        {/* Pagination */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <div className="slider-header">
            <span className="label-gold">4. Pagination</span>
            <span className="slider-value">
              {formData.pages} <span className="slider-units">pages</span>
            </span>
          </div>
          
          <div className="slider-stats">
            <span className="slider-stat">{calculatedChapters} chapitres</span>
            <span className="slider-stat">8 pages / chapitre</span>
          </div>

          <input
            type="range"
            min={MIN_PAGES}
            max="216"
            step="8"
            value={formData.pages}
            onChange={(e) => setFormData({ ...formData, pages: parseInt(e.target.value) })}
            className="slider-input"
          />
          
          <div className="slider-minmax">
            <span>{MIN_PAGES} pages (min)</span>
            <span>216 pages (max)</span>
          </div>

          <p className="chapter-note" style={{ marginTop: 'var(--space-md)' }}>
            💡 Adapté à vos {chaptersCount} chapitres ({chaptersCount * 8} pages recommandées)
          </p>
        </div>

        {/* Prix */}
        <div className="price-card" style={{ marginBottom: 'var(--space-xl)' }}>
          <div className="price-label">Prix estimé</div>
          <div className="price-amount">{calculatePrice()}€</div>
          <div className="price-details">TTC</div>
        </div>

        {/* Boutons */}
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button
            onClick={() => setIsEditing(false)}
            className="modal-btn modal-btn-secondary"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="modal-btn modal-btn-primary"
          >
            Valider les modifications
          </button>
        </div>
      </div>
    );
  }

  // MODE VISUALISATION
  return (
    <div className="card" style={{ padding: 'var(--space-xl)' }}>
      <h2 style={{
        fontSize: '28px',
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 'var(--space-xl)',
        color: 'var(--ink)'
      }}>
        Votre Édition
      </h2>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-xl)'
      }}>
        {/* Partie gauche - Sélections */}
        <div>
          {/* 1. Finition */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <span className="label-gold">1. Finition</span>
            <div className="config-grid" style={{ marginTop: 'var(--space-sm)' }}>
              {finitions.map(f => (
                <div
                  key={f.id}
                  className={`config-card ${book.finition === f.id ? 'selected' : ''}`}
                  style={{ cursor: 'default' }}
                >
                  <div style={{ fontSize: '24px', marginBottom: 'var(--space-xs)' }}>
                    {getFinitionIcon(f.id)}
                  </div>
                  <strong>{f.label}</strong>
                  <small>{f.description}</small>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Papier */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <span className="label-gold">2. Papier d'Art</span>
            <div className="config-grid" style={{ marginTop: 'var(--space-sm)' }}>
              {papiers.map(p => (
                <div
                  key={p.id}
                  className={`config-card ${book.papier === p.id ? 'selected' : ''}`}
                  style={{ cursor: 'default' }}
                >
                  <div style={{ fontSize: '24px', marginBottom: 'var(--space-xs)' }}>
                    {getPapierIcon(p.id)}
                  </div>
                  <strong>{p.label}</strong>
                  <small>{p.description}</small>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Style */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <span className="label-gold">3. Style Narratif</span>
            <div className="config-grid" style={{ marginTop: 'var(--space-sm)' }}>
              {styles.map(s => (
                <div
                  key={s.id}
                  className={`config-card ${book.style_narratif === s.id ? 'selected' : ''}`}
                  style={{ cursor: 'default' }}
                >
                  <div style={{ fontSize: '24px', marginBottom: 'var(--space-xs)' }}>
                    {getStyleIcon(s.id)}
                  </div>
                  <strong>{s.label}</strong>
                  <small>{s.description}</small>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Pagination */}
          <div>
            <span className="label-gold">4. Pagination</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>
              <span className="slider-value" style={{ fontSize: '32px' }}>
                {book.pages || chaptersCount * 8}
              </span>
              <span className="slider-units">pages</span>
            </div>
            <div className="slider-stats" style={{ marginTop: '4px' }}>
              <span className="slider-stat">{chaptersCount} chapitres</span>
            </div>

            <div className="card-luxe" style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                <div>
                  <span className="label-gold" style={{ fontSize: '9px' }}>Structure</span>
                  <span style={{ display: 'block', fontSize: '15px', fontWeight: '600' }}>
                    {chaptersCount} Chapitres
                  </span>
                </div>
                <div>
                  <span className="label-gold" style={{ fontSize: '9px' }}>Contenu / Chapitre</span>
                  <span style={{ display: 'block', fontSize: '15px', fontWeight: '600' }}>
                    3 min • 2 photos
                  </span>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-light)', margin: 'var(--space-sm) 0 0', borderTop: 'var(--border-fine)', paddingTop: 'var(--space-sm)' }}>
                <strong>Collaboratif :</strong> Répartissez les chapitres entre vos proches.
              </p>
            </div>
          </div>
        </div>

        {/* Partie droite - Prévisualisation */}
        <div className="card" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'var(--silk)'
        }}>
          {/* Image du livre */}
          <div style={{
            width: '100%',
            height: '280px',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-elevated)',
            marginBottom: 'var(--space-lg)'
          }}>
            <img
              src={
                book.finition === 'luxe' 
                  ? 'https://images.unsplash.com/photo-1621351123023-7550a28861bd?auto=format&fit=crop&q=80&w=800'
                  : book.finition === 'classique'
                  ? 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=800'
                  : 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800'
              }
              alt="Aperçu du livre"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          </div>

          {/* Prix */}
          <div className="price-card" style={{ width: '100%', marginBottom: 'var(--space-lg)' }}>
            <div className="price-amount" style={{ fontSize: '48px' }}>{calculatePrice()}€</div>
          </div>

          {/* Badge IA */}
          <div className="badge" style={{
            padding: '4px 12px',
            background: 'var(--gold)',
            color: 'white',
            fontSize: '10px',
            fontWeight: '600',
            borderRadius: '20px',
            marginBottom: 'var(--space-sm)'
          }}>
            MÉTHODE ÉDITORIALE IA
          </div>

          {/* Validation */}
          <div style={{
            fontSize: '10px',
            color: 'var(--gold)',
            textTransform: 'uppercase',
            fontWeight: '600',
            letterSpacing: '1px',
            marginBottom: 'var(--space-sm)'
          }}>
            🔒 Contrôle & Validation finale
          </div>

          {/* Légende */}
          <p className="chapter-note" style={{ textAlign: 'center' }}>
            Finition {finitions.find(f => f.id === book.finition)?.label},<br />
            Style {styles.find(s => s.id === book.style_narratif)?.label},<br />
            Papier {papiers.find(p => p.id === book.papier)?.label}.
          </p>

          {/* Bouton Modifier */}
          <button
            onClick={() => setIsEditing(true)}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 'var(--space-md)' }}
          >
            ✏️ Modifier la configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookConfigLuxe;