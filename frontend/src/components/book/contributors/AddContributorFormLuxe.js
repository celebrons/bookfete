// C:\Users\USER\bookfete\frontend\src\components\book\contributors\AddContributorFormLuxe.js
import React, { useState } from 'react';
import '../BookLuxe.css';

const AddContributorFormLuxe = ({ onAdd }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!email.trim()) {
      alert('L\'email est obligatoire');
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
    <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 'var(--space-xl)' }}>
      <h3 style={{ margin: '0 0 var(--space-lg)', fontSize: '16px', fontWeight: '600' }}>
        Ajouter un contributeur
      </h3>
      
      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: '250px' }}>
          <span className="label-gold">Email *</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemple.com"
            required
            className="input-luxe"
          />
        </div>
        
        <div style={{ flex: 1, minWidth: '150px' }}>
          <span className="label-gold">Nom (optionnel)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prénom Nom"
            className="input-luxe"
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '4px' }}>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ padding: '12px 24px', height: '46px' }}
          >
            + Ajouter
          </button>
        </div>
      </div>
      
      <p style={{ margin: 'var(--space-md) 0 0', fontSize: '12px', color: 'var(--text-light)' }}>
        Les contributeurs pourront être invités chapitre par chapitre
      </p>
    </form>
  );
};

export default AddContributorFormLuxe;