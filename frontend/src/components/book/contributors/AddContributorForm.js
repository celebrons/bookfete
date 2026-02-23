// C:\Users\USER\bookfete\frontend\src\components\book\contributors\AddContributorForm.js
import React, { useState } from 'react';

const AddContributorForm = ({ onAdd }) => {
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
    <form onSubmit={handleSubmit} style={{
      background: '#f8f9fa',
      padding: '1.5rem',
      borderRadius: '10px',
      marginBottom: '2rem'
    }}>
      <h3 style={{ margin: '0 0 1rem', color: '#333' }}>Ajouter un contributeur</h3>
      
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email *"
          required
          style={{
            flex: 2,
            minWidth: '250px',
            padding: '0.8rem',
            border: '1px solid #ddd',
            borderRadius: '5px',
            fontSize: '1rem'
          }}
        />
        
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom (optionnel)"
          style={{
            flex: 1,
            minWidth: '150px',
            padding: '0.8rem',
            border: '1px solid #ddd',
            borderRadius: '5px',
            fontSize: '1rem'
          }}
        />
        
        <button
          type="submit"
          style={{
            padding: '0.8rem 2rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '1rem',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          + Ajouter
        </button>
      </div>
      
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#666' }}>
        Les contributeurs pourront être invités chapitre par chapitre
      </p>
    </form>
  );
};

export default AddContributorForm;