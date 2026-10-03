// backend/middleware/bookEditLock.js
//
// Verrouillage d'un livre apres paiement (retour utilisateur, 2026-09-28 —
// plan de mise en production, "Verrouiller le livre apres paiement" : "rien
// n'empeche d'ajouter des pages apres avoir paye : le fichier d'impression
// suit le livre au moment de l'envoi, pas au moment du paiement").
//
// `books.locked_at` (sql/phase24_book_payment_lock.sql) est pose UNE SEULE
// FOIS, au tout premier paiement reussi d'une commande liee au livre (voir
// routes/orders.js: persistStripePaymentForOrder) — jamais recalcule ici,
// cette middleware ne fait que LIRE ce qui a deja ete decide.
//
// Attendu : `req.book` deja charge (compose apres requireOwnedBook dans
// composition.js, ou l'equivalent inline dans books.js) — ce module reste
// volontairement independant de la duplication existante de
// requireOwnedBook (composition.js/collective.js) : centraliser CE
// controle-la specifiquement, meme si le reste ne l'est pas, evite qu'une
// copie du verrou diverge silencieusement d'une autre.
//
// BYPASS DE TEST : actif tant que le mode global (voir
// services/settings/appMode.js) n'est pas 'production' — meme bascule
// unique que Stripe/Gelato, plutot qu'une variable d'environnement
// separee a poser/retirer a la main sur le serveur. Sans elle, aucun
// livre deja teste avec un paiement ne pourrait plus jamais etre modifie,
// y compris par le fondateur lui-meme en train de tester le parcours
// complet ; en production reelle, le verrou s'applique sans exception,
// automatiquement, au moment ou le mode bascule — aucune etape manuelle
// supplementaire.
const { t } = require('../services/i18n/t');
const { getAppModeSync } = require('../services/settings/appMode');

function isBookEditBypassActive() {
  return getAppModeSync() !== 'production';
}

function requireBookNotLocked(req, res, next) {
  const book = req.book;
  if (!book?.locked_at) {
    return next();
  }

  if (isBookEditBypassActive()) {
    // Signale au reste de la requete (route handler) que la modification
    // n'a ete autorisee que parce que le mode test est actif — a l'appelant
    // de choisir s'il veut le repercuter dans sa reponse.
    req.bookEditBypassed = true;
    return next();
  }

  return res.status(423).json({
    error: t(
      req,
      'Ce livre ne peut plus être modifié : une commande a déjà été payée.',
      'This book can no longer be edited: an order has already been paid.'
    ),
    bookLocked: true
  });
}

module.exports = { requireBookNotLocked, isBookEditBypassActive };
