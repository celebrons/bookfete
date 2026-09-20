// Cette configuration SMTP fonctionne-t-elle VRAIMENT ?
//
//   node scripts/tester-smtp.js \
//     --hote smtp.mail.yahoo.com --port 465 \
//     --utilisateur vous@yahoo.fr --motdepasse "abcd efgh ijkl mnop" \
//     --vers un.testeur@example.com
//
// Ecrit le 2026-09-20. Pour que des testeurs recoivent leur code a 6
// chiffres, il faut donner un SMTP a Supabase. Le probleme : si la
// configuration est fausse, on ne s'en apercoit qu'au moment ou un testeur
// attend son code et ne le voit jamais arriver — au pire moment, sans
// message d'erreur exploitable.
//
// Ce script fait l'essai AVANT, en isolation, avec les memes reglages que
// ceux qu'on s'apprete a coller dans le tableau de bord. En cas d'echec il
// traduit les erreurs SMTP courantes, qui sont notoirement obscures.
//
// UN SEUL EMAIL PART, vers l'adresse donnee explicitement en ligne de
// commande. Rien n'est envoye sans cette adresse.

const nodemailer = require('nodemailer');

const args = process.argv.slice(2);
const valeur = (nom) => {
  const i = args.indexOf(nom);
  return i > -1 ? args[i + 1] : null;
};

const HOTE = valeur('--hote');
const PORT = Number(valeur('--port') || 587);
const UTILISATEUR = valeur('--utilisateur');
const MOTDEPASSE = valeur('--motdepasse');
const VERS = valeur('--vers');
const DE = valeur('--de') || UTILISATEUR;

function expliquer(erreur) {
  const texte = `${erreur?.code || ''} ${erreur?.responseCode || ''} ${erreur?.message || ''}`.toLowerCase();

  if (/eauth|535|534|authentication/.test(texte)) {
    return [
      'Identifiants refuses par le serveur.',
      '',
      "  La cause la plus frequente : vous avez donne le mot de passe de votre",
      "  boite, et non un MOT DE PASSE D'APPLICATION. Gmail et Yahoo refusent",
      '  tous deux le mot de passe normal pour un acces SMTP.',
      '',
      '  Il faut d abord activer la validation en deux etapes sur le compte,',
      '  puis generer un mot de passe d application dedie (16 caracteres).'
    ].join('\n');
  }
  if (/etimedout|econnrefused|enotfound|timeout/.test(texte)) {
    return [
      'Impossible de joindre le serveur.',
      '',
      `  Verifiez l'hote (${HOTE}) et le port (${PORT}).`,
      '  Ports habituels : 465 pour SSL direct, 587 pour STARTTLS.',
      '  Un pare-feu ou un reseau d entreprise peut aussi bloquer ces ports.'
    ].join('\n');
  }
  // A DISTINGUER ABSOLUMENT du cas precedent : ici la configuration testee
  // peut etre parfaitement juste, c'est le magasin de certificats de la
  // MACHINE qui ne permet pas de valider la chaine. Vu le 2026-09-20 sur un
  // poste Windows, ou Node n'utilise pas le magasin du systeme. Annoncer
  // « changez de port » enverrait chercher un probleme qui n'existe pas.
  if (/unable to verify the first certificate|self signed/.test(texte)) {
    return [
      'La chaine de certificats n a pas pu etre validee PAR CETTE MACHINE.',
      '',
      '  Ce n est probablement pas votre configuration : c est le magasin de',
      '  certificats local. Node n utilise pas celui de Windows par defaut.',
      '',
      '  Deux facons d en avoir le coeur net :',
      '    node --use-system-ca scripts/tester-smtp.js ...  (meme machine)',
      '    ou lancez le script depuis le serveur, ou la question ne se pose pas.'
    ].join('\n');
  }
  if (/ssl|wrong version|epprotocol/.test(texte)) {
    return [
      'Negociation chiffree en echec.',
      '',
      '  Le plus souvent : le port et le mode ne correspondent pas.',
      '  465 attend une connexion SSL immediate, 587 attend STARTTLS.',
      '  Essayez l autre port.'
    ].join('\n');
  }
  if (/550|553|relay|not allowed|sender/.test(texte)) {
    return [
      "L'expediteur est refuse.",
      '',
      `  Vous tentez d envoyer depuis ${DE}.`,
      '  Gmail et Yahoo n autorisent que VOTRE PROPRE adresse comme',
      '  expediteur. Avec un service transactionnel (Brevo, Mailjet...), il',
      '  faut avoir valide cette adresse dans leur interface.'
    ].join('\n');
  }
  return erreur?.message || 'Erreur inconnue.';
}

async function main() {
  const manquants = [
    ['--hote', HOTE], ['--utilisateur', UTILISATEUR],
    ['--motdepasse', MOTDEPASSE], ['--vers', VERS]
  ].filter(([, v]) => !v).map(([nom]) => nom);

  if (manquants.length > 0) {
    console.error(`\nParametres manquants : ${manquants.join(', ')}\n`);
    console.error('Exemple :');
    console.error('  node scripts/tester-smtp.js --hote smtp.mail.yahoo.com --port 465 \\');
    console.error('    --utilisateur vous@yahoo.fr --motdepasse "xxxx xxxx xxxx xxxx" \\');
    console.error('    --vers un.testeur@example.com\n');
    process.exit(1);
  }

  console.log(`\nEssai SMTP : ${UTILISATEUR} via ${HOTE}:${PORT}\n`);

  const transport = nodemailer.createTransport({
    host: HOTE,
    port: PORT,
    // 465 = canal chiffre des la connexion ; 587 = connexion claire puis
    // STARTTLS. Se tromper donne une erreur de certificat incomprehensible.
    secure: PORT === 465,
    auth: { user: UTILISATEUR, pass: MOTDEPASSE }
  });

  try {
    await transport.verify();
    console.log('  1/2  connexion et identifiants acceptes');
  } catch (erreur) {
    console.error(`  ECHEC a la connexion\n\n${expliquer(erreur)}\n`);
    console.error(`  (message d origine : ${erreur.code || ""} ${erreur.message})\n`);
    process.exit(1);
  }

  try {
    const envoi = await transport.sendMail({
      from: DE,
      to: VERS,
      subject: 'Celebrons — essai de configuration',
      text: [
        'Cet email confirme que la configuration SMTP fonctionne.',
        '',
        `Serveur : ${HOTE}:${PORT}`,
        `Expediteur : ${DE}`,
        '',
        'Vous pouvez maintenant la reporter dans Supabase :',
        'Authentication > Emails > SMTP Settings.',
        '',
        'Les codes a 6 chiffres partiront alors par ce chemin.'
      ].join('\n')
    });
    console.log(`  2/2  email remis au serveur (id ${envoi.messageId})`);
  } catch (erreur) {
    console.error(`  ECHEC a l envoi\n\n${expliquer(erreur)}\n`);
    console.error(`  (message d origine : ${erreur.code || ""} ${erreur.message})\n`);
    process.exit(1);
  }

  console.log(`\nRESULTAT : OK — un email est parti vers ${VERS}.`);
  console.log('Verifiez sa reception, y compris dans les indesirables : un');
  console.log('message qui part n est pas encore un message qui arrive.\n');
}

main().catch((erreur) => {
  console.error(`\nECHEC : ${erreur.message}\n`);
  process.exit(1);
});
