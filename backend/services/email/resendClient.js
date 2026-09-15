// Envoi d'emails transactionnels via Resend.
//
// POURQUOI RESEND, ET POURQUOI PAS D'ENVOI MAISON : faire partir un email
// depuis notre propre serveur demande de gerer SPF, DKIM, DMARC, la
// reputation d'IP et les boucles de retour — et le moindre faux pas envoie
// les confirmations de commande en spam. C'est exactement le genre de
// probleme qu'on n'a aucune raison de resoudre soi-meme. Un service dedie
// s'en charge ; nous ne faisons qu'un appel HTTP.
//
// PAS DE SDK : l'API Resend est un seul POST JSON. Ajouter une dependance
// pour ca alourdirait l'installation (et le demarrage sur Render) sans rien
// apporter. `fetch` est natif depuis Node 18.
//
// TROIS GARDE-FOUS, dans cet ordre d'importance :
//
//   1. RIEN NE PART SANS CLE. Sans RESEND_API_KEY, aucune requete reseau
//      n'est emise : l'email est seulement journalise. Le code peut donc
//      etre branche partout sans qu'un seul email parte tant que
//      l'utilisateur n'a pas pose sa cle — un envoi est irreversible et
//      sort du produit.
//   2. JAMAIS BLOQUANT. Un echec d'envoi ne fait jamais echouer l'action qui
//      l'a declenche : une commande payee reste payee meme si l'email de
//      confirmation ne part pas. On journalise, on renvoie le detail a
//      l'appelant, et c'est tout.
//   3. DESTINATAIRE VERIFIE. Une adresse absente ou manifestement invalide
//      n'entraine aucun appel — inutile de bruler du quota et de la
//      reputation sur une adresse qui ne peut pas exister.
//
// OFFRE GRATUITE : Resend permet d'envoyer sans domaine verifie ni carte
// bancaire, depuis `onboarding@resend.dev`, MAIS uniquement vers l'adresse
// du compte Resend. C'est suffisant pour tester en vrai. Pour ecrire a de
// vrais clients il faudra verifier un domaine (toujours gratuit) et changer
// EMAIL_FROM.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Expediteur par defaut : celui que Resend autorise sans domaine verifie.
// Remplacer par une adresse de votre domaine une fois celui-ci verifie.
const DEFAULT_FROM = 'Celebrons <onboarding@resend.dev>';

const emailValide = (adresse) => typeof adresse === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse.trim());

function resendApiKey() {
  const cle = (process.env.RESEND_API_KEY || '').trim();
  // Le fichier .env d'exemple contient un marqueur (« <ta_cle> ») : une vraie
  // cle Resend commence toujours par `re_`. Sans cette verification, on
  // enverrait une requete authentifiee avec un texte de remplacement et on
  // croirait a une panne du service.
  return cle.startsWith('re_') ? cle : null;
}

function isEmailEnabled() {
  return Boolean(resendApiKey());
}

/**
 * Envoie UN email. Ne leve jamais.
 *
 * @param {object} input - { to, subject, html, text, replyTo }
 * @returns {Promise<{sent:boolean, skipped?:string, id?:string, error?:string}>}
 */
async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!emailValide(to)) {
    return { sent: false, skipped: 'destinataire_invalide' };
  }
  if (!subject || !(html || text)) {
    return { sent: false, skipped: 'contenu_manquant' };
  }

  const apiKey = resendApiKey();
  if (!apiKey) {
    // Mode journal : tout le reste du code fonctionne normalement, on voit
    // ce qui SERAIT parti, et rien ne sort.
    console.log(`[email] non envoye (aucune cle Resend) -> ${to} : « ${subject} »`);
    return { sent: false, skipped: 'cle_absente' };
  }

  try {
    const reponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: (process.env.EMAIL_FROM || '').trim() || DEFAULT_FROM,
        to: [String(to).trim()],
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });

    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      // Le message de Resend est repris tel quel : il dit precisement ce qui
      // cloche (domaine non verifie, destinataire non autorise en offre
      // gratuite, quota), et le reformuler ferait perdre cette precision.
      const detail = corps?.message || corps?.error || `HTTP ${reponse.status}`;
      console.error(`[email] echec -> ${to} : ${detail}`);
      return { sent: false, error: detail, status: reponse.status };
    }

    console.log(`[email] envoye -> ${to} : « ${subject} » (${corps?.id || 'sans id'})`);
    return { sent: true, id: corps?.id || null };
  } catch (error) {
    console.error(`[email] erreur reseau -> ${to} : ${error.message}`);
    return { sent: false, error: error.message };
  }
}

module.exports = {
  sendEmail,
  isEmailEnabled,
  emailValide,
  DEFAULT_FROM
};
