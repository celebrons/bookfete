// Envoie UN EXEMPLAIRE DE CHAQUE email transactionnel, pour les voir en vrai.
//
// Pourquoi ce script : declencher chaque email par le parcours reel
// demanderait de creer un livre, d'inviter quelqu'un, de payer une commande
// et d'attendre l'imprimeur. Ici, on voit les huit messages en une minute,
// avec des donnees d'exemple realistes.
//
//   node scripts/tester-emails.js                                -> simulation (n'envoie rien)
//   node scripts/tester-emails.js --a vous@exemple.fr             -> ENVOI REEL, une adresse
//   node scripts/tester-emails.js --a a@x.fr,b@x.fr,c@x.fr        -> ENVOI REEL, plusieurs adresses
//
// DEUX PRECAUTIONS :
//
//   1. SIMULATION PAR DEFAUT. Sans `--a`, rien ne part : on affiche seulement
//      les sujets et le debut de chaque version texte. Un envoi est
//      irreversible.
//   2. PLUSIEURS VRAIES ADRESSES, DELIBEREMENT. Avec Brevo (retour
//      utilisateur 2026-09-28 : "tester vers 3/4 adresses differentes"), un
//      expediteur verifie suffit — contrairement a l'offre gratuite de
//      Resend, limitee a l'adresse du compte tant qu'aucun domaine n'est
//      verifie. `--a` accepte donc une liste separee par des virgules : la
//      totalite des messages part vers CHAQUE adresse listee.

require('dotenv').config();
const { sendEmail, isEmailEnabled } = require('../services/email/brevoClient');
const g = require('../services/email/emailTemplates');

const args = process.argv.slice(2);
const indexA = args.findIndex((a) => a === '--a' || a === '--to');
const DESTINATAIRES = indexA >= 0
  ? args[indexA + 1].split(',').map((a) => a.trim()).filter(Boolean)
  : [];
const SITE = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

// Donnees d'exemple : assez realistes pour juger la mise en forme (un titre
// long, un prix, une date, un numero de suivi), jamais des donnees reelles.
const MESSAGES = [
  ['Invitation a contribuer', g.invitationParticipant({
    lien: `${SITE}/collectif/exemple-token`,
    titreLivre: 'Les 60 ans de Jean',
    pourQui: 'Jean',
    deLaPart: 'Marie',
    message: 'Une photo de vous deux ferait tellement plaisir !',
    dateLimite: '12 octobre 2026'
  })],
  ['Relance (n a pas commence)', g.relanceParticipant({
    lien: `${SITE}/collectif/exemple-token`,
    titreLivre: 'Les 60 ans de Jean',
    pourQui: 'Jean',
    dateLimite: '12 octobre 2026'
  })],
  ['Relance (a deja commence)', g.relanceParticipant({
    lien: `${SITE}/collectif/exemple-token`,
    titreLivre: 'Les 60 ans de Jean',
    pourQui: 'Jean',
    dejaCommence: true
  })],
  ['Nouvelle contribution (au createur)', g.nouvelleContribution({
    lien: `${SITE}/book/exemple/atelier`,
    titreLivre: 'Les 60 ans de Jean',
    contributeur: 'Marie Dupont',
    photos: 7,
    souvenirs: 2
  })],
  ['Retrouver son livre', g.retrouverSonLivre({
    lien: `${SITE}/book/exemple/atelier`,
    titreLivre: 'Voyage a Montreal'
  })],
  ['Commande enregistree', g.commandeConfirmee({
    numero: 'CMD-2026-0042',
    titreLivre: 'Voyage a Montreal',
    format: 'Standard · 21 × 28 cm',
    pages: 30,
    totalCents: 7450,
    lien: `${SITE}/orders`
  })],
  ['Paiement recu', g.paiementRecu({
    numero: 'CMD-2026-0042',
    totalCents: 7450,
    lien: `${SITE}/orders`
  })],
  ['Livre en preparation', g.etapeDeFabrication({ statut: 'print_queued', numero: 'CMD-2026-0042', lien: `${SITE}/orders` })],
  ['Livre en fabrication', g.etapeDeFabrication({ statut: 'sent_to_printer', numero: 'CMD-2026-0042', lien: `${SITE}/orders` })],
  ['Livre imprime', g.etapeDeFabrication({ statut: 'printed', numero: 'CMD-2026-0042', lien: `${SITE}/orders` })],
  ['Livre expedie', g.etapeDeFabrication({
    statut: 'shipped',
    numero: 'CMD-2026-0042',
    suivi: { code: 'LX123456789FR', url: 'https://www.laposte.fr/outils/suivre-vos-envois?code=LX123456789FR' }
  })],
  ['Livre livre', g.etapeDeFabrication({ statut: 'delivered', numero: 'CMD-2026-0042', lien: `${SITE}/orders` })]
];

(async () => {
  console.log(`Site utilise pour les liens : ${SITE}`);
  console.log(`Envoi configure : ${isEmailEnabled() ? 'OUI' : 'NON (aucune cle Brevo valide)'}`);

  if (DESTINATAIRES.length === 0) {
    console.log('\nSIMULATION — aucun email ne part. Ajouter « --a votre@adresse.fr » (ou une liste separee par des virgules) pour envoyer reellement.\n');
    MESSAGES.forEach(([nom, m], i) => {
      console.log(`${String(i + 1).padStart(2)}. ${nom}`);
      console.log(`    sujet : ${m.subject}`);
      console.log(`    texte : ${m.text.split('\n').filter(Boolean)[1] || ''}`);
    });
    console.log(`\n${MESSAGES.length} messages prets.`);
    process.exit(0);
  }

  if (!isEmailEnabled()) {
    console.error('\nERREUR : aucune cle Brevo valide dans backend/.env (BREVO_API_KEY=xkeysib-...).');
    console.error('Rien n a ete envoye.');
    process.exit(1);
  }

  console.log(`\nENVOI REEL vers ${DESTINATAIRES.length} adresse(s) (${DESTINATAIRES.join(', ')}) — ${MESSAGES.length} messages chacune.\n`);
  let envoyes = 0;
  const total = MESSAGES.length * DESTINATAIRES.length;
  for (const destinataire of DESTINATAIRES) {
    console.log(`\n-- ${destinataire} --`);
    for (const [nom, m] of MESSAGES) {
      // Un par un, jamais en parallele : une rafale d'envois simultanes est
      // exactement ce qui declenche les limites de debit.
      // eslint-disable-next-line no-await-in-loop
      const r = await sendEmail({ to: destinataire, subject: `[test] ${m.subject}`, html: m.html, text: m.text });
      console.log(`${r.sent ? '  OK  ' : ' ECHEC'} ${nom}${r.sent ? '' : ' — ' + (r.error || r.skipped)}`);
      if (r.sent) envoyes += 1;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, 600));
    }
  }

  console.log(`\n${envoyes}/${total} envoyes. Verifiez chaque boite de reception ET les indesirables.`);
  process.exit(envoyes === total ? 0 : 1);
})();
