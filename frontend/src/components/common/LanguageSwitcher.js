import React from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguagePreference } from '../../services/languagePreference';
import './LanguageSwitcher.css';

// Selecteur FR/EN (chantier bilingue, 2026-09-30) — deux libelles courts
// plutot qu'un menu deroulant : seulement 2 langues pour l'instant, un
// simple bouton a bascule se voit mieux qu'un <select> et se comprend
// sans lecture.
function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language === 'en' ? 'en' : 'fr';

  return (
    <div className="language-switcher" role="group" aria-label="Langue / Language">
      <button
        type="button"
        className={current === 'fr' ? 'is-active' : ''}
        onClick={() => setLanguagePreference('fr')}
        aria-pressed={current === 'fr'}
      >
        FR
      </button>
      <button
        type="button"
        className={current === 'en' ? 'is-active' : ''}
        onClick={() => setLanguagePreference('en')}
        aria-pressed={current === 'en'}
      >
        EN
      </button>
    </div>
  );
}

export default LanguageSwitcher;
