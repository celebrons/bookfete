// Point d'entree unique des emails transactionnels : QUI recoit QUOI, et
// QUAND.
//
// Separe volontairement en trois fichiers :
//   brevoClient.js       — comment on envoie (transport ; resendClient.js
//                          garde la meme interface si besoin d'y revenir)
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

const { sendEmail, isEmailEnabled } = require('./brevoClient');
const gabarits = require('./emailTemplates');
const { resolveLanguageForUserId } = require('../i18n/resolveLanguageForUserId');

// Langue du DESTINATAIRE de chaque email (chantier bilingue, phase 6) — pas
// celle de qui declenche l'envoi (souvent personne : webhook Stripe, job de
// generation PDF en arriere-plan). On resout via owner_id plutot que
// d'exiger un `req` que la moitie des appelants de ce fichier n'ont pas (voir
// resolveLanguageForUserId.js pour pourquoi). Mode collectif : la langue
// retournee est celle de l'ORGANISATEUR (proprietaire du livre), le
// participant invite n'ayant pas de compte propre.
const langueProprietaire = (ownerId) => resolveLanguageForUserId(ownerId);

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

// Le PDF se telecharge depuis l'ecran de suivi du parcours de commande,
// pas depuis la liste des commandes : on envoie donc la ou se trouve
// reellement le bouton.
const lienTelechargementPdf = (bookId) => {
  const base = siteUrl();
  return base && bookId ? `${base}/book/${bookId}/checkout` : null;
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
  const lang = await langueProprietaire(book?.owner_id);
  return envoyer(gabarits.retrouverSonLivre({ lien, titreLivre: book?.title, lang }), to, 'lien livre');
}

/** Commande creee (avant paiement). */
async function envoyerCommandeConfirmee({ order, book, ownerEmail, pricing }) {
  const lang = await langueProprietaire(order?.owner_id || book?.owner_id);
  return envoyer(gabarits.commandeConfirmee({
    numero: order?.order_number || order?.id,
    titreLivre: book?.title,
    format: formatLisible(book?.print_format),
    pages: book?.page_count,
    totalCents: pricing?.totalCents ?? order?.total_cents,
    lien: lienCommande(order?.id),
    lang
  }), destinataireDe({ order, ownerEmail }), 'commande confirmee');
}

/** Paiement encaisse. */
async function envoyerPaiementRecu({ order, ownerEmail }) {
  const lang = await langueProprietaire(order?.owner_id);
  return envoyer(gabarits.paiementRecu({
    numero: order?.order_number || order?.id,
    totalCents: order?.total_cents,
    lien: lienCommande(order?.id),
    lang
  }), destinataireDe({ order, ownerEmail }), 'paiement recu');
}

/**
 * Facture emise — PDF en piece jointe (voir invoiceService.js). Contrairement
 * aux autres emails de ce fichier, celui-ci porte une piece jointe : le
 * `pdfBuffer` est fourni par l'appelant (jamais relu depuis le stockage ici,
 * le fichier vient d'etre genere dans le meme appel).
 */
async function envoyerFacture({ order, invoice, pdfBuffer, ownerEmail }) {
  // invoice.buyer.email : deja resolu par invoiceService.js (adresse de
  // facturation -> livraison -> compte reel) — plus complet que
  // destinataireDe(), qui ne connait pas la facturation ni le compte.
  const destinataire = invoice?.buyer?.email || destinataireDe({ order, ownerEmail });
  if (!destinataire) {
    console.log('[email] aucun destinataire connu (facture) — rien envoye');
    return { sent: false, skipped: 'destinataire_inconnu' };
  }
  const lang = await langueProprietaire(order?.owner_id);
  const gabarit = gabarits.factureEmise({
    numeroFacture: invoice?.invoice_number,
    numeroCommande: order?.order_number || order?.id,
    totalCents: order?.total_cents,
    lien: lienCommande(order?.id),
    lang
  });
  return sendEmail({
    to: destinataire,
    ...gabarit,
    attachment: pdfBuffer ? [{ name: `${invoice?.invoice_number || 'facture'}.pdf`, content: pdfBuffer }] : undefined
  });
}

/**
 * PDF pret.
 *
 * Le rendu dure plusieurs minutes : l'interface invite l'utilisateur a
 * fermer la page pendant ce temps. Cet email est la contrepartie de cette
 * invitation — sans lui, la promesse serait fausse.
 */
async function envoyerPdfPret({ order, book, ownerEmail }) {
  const lang = await langueProprietaire(order?.owner_id || book?.owner_id);
  return envoyer(gabarits.pdfPret({
    titreLivre: book?.title,
    pages: book?.page_count,
    lien: lienTelechargementPdf(book?.id || order?.book_id),
    lang
  }), destinataireDe({ order, ownerEmail }), 'pdf pret');
}

/**
 * Etape de fabrication (preparation, imprimerie, expedition, livraison).
 *
 * N'envoie QUE pour les statuts qui ont un message dedie : un statut sans
 * gabarit ne declenche rien, plutot qu'un email vague. C'est aussi ce qui
 * evite d'ecrire a chaque micro-changement d'etat interne.
 */
