// Point d'entree unique des emails transactionnels : QUI recoit QUOI, et
// QUAND.
//
// Separe volontairement en trois fichiers :
//   resendClient.js      — comment on envoie (transport)
//   emailTemplates.js    — ce qu'on ecrit (redaction, fonctions pures)
//   transactionalEmails.js (ici) — a quel moment, et a qui
//
// Cette separation n'est pas decorative : le transport et la redaction sont
// testables sans base ni reseau, et c'est ici seulement qu'on touche aux
// donnees d'une commande.
//
// REGLE ABSOLUE : aucune de ces fonctions ne leve, et aucune ne fait echouer
// l'action qui l'a declenchee. Une commande payee reste payee meme si
// l'email ne part pas. Un email perdu se renvoie ; une commande perdue, non.

const { sendEmail, isEmailEnabled } = require('./resendClient');
const gabarits = require('./emailTemplates');

// URL publique du site, pour les liens des emails. Sans elle, on n'ajoute
// simplement aucun bouton plutot que d'envoyer un lien casse vers localhost.
function siteUrl() {
  const brut = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '').trim();
  return brut ? brut.replace(/\/$/, '') : null;
}

const lienCommande = (orderId) => {
  const base = siteUrl();
  return base && orderId ? `${base}/orders` : null;
};

const lienLivre = (bookId) => {
  const base = siteUrl();
  return base && bookId ? `${base}/book/${bookId}/atelier` : null;
};

const formatLisible = (printFormat) => ({
  livret: 'Livret · 20 × 20 cm',
  standard: 'Standard · 21 × 28 cm',
  luxe: 'Luxe · 21 × 28 cm'
}[printFormat] || null);

// Adresse a qui ecrire pour une commande. On ne devine JAMAIS : soit elle est
// connue (adresse de livraison, proprietaire), soit on n'envoie rien.
function destinataireDe({ order, ownerEmail }) {
  const surCommande = order?.shipping_address?.email;
  return (typeof surCommande === 'string' && surCommande.trim())
    ? surCommande.trim()
    : (typeof ownerEmail === 'string' && ownerEmail.trim() ? ownerEmail.trim() : null);
}

async function envoyer(gabarit, destinataire, contexte) {
  if (!gabarit) return { sent: false, skipped: 'aucun_gabarit' };
  if (!destinataire) {
    console.log(`[email] aucun destinataire connu (${contexte}) — rien envoye`);
    return { sent: false, skipped: 'destinataire_inconnu' };
  }
  return sendEmail({ to: destinataire, ...gabarit });
}

/** Lien pour revenir sur son livre — le filet du parcours sans mot de passe. */
async function envoyerLienLivre({ to, book }) {
  const lien = lienLivre(book?.id);
  if (!lien) {
    console.log('[email] PUBLIC_APP_URL absent — lien de livre non envoye');
    return { sent: false, skipped: 'url_site_absente' };
  }
  return envoyer(gabarits.retrouverSonLivre({ lien, titreLivre: book?.title }), to, 'lien livre');
}

/** Commande creee (avant paiement). */
async function envoyerCommandeConfirmee({ order, book, ownerEmail, pricing }) {
  return envoyer(gabarits.commandeConfirmee({
    numero: order?.order_number || order?.id,
    titreLivre: book?.title,
    format: formatLisible(book?.print_format),
    pages: book?.page_count,
    totalCents: pricing?.totalCents ?? order?.total_cents,
    lien: lienCommande(order?.id)
  }), destinataireDe({ order, ownerEmail }), 'commande confirmee');
}

/** Paiement encaisse. */
async function envoyerPaiementRecu({ order, ownerEmail }) {
  return envoyer(gabarits.paiementRecu({
    numero: order?.order_number || order?.id,
    totalCents: order?.total_cents,
    lien: lienCommande(order?.id)
  }), destinataireDe({ order, ownerEmail }), 'paiement recu');
}

/**
 * Etape de fabrication (preparation, imprimerie, expedition, livraison).
 *
 * N'envoie QUE pour les statuts qui ont un message dedie : un statut sans
 * gabarit ne declenche rien, plutot qu'un email vague. C'est aussi ce qui
 * evite d'ecrire a chaque micro-changement d'etat interne.
 */
async function envoyerEtapeFabrication({ order, ownerEmail, statut, suivi }) {
  const gabarit = gabarits.etapeDeFabrication({
    statut,
    numero: order?.order_number || order?.id,
    lien: lienCommande(order?.id),
    suivi
  });
  return envoyer(gabarit, destinataireDe({ order, ownerEmail }), `etape ${statut}`);
}

// --- Mode collectif -------------------------------------------------------

// Lien individuel d'un participant. C'est son invite_token qui l'identifie :
// il n'a ni compte ni mot de passe, et c'est voulu (un proche a qui l'on
// demande trois photos ne doit pas avoir a s'inscrire).
const lienParticipant = (token) => {
  const base = siteUrl();
  return base && token ? `${base}/collectif/${token}` : null;
};

const dateLisible = (valeur) => {
  if (!valeur) return null;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Invitation a contribuer, envoyee a UN participant. */
async function envoyerInvitationParticipant({ participant, book }) {
  const lien = lienParticipant(participant?.invite_token);
  if (!lien) {
    console.log('[email] PUBLIC_APP_URL absent — invitation non envoyee');
    return { sent: false, skipped: 'url_site_absente' };
  }
  return envoyer(gabarits.invitationParticipant({
    lien,
    titreLivre: book?.title,
    pourQui: book?.recipient_name,
    deLaPart: book?.owner_name,
    message: book?.collective_message,
    dateLimite: dateLisible(book?.collective_deadline)
  }), participant?.email, 'invitation participant');
}

/** Relance d'un participant qui n'a pas (ou pas fini de) contribue. */
async function envoyerRelanceParticipant({ participant, book }) {
  const lien = lienParticipant(participant?.invite_token);
  if (!lien) {
    console.log('[email] PUBLIC_APP_URL absent — relance non envoyee');
    return { sent: false, skipped: 'url_site_absente' };
  }
  return envoyer(gabarits.relanceParticipant({
    lien,
    titreLivre: book?.title,
    pourQui: book?.recipient_name,
    dateLimite: dateLisible(book?.collective_deadline),
    // Le message change si la personne a deja commence : lui redire « vous
    // n'avez rien envoye » alors qu'elle a depose deux photos serait vexant.
    dejaCommence: ['started', 'opened'].includes(participant?.status)
  }), participant?.email, 'relance participant');
}

/** Vers le CREATEUR : quelqu'un vient de contribuer a son livre. */
async function envoyerNouvelleContribution({ to, book, contributeur, photos, souvenirs }) {
  return envoyer(gabarits.nouvelleContribution({
    lien: lienLivre(book?.id),
    titreLivre: book?.title,
    contributeur,
    photos,
    souvenirs
  }), to, 'nouvelle contribution');
}

/** Email d'essai, declenche explicitement par l'utilisateur. */
async function envoyerEssai({ to }) {
  return envoyer(gabarits.essai({ destinataire: to }), to, 'essai');
}

module.exports = {
  envoyerInvitationParticipant,
  envoyerRelanceParticipant,
  envoyerNouvelleContribution,
  envoyerLienLivre,
  envoyerCommandeConfirmee,
  envoyerPaiementRecu,
  envoyerEtapeFabrication,
  envoyerEssai,
  isEmailEnabled,
  destinataireDe,
  formatLisible,
  siteUrl
};
