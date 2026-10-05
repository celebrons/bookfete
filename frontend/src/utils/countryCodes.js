// frontend/src/utils/countryCodes.js
//
// Miroir LEGER de backend/services/printing/countryCodes.js (meme
// convention deja etablie dans ce projet pour les petites tables partagees
// back/front, ex. photoQuality.js) — sert uniquement a savoir, EN TEMPS
// REEL pendant la saisie, s'il faut afficher/exiger le champ Etat/Province
// (StepAddress.js). La validation qui compte reellement reste cote serveur
// (routes/orders.js, isAddressValid).
//
// Premiere commande reelle vers le Canada (2026-10-05) : rejetee par
// Gelato ("Field is required"), decouvert APRES paiement — ce champ
// n'existait nulle part dans le formulaire.

const PAYS_EXIGEANT_UN_ETAT = ['canada', 'quebec', 'québec', 'etats-unis', 'etats unis', 'états-unis', 'états unis', 'usa', 'united states', 'australie', 'australia'];

function normalizeCountryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function requiresStateField(rawCountryValue) {
  const key = normalizeCountryKey(rawCountryValue);
  if (/^[a-z]{2}$/.test(key)) {
    return ['us', 'ca', 'au'].includes(key);
  }
  return PAYS_EXIGEANT_UN_ETAT.some((nom) => normalizeCountryKey(nom) === key);
}
