// backend/controllers/accountController.js
//
// SUPPRESSION DE COMPTE (2026-09-20).
//
// Demande utilisateur, et obligation de bon sens : quelqu'un qui a confie
// ses photos de famille doit pouvoir les retirer sans ecrire a personne.
//
// C'est l'operation la plus destructrice de l'application — elle efface des
// souvenirs, et rien ne les ramene. Trois principes la gouvernent :
//
//   1. ON NE SUPPRIME QUE CE QUI EST A SOI. Chaque requete est filtree sur
//      `owner_id = req.user.id`, jamais sur un identifiant fourni par
//      l'appelant. Le compte supprime est TOUJOURS celui du jeton.
//
//   2. ON REFUSE PLUTOT QUE D'EFFACER A TORT. Si un livre est reellement
//      parti en production chez l'imprimeur, il sera imprime et livre : son
//      suivi doit survivre. On refuse alors la suppression en expliquant
//      pourquoi, plutot que de laisser quelqu'un perdre la trace d'un livre
//      paye. Meme regle que la suppression d'une commande (routes/orders.js).
//
//   3. LES PHOTOS PARTENT AUSSI. Supprimer les lignes en base laisserait les
//      fichiers dans le stockage : invisibles, mais toujours la. Ce serait
//      une suppression de facade.
//
// L'ordre compte : photos, puis donnees, puis le compte lui-meme. Si quelque
// chose echoue en route, l'utilisateur garde son compte et peut reessayer —
// l'inverse (un compte supprime et des donnees orphelines) serait pire.

const supabase = require('../config/supabase');
const { logEvent } = require('../services/events/eventLog');

const PHOTO_BUCKET = 'contribution-photos';

// Liste et efface tout ce qu'un livre a depose dans le stockage. Les
// fichiers d'un livre vivent dans un dossier portant son identifiant (voir
// storageService.uploadFile).
async function supprimerLesPhotosDuLivre(bookId) {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).list(bookId, { limit: 1000 });
  if (error || !Array.isArray(data) || data.length === 0) return 0;

  const chemins = data.filter((entree) => entree.id).map((entree) => `${bookId}/${entree.name}`);
  if (chemins.length === 0) return 0;

  const { error: erreurSuppression } = await supabase.storage.from(PHOTO_BUCKET).remove(chemins);
  return erreurSuppression ? 0 : chemins.length;
}

// Une commande est-elle reellement partie en fabrication ?
//
// Deux facons de le savoir, et l'ordre entre elles a ete corrige par un
// test avant d'atteindre qui que ce soit :
//
//   - `gelatoOrderType === 'order'` : l'imprimeur l'a acceptee comme une
//     vraie commande. Elle sera fabriquee et expediee. C'est definitif.
//
//   - un statut avance ACCOMPAGNE d'un identifiant imprimeur, alors que le
//     type nous est INCONNU. Nos metadonnees peuvent etre en retard : un
//     brouillon confirme depuis le tableau de bord Gelato devient une vraie
//     commande sans nous prevenir (vecu le 2026-09-18). Dans le doute, on
//     refuse.
//
// Mais un `draft` EXPLICITE est cru sur parole, et c'est essentiel : tant
// que GELATO_LIVE_ORDERS n'est pas pose, TOUS nos envois sont des
// brouillons. Bloquer dessus interdirait a chaque testeur de supprimer son
// compte, pour proteger une production qui n'existe pas. Le risque residuel
// — un brouillon confirme a la main, chez un utilisateur qui n'a jamais
// ouvert son suivi — est accepte en connaissance de cause : la route de
// suivi remet ce type a jour des qu'on la consulte, et ne le fait jamais
// redescendre.
function commandeEngageeEnProduction(order) {
  const type = order?.metadata?.gelatoOrderType || null;
  if (type === 'order') return true;
  if (type === 'draft') return false;

  const statut = String(order?.status || '').toLowerCase();
  return ['sent_to_printer', 'printed', 'shipped'].includes(statut)
    && Boolean(order?.metadata?.gelatoOrderId);
}

const supprimerMonCompte = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ error: 'Utilisateur non authentifie' });
    }

    // --- 1. Y a-t-il un livre en cours de fabrication ? -------------------
    const { data: commandes } = await supabase
      .from('orders')
      .select('id, order_number, status, metadata')
      .eq('owner_id', ownerId);

    const enProduction = (commandes || []).filter(commandeEngageeEnProduction);
    if (enProduction.length > 0) {
      const numeros = enProduction.map((c) => c.order_number).join(', ');
      return res.status(409).json({
        error: `Un livre est actuellement en fabrication chez l'imprimeur (${numeros}). `
          + 'Nous devons pouvoir le suivre jusqu\'a sa livraison : ecrivez-nous et nous '
          + 'supprimerons votre compte des qu\'il sera arrive.',
        ordersInProduction: enProduction.map((c) => c.order_number)
      });
    }

    // --- 2. Journaliser AVANT de supprimer --------------------------------
    // Apres, il n'y aura plus personne a nommer : l'evenement ne pourrait
    // plus etre rattache a quoi que ce soit.
    const { data: livres } = await supabase
      .from('books')
      .select('id, title')
      .eq('owner_id', ownerId);

    logEvent({
      type: 'account.deleted',
      actor: 'user',
      ownerId,
      message: `Compte supprime a la demande (${(livres || []).length} livre(s))`,
      metadata: {
        email: req.user.email || null,
        livres: (livres || []).length,
        commandes: (commandes || []).length
      }
    });

    // --- 3. Les photos, livre par livre -----------------------------------
    let fichiersSupprimes = 0;
    for (const livre of livres || []) {
      // eslint-disable-next-line no-await-in-loop
      fichiersSupprimes += await supprimerLesPhotosDuLivre(livre.id);
    }

    // --- 4. Les donnees ----------------------------------------------------
    // Les pages et souvenirs sont rattaches au LIVRE : supprimer les livres
    // les emporte (cle etrangere en cascade). Les commandes, elles, sont
    // rattachees au compte.
    await supabase.from('orders').delete().eq('owner_id', ownerId);
    await supabase.from('books').delete().eq('owner_id', ownerId);
    await supabase.from('profiles').delete().eq('id', ownerId);

    // --- 5. Le compte lui-meme ---------------------------------------------
    // En dernier, et seulement si tout le reste a abouti : un compte
    // supprime avec des donnees restantes serait irrattrapable, l'inverse se
    // corrige en relancant l'operation.
    const { error: erreurCompte } = await supabase.auth.admin.deleteUser(ownerId);
    if (erreurCompte) {
      return res.status(500).json({
        error: 'Vos donnees ont ete supprimees, mais le compte lui-meme n\'a pas pu l\'etre. '
          + 'Ecrivez-nous pour terminer la suppression.'
      });
    }

    return res.json({
      success: true,
      livresSupprimes: (livres || []).length,
      commandesSupprimees: (commandes || []).length,
      fichiersSupprimes
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  supprimerMonCompte,
  // Exportes pour les tests : ce sont les deux decisions qui engagent
  // vraiment quelque chose.
  __commandeEngageeEnProduction: commandeEngageeEnProduction
};
