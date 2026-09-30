import i18n from '../i18n';
import { supabase } from './supabaseClient';

// A LA CONNEXION : si le compte porte deja une langue enregistree, elle
// l'emporte sur ce que localStorage avait detecte sur CET appareil (ex.
// quelqu'un qui a choisi l'anglais depuis son compte, puis se connecte sur
// un nouvel appareil, reste en francais tant que rien ne le lui dit).
// Appele UNE FOIS au demarrage de l'app (App.js) — jamais par ecran.
// onAuthStateChange declenche immediatement avec la session courante des
// l'abonnement (comportement Supabase JS v2), donc ceci couvre aussi une
// page rechargee alors qu'on est deja connecte.
export function initLanguagePreferenceSync() {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    const accountLanguage = session?.user?.user_metadata?.language;
    if (accountLanguage && accountLanguage !== i18n.language) {
      i18n.changeLanguage(accountLanguage);
    }
  });
  return () => subscription.unsubscribe();
}

// CHANGER LA LANGUE (LanguageSwitcher.js) : met a jour i18next (donc
// l'affichage + le cache localStorage du detecteur) et, si un compte est
// connecte, l'enregistre aussi dessus pour qu'elle suive sur un autre
// appareil — meme schema que l'adresse de livraison (AccountSpaceLuxe.js :
// lecture/ecriture via user_metadata). Jamais bloquant si l'ecriture
// echoue : ce n'est qu'une preference d'affichage, pas une donnee critique.
export async function setLanguagePreference(lang) {
  await i18n.changeLanguage(lang);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    // Une session ANONYME n'a pas vocation a durer (voir
    // services/anonymousSession.js) : sa preference reste dans
    // localStorage, jamais ecrite sur un compte qui sera remplace.
    if (user && !user.is_anonymous) {
      await supabase.auth.updateUser({ data: { ...user.user_metadata, language: lang } });
    }
  } catch (_error) {
    // Jamais bloquant.
  }
}
