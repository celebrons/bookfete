// backend/services/printing/gelatoStatusSync.js
//
// Rafraichit le statut REEL d'une commande aupres de Gelato (recu,
// imprime, expedie, livre...) et envoie l'email d'etape correspondant
// quand le statut avance vraiment — extrait de GET /:orderId/tracking
// (routes/orders.js) le 2026-10-04 pour etre appelable aussi bien par cette
// route (une personne consulte son suivi) que par un controle periodique en
// arriere-plan (scripts/verifier-statuts-gelato.js) qui ne depend d'aucune
// visite de l'ecran.
//
// AVANT ce controle periodique, un livre pouvait etre reellement expedie
// chez l'imprimeur sans que personne ne le sache jusqu'a ce que quelqu'un
// pense a rouvrir l'ecran de suivi — et sans email, puisque celui-ci n'etait
// declenche que par le changement de statut MANUEL depuis l'administration
// (voir POST /:orderId/status).

const gelatoClient = require('./gelatoClient');
const gelatoTracking = require('./gelatoTracking');
const supabase = require('../../config/supabase');
const { logEvent } = require('../events/eventLog');
const emails = require('../email/transactionalEmails');

// Ordre de progression d'une commande — miroir de ORDER_STATUS_SEQUENCE
// (frontend/src/utils/orderWorkflow.js), meme convention de duplication
// assumee que les autres petites tables partagees de ce projet. Sert a ne
// jamais faire RECULER un statut. 'draft'/'cancelled'/'failed' sont hors
// sequence a dessein : ce ne sont pas des etapes d'avancement.
const ORDER_STATUS_SEQUENCE = [
  'awaiting_payment',
  'paid',
  'pdf_generating',
  'pdf_ready',
  'print_queued',
  'sent_to_printer',
  'printed',
  'shipped',
  'delivered'
];
// Etats definitifs : une fois atteints, plus rien ne les remplace — ni un
// recul dans la sequence normale, ni une annulation/echec qui arriverait
// apres coup.
const ORDER_STATUS_TERMINAL = new Set(['delivered', 'cancelled', 'failed']);

/**
 * @param {object} order - ligne `orders` complete (status, metadata, ...)
 * @param {object} [options]
 * @param {string} [options.consulteePar] - email de la personne a l'origine
 *   de la consultation (ecran de suivi) ; absent pour le controle
 *   automatique, qui agit seul.
 * @returns {Promise<object>} le meme format que renvoyait deja la route.
 */
