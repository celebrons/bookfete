import React, { useState } from 'react';
import './BookLuxe.css';

const GUIDE_LOCATIONS = [
  'Structure du livre : Generation des titres de chapitres',
  'Premier chapitre - Etape 4 : Generation de l introduction',
  'Chapitre normal - Etape 4 : Generation du chapitre',
  'Dernier chapitre - Etape 4 : Generation de l epilogue'
];

const GUIDE_STEPS = [
  'Relire les variables affichees puis survoler une variable pour voir sa valeur reelle.',
  'Ecrire les consignes dans Directives, en restant simple et concret.',
  'Cliquer sur "Tester avec les donnees reelles" pour voir le resultat sur place.',
  'Si le resultat convient, cliquer sur "Valider cette version".'
];

const GUIDE_READING = [
  'Vert : variable attendue ou importante pour le prompt.',
  'Bleu : variable qui a une vraie valeur dans ce contexte.',
  'Survol souris : affiche le contenu reel de la variable.',
  'Copier l entree / Copier entree + sortie : utile pour partager un cas a analyser.'
];

const PromptTestingGuide = ({ currentAreaLabel = '' }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="prompt-testing-guide">
      <div className="prompt-testing-guide-header">
        <div>
          <div className="prompt-testing-guide-title">Guide testeur</div>
          <p className="prompt-testing-guide-subtitle">
            Petit mode d emploi pour tester les prompts sans quitter la page.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost prompt-testing-guide-toggle"
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? 'Masquer le guide' : 'Afficher le guide'}
        </button>
      </div>

      {isOpen && (
        <div className="prompt-testing-guide-grid">
          <div className="prompt-testing-guide-card">
            <div className="chapter-prompt-admin-label">Ou vous etes</div>
            <p className="prompt-testing-guide-current">
              {currentAreaLabel || 'Panneau prompt'}
            </p>
            <div className="chapter-prompt-admin-label">Ou trouver les autres tests</div>
            <ul className="prompt-testing-guide-list">
              {GUIDE_LOCATIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="prompt-testing-guide-card">
            <div className="chapter-prompt-admin-label">Comment tester</div>
            <ul className="prompt-testing-guide-list">
              {GUIDE_STEPS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="prompt-testing-guide-card">
            <div className="chapter-prompt-admin-label">Comment lire les variables</div>
            <ul className="prompt-testing-guide-list">
              {GUIDE_READING.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
};

export default PromptTestingGuide;
