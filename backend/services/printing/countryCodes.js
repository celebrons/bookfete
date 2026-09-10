// backend/services/printing/countryCodes.js
//
// Convertit le nom de pays saisi en texte libre dans le formulaire de
// livraison (frontend/.../BookCheckoutLuxe.js, champ "Pays", defaut
// "France") en code ISO 3166-1 alpha-2, exige par l'API Commandes Gelato
// (shippingAddress.country). Couvre la France + les marches
// francophones/europeens les plus probables pour ce projet ; repli
// explicite sur 'FR' (jamais un pays au hasard) si le texte saisi n'est
// reconnu par aucune entree.
//
// Fonction pure, aucun acces reseau/disque.

const COUNTRY_NAME_TO_ISO2 = {
  france: 'FR',
  belgique: 'BE',
  belgium: 'BE',
  suisse: 'CH',
  switzerland: 'CH',
  luxembourg: 'LU',
  canada: 'CA',
  'quebec': 'CA',
  monaco: 'MC',
  allemagne: 'DE',
  germany: 'DE',
  espagne: 'ES',
  spain: 'ES',
  italie: 'IT',
  italy: 'IT',
  'royaume-uni': 'GB',
  'royaume uni': 'GB',
  'united kingdom': 'GB',
  angleterre: 'GB',
  'etats-unis': 'US',
  'etats unis': 'US',
  usa: 'US',
  'united states': 'US',
  'pays-bas': 'NL',
  'pays bas': 'NL',
  netherlands: 'NL',
  portugal: 'PT',
  maroc: 'MA',
  morocco: 'MA',
  tunisie: 'TN',
  tunisia: 'TN',
  algerie: 'DZ',
  algeria: 'DZ'
};

const DEFAULT_ISO2 = 'FR';

function normalizeCountryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // retire les accents (ex. "Suède" -> "suede")
}

// Deja un code ISO2 valide (2 lettres) : passe tel quel, jamais reinterprete.
function resolveCountryIso2(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (/^[a-zA-Z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const key = normalizeCountryKey(trimmed);
  return COUNTRY_NAME_TO_ISO2[key] || DEFAULT_ISO2;
}

module.exports = { resolveCountryIso2, DEFAULT_ISO2 };
