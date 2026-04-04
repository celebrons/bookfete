// C:\Users\USER\bookfete\frontend\src\components\book\contributors\AddContributorFormLuxe.js
import React, { useState } from 'react';
import '../BookLuxe.css';

const AddContributorFormLuxe = ({ onAdd, containerRef = null, emailInputRef = null }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!email.trim()) {
      alert('L email est obligatoire');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      alert('Email invalide');
      return;
    }

    onAdd(email.trim(), name.trim());
    setEmail('');
    setName('');
  };

  return (
    <form ref={containerRef} onSubmit={handleSubmit} className="contributors-add-form">
      <div className="contributors-add-head">
        <h3 className="contributors-add-title">Ajouter un contributeur</h3>
        <p className="contributors-add-note">
          Ces contacts seront disponibles dans l etape Invitations de chaque chapitre.
        </p>
      </div>

      <div className="contributors-add-grid">
        <label className="contributors-field" htmlFor="contributor-email">
          <span className="label-gold">Email *</span>
          <input
            ref={emailInputRef}
            id="contributor-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@exemple.com"
            required
            className="input-luxe"
          />
        </label>

        <label className="contributors-field" htmlFor="contributor-name">
          <span className="label-gold">Nom (optionnel)</span>
          <input
            id="contributor-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Prenom Nom"
            className="input-luxe"
          />
        </label>

        <div className="contributors-add-actions">
          <button
            type="submit"
            className="btn btn-primary contributors-add-btn"
          >
            Ajouter
          </button>
        </div>
      </div>
    </form>
  );
};

export default AddContributorFormLuxe;
