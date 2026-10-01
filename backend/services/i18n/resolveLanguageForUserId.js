// backend/services/i18n/resolveLanguageForUserId.js
//
// Langue d'un DESTINATAIRE D'EMAIL identifie par son owner_id — distinct de
// resolveLanguage.js (qui lit une REQUETE en cours). Un email transactionnel
// part souvent sans requete HTTP vivante a ce moment-la (ex. PDF pret,
// generee en arriere-plan bien apres le retour de la requete qui a lance
// l'export ; relance automatique a venir), donc rien a lire sur un `req`.
//
// Reutilise la MEME source de verite que le reste du chantier bilingue
// (user_metadata.language, synchronisee par languagePreference.js cote
// frontend) plutot que d'ajouter une colonne SQL dediee : l'information
// existe deja, une deuxieme copie ne ferait que se desynchroniser avec le
// temps (ex. l'utilisateur change de langue, la colonne resterait figee).
//
// Mode collectif (invitationParticipant/relanceParticipant) : le participant
// invite n'a pas de compte, donc pas de langue a lui — on retombe
// deliberement sur celle de l'ORGANISATEUR (le proprietaire du livre), seule
// langue connue dans ce contexte. Approximation assumee, pas une erreur.
const supabase = require('../../config/supabase');
const { SUPPORTED_LANGUAGES } = require('./resolveLanguage');

async function resolveLanguageForUserId(userId) {
  if (!userId) return 'fr';
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return 'fr';
    const lang = String(data.user.user_metadata?.language || '').trim().slice(0, 2).toLowerCase();
    return SUPPORTED_LANGUAGES.includes(lang) ? lang : 'fr';
  } catch (_error) {
    return 'fr';
  }
}

module.exports = { resolveLanguageForUserId };
