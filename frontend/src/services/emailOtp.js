// frontend/src/services/emailOtp.js
//
// AUTHENTIFICATION PAR E-MAIL + CODE A 6 CHIFFRES (2026-09-20).
//
// Le principe du produit : on ne demande rien tant que la valeur n'est pas
// visible. Le visiteur cree son livre, depose ses photos, compose et voit
// son apercu en session ANONYME (voir anonymousSession.js). Le compte n'est
// exige qu'au moment de commander — et meme la, on ne lui demande qu'une
// adresse e-mail, jamais un mot de passe a inventer et a retenir.
//
// DEUX CHEMINS, PARCE QUE DEUX SITUATIONS VRAIMENT DIFFERENTES :
//
//   A. CONVERSION (le cas normal). Le visiteur a une session anonyme et une
//      adresse encore inconnue. On attache l'adresse au compte anonyme :
//      `updateUser({ email })`. L'IDENTIFIANT NE CHANGE PAS, donc le livre,
//      les photos, les pages et la commande en cours restent rattaches sans
//      aucun transfert. C'est le chemin le plus sur : il n'y a rien a
//      deplacer, donc rien a perdre.
//
//   B. CONNEXION. L'adresse est deja connue (retour depuis un autre
//      appareil, ou compte existant), ou il n'y a pas de session anonyme du
//      tout. On ouvre alors une session sur le compte de cette adresse
//      (`signInWithOtp`, qui cree le compte s'il n'existe pas). L'identifiant
//      CHANGE : les livres commences anonymement doivent suivre, d'ou le
//      rattachement cote serveur (POST /auth/anonymous/link), dont le jeton
//      anonyme est mis de cote AVANT la verification — la verification
//      remplace la session et le detruirait.
//
// Le chemin A bascule automatiquement sur B si l'adresse appartient deja a
// un compte : c'est la seule logique de decision de ce module.
//
// ETAT AU 2026-09-20 : seul le chemin B est actif — voir CONVERSION_SUR_PLACE
// plus bas, qui explique pourquoi et comment revenir en arriere.
//
// PRE-REQUIS EXTERNES (tableau de bord Supabase), sans lesquels aucun code
// n'arrive :
//   1. modele d'e-mail de connexion : utiliser {{ .Token }} et non
//      {{ .ConfirmationURL }}, sinon Supabase envoie un lien, pas un code ;
//   2. un chemin d'envoi. ETAT AU 2026-09-20 : le service INTEGRE de
//      Supabase, qui suffit pour une phase de test mais impose deux limites
//      a connaitre — il n'envoie qu'aux MEMBRES DE L'ORGANISATION Supabase
//      (sinon « Email address not authorized »), et environ 2 e-mails par
//      heure et par projet. Un SMTP externe leve les deux ;
//   3. la limitation de debit « Email OTP » est LA protection contre l'abus
//      de demandes — elle vit dans Supabase, pas dans notre serveur, que ces
//      appels ne traversent jamais.

import { supabase } from './supabaseClient';
import {
  getCurrentSession,
  isAnonymousSession,
  rememberAnonymousTokenBeforeLogin,
  linkAnonymousBooksAfterLogin
} from './anonymousSession';
import { getApiBaseUrl } from './compositionApi';

export const VOIE_CONVERSION = 'conversion';
export const VOIE_CONNEXION = 'connexion';

// UN SEUL CHEMIN TANT QUE L'ENVOI PASSE PAR SUPABASE (2026-09-20).
//
// La conversion sur place (chemin A) est la plus elegante : elle attache
// l'adresse au compte anonyme, donc l'identifiant ne change pas et il n'y a
// RIEN a transferer. Elle est pourtant desactivee pour l'instant, apres
// verification des reglages reels du projet — deux raisons, chacune
// suffisante :
//
//   1. ELLE UTILISE UN AUTRE MODELE D'E-MAIL. `updateUser({ email })`
//      declenche le modele « Change Email Address », pas celui de connexion.
//      Seul ce dernier a ete configure avec {{ .Token }} : un testeur
//      recevrait un LIEN la ou l'ecran lui demande un CODE.
//
//   2. LE PROJET EST EN `mailer_autoconfirm: true` (releve le 2026-09-20 sur
//      /auth/v1/settings). Le changement d'adresse peut alors etre applique
//      SANS e-mail du tout : aucun code n'arriverait, et l'adresse serait
//      attachee sans avoir ete verifiee.
//
// Le chemin B (signInWithOtp) n'a aucun de ces deux problemes : un seul
// modele, celui qui est configure, et une verification obligatoire. Le livre
// commence anonymement n'est pas perdu pour autant — il est rattache par
// POST /auth/anonymous/link, route existante, eprouvee et testee.
//
// POUR REACTIVER la conversion sur place : configurer le modele « Change
// Email Address » avec {{ .Token }}, activer « Confirm email », puis
// repasser cette constante a true.
const CONVERSION_SUR_PLACE = false;

