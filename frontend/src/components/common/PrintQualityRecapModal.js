import React from 'react';
import PhotoFitBadge from './PhotoFitBadge';
import './PrintQualityRecapModal.css';

// Ecran recapitulatif OBLIGATOIRE avant commande (cahier des charges v2,
// §2) : liste des pages concernees avec vignette + numero de page +
// severite, puis deux sorties explicites — "Continuer quand meme" (le seul
// chemin vers le paiement quand il reste des avertissements : jamais de
// validation implicite) et "Revoir ces pages" (retour a la page concernee).
//
// Ne bloque JAMAIS definitivement (§3) : l'utilisateur garde le droit
// d'imprimer une photo basse resolution s'il le decide en connaissance de
// cause — c'est justement le but de cet ecran.
function PrintQualityRecapModal({ isOpen, warnings = [], onContinueAnyway, onReviewPage, onClose, loading = false }) {
  if (!isOpen) return null;

  const count = warnings.length;
  const insuffisants = warnings.filter((entry) => entry.statut === 'insuffisant').length;

  return (
    <div className="pq-recap-backdrop" onClick={onClose}>
      <div className="pq-recap-modal" onClick={(event) => event.stopPropagation()}>
        <div className="pq-recap-head">
          <h2 className="pq-recap-title">
            {count > 1 ? `${count} photos méritent votre attention` : 'Une photo mérite votre attention'}
          </h2>
          <button type="button" className="pq-recap-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <p className="pq-recap-intro">
          {insuffisants > 0
            ? 'Certaines photos ont une résolution trop faible pour la taille à laquelle elles seront imprimées : elles risquent d\'apparaître floues sur le livre papier.'
            : 'Certaines photos sont un peu justes en résolution pour la taille à laquelle elles seront imprimées.'}
        </p>

        <ul className="pq-recap-list">
          {warnings.map((entry) => (
            <li key={`${entry.pageIndex}-${entry.itemId}`} className="pq-recap-item">
              {entry.thumbnailUrl ? (
                <img src={entry.thumbnailUrl} alt="" className="pq-recap-thumb" />
              ) : (
                <span className="pq-recap-thumb pq-recap-thumb-empty" aria-hidden="true" />
              )}
              <span className="pq-recap-item-text">
                <span className="pq-recap-item-page">Page {entry.pageIndex + 1}</span>
                <span className="pq-recap-item-label">{entry.label}</span>
              </span>
              <PhotoFitBadge fit={entry} size="md" className="pq-recap-item-badge" />
              {onReviewPage && (
                <button
                  type="button"
                  className="pq-recap-item-link"
                  onClick={() => onReviewPage(entry.pageIndex)}
                >
                  Revoir
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="pq-recap-actions">
          {onReviewPage && count > 0 && (
            <button type="button" className="btn btn-outline" onClick={() => onReviewPage(warnings[0].pageIndex)}>
              Revoir ces pages
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onContinueAnyway} disabled={loading}>
            {loading ? 'Un instant...' : 'Continuer quand même'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrintQualityRecapModal;
