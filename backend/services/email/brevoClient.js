// Envoi d'emails transactionnels via Brevo (ex-Sendinblue).
//
// POURQUOI CE FICHIER EXISTE A COTE DE resendClient.js : l'offre gratuite de
// Resend, sans domaine verifie, n'autorise l'envoi que vers l'adresse du
// compte Resend lui-meme — impossible de tester avec plusieurs vrais
// destinataires (retour utilisateur 2026-09-28 : "tester vers 3/4 adresses
// differentes"). L'offre gratuite de Brevo (300 emails/jour) n'a pas cette
// restriction : un expediteur verifie suffit, sans domaine ni carte
// bancaire.
//
// MEME INTERFACE que resendClient.js (sendEmail/isEmailEnabled/emailValide/
// DEFAULT_FROM) : transactionalEmails.js et les autres appelants n'ont qu'a
// changer leur `require`, rien d'autre. resendClient.js reste en place, non
// supprime — au cas ou.
//
// MEMES GARDE-FOUS QUE resendClient.js, dans le meme ordre d'importance :
//   1. Rien ne part sans cle (BREVO_API_KEY).
//   2. Jamais bloquant pour l'appelant.
//   3. Destinataire verifie avant tout appel reseau.
//
// PAS DE SDK : un seul POST JSON (`fetch`, natif depuis Node 18), meme choix
// que pour Resend.
//
// IPV4 FORCE : Brevo exige d'autoriser l'IP source de chaque cle API. Le
// serveur a les deux piles (IPv4 ET IPv6), et Node/undici prefere IPv6 des
// qu'elle est disponible (Happy Eyeballs) — Brevo voyait alors une adresse
// IPv6 differente de l'IPv4 autorisee, et refusait tout (retour utilisateur
// 2026-09-28, message Brevo : "unrecognised IP address 2001:..."). Autoriser
// aussi l'IPv6 aurait ete un correctif fragile : avec les extensions de vie
// privee (RFC 4941), une IPv6 SLAAC change avec le temps. On force plutot
// TOUT le processus a resoudre les DNS en IPv4 d'abord — l'IPv4 du serveur,
// elle, est fixe (voir memoire "scaleway-test-server").
require('dns').setDefaultResultOrder('ipv4first');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// Une cle Brevo (API v3) commence toujours par `xkeysib-`. Meme raison que
// le prefixe `re_` de Resend : eviter d'authentifier une requete avec le
// marqueur laisse par .env.example (« <ta_cle> »).
const emailValide = (adresse) => typeof adresse === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse.trim());

function brevoApiKey() {
  const cle = (process.env.BREVO_API_KEY || '').trim();
  return cle.startsWith('xkeysib-') ? cle : null;
}

function isEmailEnabled() {
  return Boolean(brevoApiKey());
}

// EMAIL_FROM attendu au format "Nom <adresse@domaine>" (deja la convention
// de resendClient.js) ou une simple adresse. Brevo veut le nom et l'adresse
// separement (`sender: {name, email}`), contrairement au `from` combine de
// Resend.
function parseExpediteur(brut) {
  const valeur = (brut || '').trim();
  const correspondance = valeur.match(/^(.*)<([^>]+)>$/);
  if (correspondance) {
    return { name: correspondance[1].trim().replace(/^"|"$/g, '') || undefined, email: correspondance[2].trim() };
  }
  return { email: valeur };
}

/**
 * Envoie UN email. Ne leve jamais.
 *
 * @param {object} input - { to, subject, html, text, replyTo, attachment }
 * @param {Array<{name:string, content:Buffer|string}>} [input.attachment] -
 *   `content` accepte un Buffer (converti ici en base64) ou une chaine deja
 *   en base64 — pour une facture PDF (voir invoiceService.js), toujours un
 *   Buffer.
 * @returns {Promise<{sent:boolean, skipped?:string, id?:string, error?:string}>}
 */
async function sendEmail({ to, subject, html, text, replyTo, attachment }) {
  if (!emailValide(to)) {
    return { sent: false, skipped: 'destinataire_invalide' };
  }
  if (!subject || !(html || text)) {
    return { sent: false, skipped: 'contenu_manquant' };
  }

  const apiKey = brevoApiKey();
  if (!apiKey) {
    console.log(`[email] non envoye (aucune cle Brevo) -> ${to} : « ${subject} »`);
    return { sent: false, skipped: 'cle_absente' };
  }

  const expediteur = parseExpediteur(process.env.EMAIL_FROM);
  if (!emailValide(expediteur.email)) {
    console.log(`[email] non envoye (EMAIL_FROM absent/invalide) -> ${to} : « ${subject} »`);
    return { sent: false, skipped: 'expediteur_absent' };
  }

  try {
    const reponse = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        sender: expediteur,
        to: [{ email: String(to).trim() }],
        subject,
        ...(html ? { htmlContent: html } : {}),
        ...(text ? { textContent: text } : {}),
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
        ...(Array.isArray(attachment) && attachment.length > 0 ? {
          attachment: attachment.map((piece) => ({
            name: piece.name,
            content: Buffer.isBuffer(piece.content) ? piece.content.toString('base64') : piece.content
          }))
        } : {})
      })
    });

    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      // Le message de Brevo est repris tel quel (ex. "Sender not registered
      // for this account", "You can send max 300 emails/day") : il dit
      // precisement ce qui cloche.
      const detail = corps?.message || `HTTP ${reponse.status}`;
      console.error(`[email] echec -> ${to} : ${detail}`);

      try {
        // eslint-disable-next-line global-require
        require('../events/eventLog').logEvent({
          type: 'email.failed',
          level: 'error',
          actor: 'system',
          message: `Email non remis a ${to}`,
          metadata: { destinataire: to, sujet: subject, motif: String(detail).slice(0, 300) }
        });
      } catch (_error) {
        // Journaliser un echec ne doit jamais en provoquer un autre.
      }

      return { sent: false, error: detail, status: reponse.status };
    }

    console.log(`[email] envoye -> ${to} : « ${subject} » (${corps?.messageId || 'sans id'})`);
    return { sent: true, id: corps?.messageId || null };
  } catch (error) {
    console.error(`[email] erreur reseau -> ${to} : ${error.message}`);

    try {
      // eslint-disable-next-line global-require
      require('../events/eventLog').logEvent({
        type: 'email.failed',
        level: 'error',
        actor: 'system',
        message: `Email non remis a ${to} (erreur reseau)`,
        metadata: { destinataire: to, sujet: subject, motif: String(error.message || error).slice(0, 300) }
      });
    } catch (_error) {
      // Journaliser un echec ne doit jamais en provoquer un autre.
    }

    return { sent: false, error: error.message };
  }
}

module.exports = {
  sendEmail,
  isEmailEnabled,
  emailValide,
  // Pas d'expediteur par defaut universel comme onboarding@resend.dev chez
  // Resend : Brevo exige un expediteur VERIFIE sur le compte, donc EMAIL_FROM
  // doit toujours etre pose explicitement une fois celui-ci verifie.
  DEFAULT_FROM: null
};
