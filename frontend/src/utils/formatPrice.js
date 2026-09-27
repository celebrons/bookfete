// Formatage centime -> euros affiches (chantier "tarification dynamique",
// 2026-09-27) — un seul endroit pour ce format ("44,30 €", virgule
// francaise), reutilise partout ou un prix backend (toujours en centimes,
// voir services/pricing/) doit s'afficher. Ne fait AUCUN calcul de prix,
// juste la mise en forme d'un montant deja calcule cote serveur.
export const formatEuros = (cents) => {
  if (!Number.isFinite(cents)) return '';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
};

// Meme mise en forme, avec le signe +/- explicite — pour les indications
// breves de variation de prix ("+2,20 €", "-2,20 €", voir §7/§8/§11).
export const formatEurosDelta = (cents) => {
  if (!Number.isFinite(cents)) return '';
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')} €`;
};
