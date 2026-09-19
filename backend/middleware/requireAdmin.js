// backend/middleware/requireAdmin.js
//
// Controle d'acces de l'espace d'administration (2026-09-12).
//
// Un administrateur voit les livres, les contenus et les emails de TOUS les
// utilisateurs. C'est, de loin, l'autorisation la plus sensible du projet :
// le backend lit deja la base avec une cle service-role (qui contourne RLS),
// donc RIEN d'autre que ce middleware ne protege ces donnees.
//
// DESIGNATION PAR VARIABLE D'ENVIRONNEMENT (`ADMIN_EMAILS`), volontairement,
// plutot qu'une colonne `role` en base :
//   - aucune migration SQL a executer (plusieurs attendent deja d'etre
//     passees sur ce projet — en ajouter une bloquerait la fonctionnalite) ;
//   - surtout : il n'existe AUCUNE ligne en base qu'un attaquant pourrait
//     basculer pour se donner les droits. Devenir administrateur exige
//     l'acces au tableau de bord d'hebergement, pas a l'application.
// Une colonne en base reste possible plus tard (equipe, revocation fine) —
// ce middleware serait alors le seul endroit a changer.
//
// L'email vient du JETON verifie par `authenticate` (Supabase), jamais du
// corps de la requete : il n'est donc pas falsifiable cote client.

const crypto = require('crypto');

const parseAdminEmails = () => String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

// CODE D ACCES PARTAGE (ADMIN_ACCESS_CODE), ajoute le 2026-09-19.
//
// Demande explicite : « ouvrir la page admin a tous les utilisateurs, ca me
// permettra de voir la page quel que soit le compte de test utilise,
// protege-la par un mot de passe si tu veux ».
//
// Le besoin est reel — tester avec plusieurs comptes sans avoir a inscrire
// chacun dans ADMIN_EMAILS. Mais cet espace montre les livres, les contenus
// et les EMAILS de tout le monde : l ouvrir sans rien serait une fuite de
// donnees personnelles. Le code est donc le minimum, pas une precaution
// excessive.
//
// Deux garde-fous :
//   - un code court est REFUSE (et signale), parce qu un code de quatre
//     chiffres se devine en quelques minutes a 300 requetes/minute ;
//   - la comparaison est a temps constant, pour ne pas laisser deviner le
//     code caractere par caractere.
//
// Il reste reserve a la phase de test : en production, ADMIN_EMAILS seul.
const LONGUEUR_MINIMALE = 12;

const adminAccessCode = () => {
  const code = String(process.env.ADMIN_ACCESS_CODE || '').trim();
  if (!code) return '';
  if (code.length < LONGUEUR_MINIMALE) {
    console.warn(
      `[admin] ADMIN_ACCESS_CODE ignore : ${code.length} caracteres, `
      + `${LONGUEUR_MINIMALE} au minimum. L espace reste ferme.`
    );
    return '';
  }
  return code;
};

// Comparaison a temps constant. timingSafeEqual exige deux tampons de meme
// longueur : on hache les deux cotes, ce qui les egalise sans rien reveler.
const memeCode = (fourni, attendu) => {
  if (!fourni || !attendu) return false;
  const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(h(fourni), h(attendu));
};

// Le code voyage dans un en-tete, jamais dans l URL : une URL finit dans
// les journaux du serveur et dans l historique du navigateur.
const codeFourniPar = (req) => String(
  req?.headers?.['x-admin-code'] || ''
).trim();

const isAdminUser = (user, req = null) => {
  // Un compte anonyme n'a pas d'email : il ne peut structurellement pas
  // figurer dans la liste, mais on le refuse explicitement plutot que de
  // compter sur cette coincidence.
  if (!user || user.is_anonymous === true) return false;

  const email = String(user.email || '').trim().toLowerCase();
  if (!email) return false;

  const admins = parseAdminEmails();
  if (admins.includes(email)) return true;

  // A defaut, le code partage. Il exige quand meme un compte connecte avec
  // un email : on veut toujours savoir QUI a consulte quoi (le journal des
  // evenements enregistre cet email).
  const code = adminAccessCode();
  if (code && memeCode(codeFourniPar(req), code)) return true;

  // Ni liste, ni code : espace d'administration ferme. Jamais "ouvert a tous
  // par defaut" — une variable oubliee doit fermer la porte, pas l'ouvrir.
  return false;
};

const requireAdmin = (req, res, next) => {
  if (!isAdminUser(req.user, req)) {
    // 404 et non 403 : ne pas confirmer l'existence d'un espace
    // d'administration a quelqu'un qui n'y a pas droit.
    return res.status(404).json({ error: 'Route not found' });
  }
  return next();
};

module.exports = requireAdmin;
module.exports.isAdminUser = isAdminUser;
module.exports.parseAdminEmails = parseAdminEmails;
// L interface a besoin de savoir s il faut proposer un champ « code ».
// Elle ne recoit jamais le code lui-meme, seulement son existence.
module.exports.codeDemande = () => Boolean(adminAccessCode());
