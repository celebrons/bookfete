// Pays de livraison choisi dans l'app (chantier international, 2026-10-02)
// — sert UNIQUEMENT a afficher un prix dans la bonne devise AVANT qu'une
// adresse existe (page Tarifs, choix du format a la creation du livre).
// Volontairement plus simple que languagePreference.js : pas de
// synchronisation sur le compte (user_metadata), parce que la devise
// REELLEMENT facturee a la commande vient toujours de l'adresse de
// livraison saisie a ce moment-la (voir routes/orders.js, resolveCountry) —
// ce choix precoce n'est qu'une estimation, jamais une donnee a faire
// suivre d'un appareil a l'autre.
const STORAGE_KEY = 'celebrons_country';
const DEFAULT_COUNTRY = 'FR';

export function getCountryPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_COUNTRY;
  } catch (_error) {
    return DEFAULT_COUNTRY;
  }
}

export function setCountryPreference(country) {
  try {
    localStorage.setItem(STORAGE_KEY, country);
  } catch (_error) {
    // Navigation privee/stockage refuse : jamais bloquant, le choix reste
    // juste local a cette page tant que le stockage est indisponible.
  }
  window.dispatchEvent(new CustomEvent('celebrons:country-changed', { detail: { country } }));
}

export { DEFAULT_COUNTRY };
