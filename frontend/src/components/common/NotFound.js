import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="not-found">
      <h1>404</h1>
      <h2>Page non trouvée</h2>
      <p>La page que vous recherchez n'existe pas ou a été déplacée.</p>
      <button onClick={() => navigate('/')} className="btn-primary">
        Retour à l'accueil
      </button>
    </div>
  );
};

export default NotFound;