async function refreshGelatoTracking(order, { consulteePar } = {}) {
  const gelatoOrderId = order.metadata?.gelatoOrderId || null;
  const localState = {
    status: order.status,
    gelatoOrderId,
    gelatoStatus: order.metadata?.gelatoFulfillmentStatus || null,
    gelatoSubmittedAt: order.metadata?.gelatoSubmittedAt || null,
    gelatoError: order.metadata?.gelatoError || null,
    tracking: order.metadata?.tracking || { carrier: null, code: null, url: null },
    delivery: order.metadata?.delivery || { minDate: null, maxDate: null },
    updatedAt: order.updated_at || null
  };

  // Commande PDF, ou impression pas encore soumise a l'imprimeur : rien a
  // demander a Gelato, l'etat local EST l'etat reel.
  if (!gelatoOrderId) {
    return { ...localState, source: 'local', stale: false };
  }

  let gelatoOrder = null;
  // UN 404 N'EST PAS UNE PANNE : c'est Gelato qui dit que cette commande
  // n'existe plus (brouillon supprime depuis leur tableau de bord, par
  // exemple). Sans cette distinction, l'ecran de suivi restait fige
  // indefiniment sur le dernier statut connu.
  let supprimeeChezGelato = false;
  try {
    gelatoOrder = await gelatoClient.getOrder(gelatoOrderId);
  } catch (error) {
    if (error.status === 404) {
      supprimeeChezGelato = true;
    } else {
      console.error('Suivi Gelato indisponible pour la commande', order.id, ':', error.message);
      return { ...localState, source: 'cache', stale: true };
    }
  }

  const rawStatus = supprimeeChezGelato ? 'canceled' : gelatoTracking.readGelatoFulfillmentStatus(gelatoOrder);
  const mappedStatus = gelatoTracking.mapGelatoStatus(rawStatus);
  const tracking = supprimeeChezGelato ? localState.tracking : gelatoTracking.extractTracking(gelatoOrder);
  const delivery = supprimeeChezGelato ? localState.delivery : gelatoTracking.extractDelivery(gelatoOrder);

  // Avancee seulement : un statut inconnu (mappedStatus null) ou anterieur
  // laisse la commande exactement ou elle est. EXCEPTION explicite pour
  // annulation/echec, hors sequence a dessein (voir plus haut) — sans elle
  // un rang de -1 les faisait TOUJOURS rejeter. Jamais applique si la
  // commande a deja atteint un etat definitif.
  const currentRank = ORDER_STATUS_SEQUENCE.indexOf(order.status);
  const nextRank = mappedStatus ? ORDER_STATUS_SEQUENCE.indexOf(mappedStatus) : -1;
  const estAnnulationOuEchec = mappedStatus === 'cancelled' || mappedStatus === 'failed';
  const shouldAdvance = Boolean(mappedStatus) && !ORDER_STATUS_TERMINAL.has(order.status) && (
    estAnnulationOuEchec || (nextRank > -1 && nextRank > currentRank)
  );

  // Un brouillon confirme depuis le tableau de bord Gelato devient une
  // vraie commande sans que notre base le sache. On enregistre donc le
  // type REEL a chaque controle — jamais a l'envers : une commande devenue
  // `order` ne peut plus redevenir `draft` chez nous, sinon une reponse
  // inattendue desarmerait la protection de suppression.
  const typeReel = supprimeeChezGelato ? null : gelatoTracking.readGelatoOrderType(gelatoOrder);
  const typeConnu = order.metadata?.gelatoOrderType || null;
  const typeRetenu = typeConnu === 'order' ? 'order' : (typeReel || typeConnu);

  const nowIso = new Date().toISOString();
  const nextMetadata = {
    ...(order.metadata || {}),
    gelatoFulfillmentStatus: rawStatus || null,
    gelatoOrderType: typeRetenu,
    gelatoCheckedAt: nowIso,
    tracking,
    delivery,
    ...(supprimeeChezGelato ? { gelatoDeletedAt: nowIso } : {})
  };

  if (shouldAdvance) {
    logEvent({
      type: 'status.changed',
      actor: 'gelato',
      orderId: order.id,
      bookId: order.book_id,
      ownerId: order.owner_id,
      message: supprimeeChezGelato
        ? `Commande supprimee chez Gelato (404) : statut ${order.status} -> cancelled`
        : `Statut : ${order.status} -> ${mappedStatus}`,
      metadata: {
        avant: order.status,
        apres: mappedStatus,
        source: 'gelato',
        gelatoStatus: rawStatus,
        supprimeeChezGelato,
        consulteePar: consulteePar || null
      }
    });

    // Email d'etape (2026-10-04) : auparavant uniquement declenche par un
    // changement de statut MANUEL depuis l'administration — un vrai
    // changement detecte ICI, via Gelato, ne previenait jamais le client.
    // `shouldAdvance` est deja la garantie de non-duplication : un controle
    // periodique qui revoit le meme statut au prochain passage ne re-rentre
    // pas dans ce bloc. N'envoie rien pour 'cancelled'/'failed', qui n'ont
    // pas de gabarit dedie (voir emailTemplates.ETAPES) — jamais attendu
    // (voir commentaire equivalent sur POST /:orderId/status).
    emails.envoyerEtapeFabrication({
      order,
      statut: mappedStatus,
      suivi: tracking
    }).catch(() => {});
  }

  const { data: updated } = await supabase
    .from('orders')
    .update({
      ...(shouldAdvance ? { status: mappedStatus } : {}),
      metadata: nextMetadata,
      updated_at: nowIso
    })
    .eq('id', order.id)
    .select('*')
    .single();

  return {
    status: updated?.status || (shouldAdvance ? mappedStatus : order.status),
    gelatoOrderId,
    gelatoStatus: rawStatus || null,
    gelatoStatusUnknown: Boolean(rawStatus && !mappedStatus),
    gelatoSubmittedAt: order.metadata?.gelatoSubmittedAt || null,
    gelatoError: null,
    tracking,
    delivery,
    updatedAt: nowIso,
    source: 'gelato',
    stale: false
  };
}

module.exports = { refreshGelatoTracking, ORDER_STATUS_SEQUENCE, ORDER_STATUS_TERMINAL };