async function envoyerEtapeFabrication({ order, ownerEmail, statut, suivi }) {
  const lang = await langueProprietaire(order?.owner_id);
  const gabarit = gabarits.etapeDeFabrication({
    statut,
    numero: order?.order_number || order?.id,
    lien: lienCommande(order?.id),
    suivi,
    lang
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
  // Langue de l'ORGANISATEUR (le participant invite n'a pas de compte, donc
  // pas de langue propre — voir langueProprietaire ci-dessus).
  const lang = await langueProprietaire(book?.owner_id);
  return envoyer(gabarits.invitationParticipant({
    lien,
    titreLivre: book?.title,
    pourQui: book?.recipient_name,
    deLaPart: book?.owner_name,
    message: book?.collective_message,
    dateLimite: dateLisible(book?.collective_deadline),
    lang
  }), participant?.email, 'invitation participant');
}

/** Relance d'un participant qui n'a pas (ou pas fini de) contribue. */
async function envoyerRelanceParticipant({ participant, book }) {
  const lien = lienParticipant(participant?.invite_token);
  if (!lien) {
    console.log('[email] PUBLIC_APP_URL absent — relance non envoyee');
    return { sent: false, skipped: 'url_site_absente' };
  }
  const lang = await langueProprietaire(book?.owner_id);
  return envoyer(gabarits.relanceParticipant({
    lien,
    titreLivre: book?.title,
    pourQui: book?.recipient_name,
    dateLimite: dateLisible(book?.collective_deadline),
    // Le message change si la personne a deja commence : lui redire « vous
    // n'avez rien envoye » alors qu'elle a depose deux photos serait vexant.
    dejaCommence: ['started', 'opened'].includes(participant?.status),
    lang
  }), participant?.email, 'relance participant');
}

/** Vers le CREATEUR : quelqu'un vient de contribuer a son livre. */
async function envoyerNouvelleContribution({ to, book, contributeur, photos, souvenirs }) {
  const lang = await langueProprietaire(book?.owner_id);
  return envoyer(gabarits.nouvelleContribution({
    lien: lienLivre(book?.id),
    titreLivre: book?.title,
    contributeur,
    photos,
    souvenirs,
    lang
  }), to, 'nouvelle contribution');
}

/** Email d'essai, declenche explicitement par l'utilisateur. `lang` transmis
 *  par l'appelant (routes/orders.js) : requete authentifiee, resolveLanguage
 *  deja disponible sur son propre req, inutile de redemander a Supabase. */
async function envoyerEssai({ to, lang }) {
  return envoyer(gabarits.essai({ destinataire: to, lang }), to, 'essai');
}

// --- Alertes techniques internes (2026-09-27) ------------------------------
//
// Reutilise ADMIN_EMAILS (middleware/requireAdmin.js) : une seule variable
// d'environnement designe deja qui gere ce projet, pas une deuxieme a poser
// et a tenir a jour en double. Plusieurs adresses possibles (separees par
// des virgules), un email chacune : sendEmail() n'accepte qu'un destinataire
// a la fois (voir resendClient.js), et melanger plusieurs adresses dans un
// meme envoi les exposerait les unes aux autres.
function adressesAdmin() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((adresse) => adresse.trim())
    .filter(Boolean);
}

/**
 * Alerte un administrateur d'un incident technique (paiement Stripe
 * echoue/expire, generation PDF definitivement echouee, etc.) — JAMAIS
 * bloquant pour l'action qui l'a declenchee (meme regle absolue que le
 * reste de ce fichier, voir l'entete).
 *
 * Sans ADMIN_EMAILS configuree, rien ne part et c'est journalise : mieux
 * vaut un silence explicite dans les logs qu'une erreur qui remonterait
 * jusqu'a l'utilisateur pour un probleme qui ne le concerne pas.
 */
async function envoyerAlerteAdmin({ sujet, lignes, details }) {
  const destinataires = adressesAdmin();
  if (destinataires.length === 0) {
    console.log(`[email] alerte admin non envoyee (ADMIN_EMAILS absente) : ${sujet}`);
    return { sent: false, skipped: 'admin_emails_absente' };
  }
  const gabarit = gabarits.alerteAdmin({ sujet, lignes, details });
  const resultats = await Promise.all(
    destinataires.map((to) => envoyer(gabarit, to, `alerte admin : ${sujet}`))
  );
  return { sent: resultats.some((r) => r.sent), resultats };
}

module.exports = {
  envoyerInvitationParticipant,
  envoyerRelanceParticipant,
  envoyerNouvelleContribution,
  envoyerLienLivre,
  envoyerCommandeConfirmee,
  envoyerPaiementRecu,
  envoyerFacture,
  envoyerPdfPret,
  envoyerEtapeFabrication,
  envoyerEssai,
  envoyerAlerteAdmin,
  isEmailEnabled,
  destinataireDe,
  formatLisible,
  siteUrl
};
