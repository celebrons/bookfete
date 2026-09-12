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

const parseAdminEmails = () => String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const isAdminUser = (user) => {
  // Un compte anonyme n'a pas d'email : il ne peut structurellement pas
  // figurer dans la liste, mais on le refuse explicitement plutot que de
  // compter sur cette coincidence.
  if (!user || user.is_anonymous === true) return false;

  const email = String(user.email || '').trim().toLowerCase();
  if (!email) return false;

  const admins = parseAdminEmails();
  // Liste vide = espace d'administration ferme. Jamais "ouvert a tous par
  // defaut" : une variable oubliee doit fermer la porte, pas l'ouvrir.
  if (admins.length === 0) return false;

  return admins.includes(email);
};

const requireAdmin = (req, res, next) => {
  if (!isAdminUser(req.user)) {
    // 404 et non 403 : ne pas confirmer l'existence d'un espace
    // d'administration a quelqu'un qui n'y a pas droit.
    return res.status(404).json({ error: 'Route not found' });
  }
  return next();
};

module.exports = requireAdmin;
module.exports.isAdminUser = isAdminUser;
module.exports.parseAdminEmails = parseAdminEmails;