// Supabase ne renvoie pas de code d'erreur stable pour « cette adresse est
// deja prise » : on reconnait donc le message, en restant large. Se tromper
// ici n'est pas grave — on bascule sur le chemin B, qui fonctionne dans les
// deux cas ; simplement, le livre passera par un rattachement au lieu d'etre
// conserve tel quel.
function adresseDejaUtilisee(erreur) {
  const texte = `${erreur?.message || ''} ${erreur?.code || ''}`.toLowerCase();
  return /already|exists|registered|taken|duplicate/.test(texte);
}

function messageLisible(erreur, repli) {
  const texte = String(erreur?.message || '').trim();
  if (!texte) return repli;
  if (/rate limit|too many|seconds/i.test(texte)) {
    return 'Trop de demandes coup sur coup. Patientez une minute avant de redemander un code.';
  }
  if (/invalid|expired/i.test(texte)) {
    return 'Ce code est invalide ou a expire. Demandez-en un nouveau.';
  }
  return texte;
}

/**
 * Demande l'envoi du code de connexion.
 * @returns {Promise<{voie: string}>} le chemin emprunte, a repasser a
 *   `verifierLeCode` — c'est lui qui determine comment Supabase doit
 *   verifier le code.
 */
export async function demanderUnCode(email) {
  const adresse = String(email || '').trim().toLowerCase();
  if (!adresse || !adresse.includes('@')) {
    throw new Error('Indiquez une adresse e-mail valide.');
  }

  const session = await getCurrentSession();

  if (CONVERSION_SUR_PLACE && isAnonymousSession(session)) {
    const { error } = await supabase.auth.updateUser({ email: adresse });
    if (!error) {
      return { voie: VOIE_CONVERSION };
    }
    if (!adresseDejaUtilisee(error)) {
      throw new Error(messageLisible(error, "L'envoi du code a echoue."));
    }
    // L'adresse appartient deja a un compte : on ne peut pas la rattacher a
    // la session anonyme, on se connecte a ce compte et on transferera les
    // livres commences.
  }

  // Le jeton anonyme doit etre mis de cote MAINTENANT : la verification du
  // code remplacera la session et il serait perdu avec elle.
  await rememberAnonymousTokenBeforeLogin();

  const { error } = await supabase.auth.signInWithOtp({
    email: adresse,
    options: { shouldCreateUser: true }
  });
  if (error) {
    throw new Error(messageLisible(error, "L'envoi du code a echoue."));
  }
  return { voie: VOIE_CONNEXION };
}

/**
 * Verifie le code recu et ouvre/complete le compte.
 * @returns {Promise<{voie: string, transferred: number}>}
 */
export async function verifierLeCode({ email, code, voie }) {
  const adresse = String(email || '').trim().toLowerCase();
  const jeton = String(code || '').trim();
  // Bornes larges a dessein : la longueur exacte est un reglage du
  // fournisseur (de 6 a 10 chiffres), invisible depuis l'application. Mieux
  // vaut laisser passer un code de la mauvaise longueur et le faire refuser
  // par le serveur — qui, lui, sait — que bloquer un code valide.
  if (!/^\d{6,10}$/.test(jeton)) {
    throw new Error('Le code ne contient que des chiffres. Recopiez-le tel qu il figure dans l e-mail.');
  }

  // `email_change` pour une conversion (on attache une adresse a un compte
  // existant), `email` pour une connexion (on ouvre une session sur le
  // compte de cette adresse). Se tromper de type fait echouer la
  // verification d'un code pourtant correct.
  const type = voie === VOIE_CONVERSION ? 'email_change' : 'email';
  const { error } = await supabase.auth.verifyOtp({ email: adresse, token: jeton, type });
  if (error) {
    throw new Error(messageLisible(error, 'Verification impossible.'));
  }

  // Chemin B seulement : l'identifiant a change, les livres commences
  // anonymement doivent suivre. Le serveur revalide lui-meme le jeton
  // anonyme — c'est lui qui decide, pas nous (anonymousController.js).
  let transferred = 0;
  if (voie !== VOIE_CONVERSION) {
    const resultat = await linkAnonymousBooksAfterLogin();
    transferred = Number(resultat?.transferred || 0);
  }

  await completerLeProfil();
  return { voie, transferred };
}

// La ligne `profiles` n'est creee ni par une conversion ni par une connexion
// OTP (contrairement a l'inscription classique, voir backend
// authController.register). On la demande au serveur, qui la pose avec
// l'identite verifiee du jeton. Jamais bloquant : le compte existe, seul le
// profil manquerait.
async function completerLeProfil() {
  const session = await getCurrentSession();
  if (!session?.access_token) return;
  try {
    await fetch(`${getApiBaseUrl()}/auth/anonymous/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({})
    });
  } catch (_error) {
    // Silencieux, volontairement.
  }
}
