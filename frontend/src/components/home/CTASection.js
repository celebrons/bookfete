import React from 'react';
import { useNavigate } from 'react-router-dom';

const CTASection = () => {
  const navigate = useNavigate();

  return (
    <section className="cta">
      <div className="cta-content">
        <h2>Prêt à créer des souvenirs inoubliables ?</h2>
        <p>Inscrivez-vous gratuitement et créez votre premier projet en quelques minutes</p>
        <div className="cta-features">
          <div className="feature">✓ Jusqu'à 100 contributeurs</div>
          <div className="feature">✓ 5 photos par personne</div>
          <div className="feature">✓ Génération IA automatique</div>
          <div className="feature">✓ Paiement uniquement à l'impression</div>
        </div>
        <button onClick={() => navigate('/register')} className="btn-primary btn-large">
          Créer mon premier projet gratuitement
        </button>
      </div>
    </section>
  );
};

export default CTASection;