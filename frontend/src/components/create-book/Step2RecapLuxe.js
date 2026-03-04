// C:\Users\USER\bookfete\frontend\src\components\create-book\Step2RecapLuxe.js
import React from 'react';
import './CreateBookSteps.css';
import '../../styles/luxe-theme.css';

const Step2RecapLuxe = ({ bookData, price, loading, onCreate, onPrevious, chapters }) => {
  const eventLabels = {
    generique: 'Générique',
    anniversaire: 'Anniversaire',
    mariage: 'Mariage',
    naissance: 'Naissance',
    depart: 'Départ'
  };

  const finitionLabels = {
    livret: 'Livret (souple)',
    classique: 'Classique (rigide)',
    luxe: 'Luxe (toilé)'
  };

  const papierLabels = {
    satine: 'Satiné - Brillant',
    mat: 'Mat - Doux',
    verge: 'Vergé Ivoire - Texturé'
  };

  const styleLabels = {
    poetique: 'Poétique',
    factuel: 'Factuel',
    intime: 'Intime'
  };

  return (
    <div className="step-container">
      <h2 className="step-title">Vérifiez votre configuration</h2>

      {/* Récapitulatif */}
      <div className="recap-card">
        <div className="recap-grid">
          <div className="recap-item">
            <div className="recap-item-label">Destinataire</div>
            <div className="recap-item-value">{bookData.recipient_name}</div>
            {bookData.recipient_age && (
              <div className="recap-item-sub">{bookData.recipient_age} ans</div>
            )}
          </div>

          <div className="recap-item">
            <div className="recap-item-label">Événement</div>
            <div className="recap-item-value">{eventLabels[bookData.event_type]}</div>
          </div>

          <div className="recap-item">
            <div className="recap-item-label">Finition</div>
            <div className="recap-item-value">{finitionLabels[bookData.finition]}</div>
          </div>

          <div className="recap-item">
            <div className="recap-item-label">Papier</div>
            <div className="recap-item-value">{papierLabels[bookData.papier]}</div>
          </div>

          <div className="recap-item">
            <div className="recap-item-label">Style</div>
            <div className="recap-item-value">{styleLabels[bookData.style_narratif]}</div>
          </div>

          <div className="recap-item">
            <div className="recap-item-label">Pages</div>
            <div className="recap-item-value">{bookData.pages} pages</div>
            <div className="recap-item-sub">{chapters.length} chapitres</div>
          </div>
        </div>
      </div>

      {/* Aperçu des chapitres */}
      {bookData.ai_project_brief && (
        <div className="recap-card" style={{ marginTop: 'var(--space-md)' }}>
          <div className="recap-item-label">Aidez-nous a vous aider</div>
          <div
            className="recap-item-sub"
            style={{ marginTop: '8px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
          >
            {bookData.ai_project_brief}
          </div>
        </div>
      )}

      <div className="chapters-preview">
        <div className="chapters-header">
          <h3>📖 Aperçu des chapitres</h3>
          <span className="chapters-count">{chapters.length} chapitres</span>
        </div>

        <div className="chapters-list">
          {chapters.map((ch, index) => (
            <div key={index} className="chapter-item">
              <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
              <span>{ch.title}</span>
            </div>
          ))}
        </div>

        <div className="chapter-note">
          * Vous pourrez modifier ces chapitres après la création
        </div>
      </div>

      {/* Prix */}
      <div className="price-card">
        <div className="price-label">Total à payer</div>
        <div className="price-amount">{Math.round(price)}€</div>
        <div className="price-details">TTC • Livraison offerte</div>
        <div className="price-note">
          (basé sur la finition, le papier, le style et le nombre de pages)
        </div>
      </div>

      {/* Boutons */}
      <div className="action-buttons">
        <button
          onClick={onPrevious}
          disabled={loading}
          className="btn btn-back"
        >
          ← Modifier
        </button>
        <button
          onClick={onCreate}
          disabled={loading}
          className="btn btn-primary btn-create"
        >
          {loading ? 'Création en cours...' : '🚀 Créer mon livre'}
        </button>
      </div>
    </div>
  );
};

export default Step2RecapLuxe;
