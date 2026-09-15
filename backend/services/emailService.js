// ANCIEN service d'email — conserve UNIQUEMENT pour l'ancien flux
// d'invitations par chapitres (controllers/inviteController.js, routes montees
// sur /api/invites).
//
// CE FICHIER N'ENVOIE PLUS RIEN LUI-MEME (2026-09-15). Il delegue entierement
// a services/email/, comme tout le reste du produit. Deux raisons :
//
//   1. UN SEUL SYSTEME D'ENVOI. Deux chemins paralleles (nodemailer/SMTP ici,
//      Resend ailleurs) auraient voulu dire deux configurations a maintenir,
//      deux endroits ou un email peut se perdre, et deux habillages qui
//      divergent. Le transport nodemailer etait de toute facon en « mode
//      simulation » : aucune variable SMTP n'a jamais ete posee, donc aucun
//      email n'est jamais parti par ici.
//   2. LA SIGNATURE NE CHANGE PAS. inviteController.js n'a pas ete touche :
//      il appelle les memes fonctions avec les memes arguments. Migrer le
//      transport sans toucher aux appelants est ce qui rend ce changement
//      sur.
//
// Le flux chapitres lui-meme est herite de l'epoque « avec IA » et n'est plus
// alimente par le parcours actuel (les livres sans IA n'ont aucun chapitre —
// voir la memoire du projet). On ne le supprime pas ici : ce serait un autre
// chantier, et rien n'oblige a le faire maintenant. Mais s'il tourne encore,
// il passe desormais par le bon canal.

const { sendEmail } = require('./email/resendClient');
const gabarits = require('./email/emailTemplates');

/**
 * Invitation a contribuer (ancien flux chapitres).
 * Signature inchangee : { to, bookTitle, chapterTitle, inviteLink, customMessage }
 */
const sendInviteEmail = async ({ to, bookTitle, inviteLink, customMessage }) => {
  // Reutilise le gabarit d'invitation du mode collectif : c'est le meme
  // message pour le destinataire (« quelqu'un prepare un livre, ajoutez vos
  // souvenirs »), et un second gabarit presque identique aurait diverge au
  // premier changement de ton.
  const gabarit = gabarits.invitationParticipant({
    lien: inviteLink,
    titreLivre: bookTitle,
    message: customMessage
  });
  return sendEmail({ to, ...gabarit });
};

/**
 * Notification au createur : quelqu'un a contribue (ancien flux chapitres).
 * Signature inchangee : { to, bookTitle, chapterTitle, contributorName }
 */
const sendNewContributionEmail = async ({ to, bookTitle, contributorName }) => {
  const gabarit = gabarits.nouvelleContribution({
    titreLivre: bookTitle,
    contributeur: contributorName
  });
  return sendEmail({ to, ...gabarit });
};

module.exports = {
  sendInviteEmail,
  sendNewContributionEmail
};
