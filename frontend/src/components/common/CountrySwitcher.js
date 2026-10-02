import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCountryPreference, setCountryPreference } from '../../services/countryPreference';
import './CountrySwitcher.css';

// Selecteur de pays de livraison (chantier international, 2026-10-02) — un
// <select> natif plutot qu'un menu maison : 16 pays, bien plus qu'un simple
// bouton a bascule (voir LanguageSwitcher.js, seulement 2 choix), et un
// <select> reste accessible/utilisable au clavier et sur mobile sans code
// supplementaire.
const COUNTRY_ORDER = ['FR', 'BE', 'CH', 'LU', 'MC', 'DE', 'ES', 'IT', 'NL', 'PT', 'GB', 'CA', 'US', 'MA', 'TN', 'DZ'];

function CountrySwitcher() {
  const { t } = useTranslation();
  const [country, setCountry] = useState(getCountryPreference);

  const handleChange = (event) => {
    const next = event.target.value;
    setCountry(next);
    setCountryPreference(next);
  };

  return (
    <label className="country-switcher" aria-label={t('common:country.switchLabel')}>
      <select value={country} onChange={handleChange}>
        {COUNTRY_ORDER.map((code) => (
          <option key={code} value={code}>
            {t(`common:country.names.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default CountrySwitcher;
