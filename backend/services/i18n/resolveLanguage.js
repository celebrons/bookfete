// backend/services/i18n/resolveLanguage.js
//
// Langue a utiliser pour repondre a une requete (message d'erreur, email
// transactionnel) — chantier bilingue, 2026-09-30/phase 6. Trois sources,
// jamais plus :
//  1. La preference du compte, pour une route authentifiee — deja
//     disponible sur req.user.user_metadata SANS appel Supabase
//     supplementaire (authenticate() y met l'utilisateur Supabase Auth
//     complet, voir middleware/auth.js).
//  2. L'en-tete X-App-Language, envoye explicitement par le frontend sur
//     CHAQUE requete (voir httpClient.js cote frontend) : reflete la
//     langue reellement choisie dans l'app (localStorage, eventuellement
//     differente de la langue du systeme), contrairement a Accept-Language
//     qui ne bouge jamais quand on clique le selecteur de langue. Sans
//     cette source, un visiteur au navigateur francais qui bascule le site
//     en anglais recevrait quand meme des erreurs en francais pour toute
//     route publique (lien de partage, invitation collective).
//  3. L'en-tete Accept-Language envoye par le navigateur, en tout dernier
//     repli — utile seulement quand la requete ne vient pas du frontend
//     connu (ex. un appel direct a l'API).
// Repli sur le francais dans tous les autres cas — jamais une erreur si
// aucune des trois sources ne dit rien, jamais une langue non supportee.
const SUPPORTED = new Set(['fr', 'en']);

function normalize(lang) {
  if (!lang) return null;
  const code = String(lang).trim().slice(0, 2).toLowerCase();
  return SUPPORTED.has(code) ? code : null;
}

// Un en-tete Accept-Language ressemble a "en-US,en;q=0.9,fr;q=0.8" — on ne
// lit que la PREMIERE langue annoncee (la preference principale du
// navigateur), jamais la liste de poids entiere.
function fromAcceptLanguageHeader(header) {
  if (!header) return null;
  const first = String(header).split(',')[0];
  return normalize(first);
}

function resolveLanguage(req) {
  const accountLanguage = normalize(req?.user?.user_metadata?.language);
  if (accountLanguage) return accountLanguage;

  const appLanguage = normalize(req?.headers?.['x-app-language']);
  if (appLanguage) return appLanguage;

  const headerLanguage = fromAcceptLanguageHeader(req?.headers?.['accept-language']);
  if (headerLanguage) return headerLanguage;

  return 'fr';
}

module.exports = { resolveLanguage, SUPPORTED_LANGUAGES: [...SUPPORTED] };
