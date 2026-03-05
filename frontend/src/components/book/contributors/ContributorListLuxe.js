// C:\Users\USER\bookfete\frontend\src\components\book\contributors\ContributorListLuxe.js
import React from 'react';
import '../BookLuxe.css';

const ContributorListLuxe = ({ contributors, onDelete }) => {
  if (contributors.length === 0) {
    return (
      <div className="contributors-empty card">
        <h3>Aucun contributeur</h3>
        <p>Ajoutez des emails pour commencer a preparer vos invitations.</p>
      </div>
    );
  }

  return (
    <div className="contributors-list-wrap">
      <div className="contributors-list-head">
        <h3>Liste des contributeurs</h3>
        <span>{contributors.length} contact(s)</span>
      </div>

      <div className="contributors-list-grid">
        {contributors.map((contributor) => (
          <article key={contributor.id} className="contributors-item-card">
            <div className="contributors-item-main">
              <div className="contributors-item-name">
                {contributor.name || contributor.email.split('@')[0]}
              </div>
              <div className="contributors-item-email">{contributor.email}</div>
            </div>

            <div className="contributors-item-meta">
              <span className={`contributors-item-status ${contributor.invited ? 'is-invited' : 'is-pending'}`}>
                {contributor.invited ? 'Invite' : 'En attente'}
              </span>
              <span className="contributors-item-date">
                Ajoute le {new Date(contributor.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onDelete(contributor.id)}
              className="btn btn-outline contributors-item-delete"
            >
              Supprimer
            </button>
          </article>
        ))}
      </div>
    </div>
  );
};

export default ContributorListLuxe;
