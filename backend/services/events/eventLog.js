// Journal des evenements metier.
//
// Une ligne par chose importante qui arrive a un livre ou a une commande,
// lisible depuis l'espace d'administration. Voir sql/phase21_app_events.sql
// pour le pourquoi.
//
// REGLE ABSOLUE, la meme que pour les emails : aucune de ces fonctions ne
// leve, et aucune ne fait echouer l'action qui l'a declenchee. Une commande
// payee reste payee meme si son evenement n'a pas pu s'ecrire. Un journal
// perdu se reconstitue ; une commande perdue, non.
//
// Ecriture en ARRIERE-PLAN : l'appelant n'attend pas. Un insert Supabase
// prend quelques dizaines de millisecondes, ce qui est negligeable une fois
// mais s'accumulerait sur un rendu qui en emet plusieurs.

const supabase = require('../../config/supabase');

// D'ou vient l'evenement. Indispensable depuis qu'on fait tourner plusieurs
// environnements sur la MEME base : le 2026-09-18, un serveur reste sur une
// version perimee reecrivait le statut d'une commande, et rien a l'ecran ne
// permettait de savoir lequel des trois avait ecrit.
function environnement() {
  const explicite = String(process.env.APP_ENV || '').trim();
  if (explicite) return explicite;

  const url = String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '');
  if (url.includes('onrender.com')) return 'render';
  if (url.includes('sslip.io')) return 'scaleway';
  if (url.includes('localhost')) return 'local';
  return 'inconnu';
}

const NIVEAUX = new Set(['info', 'warn', 'error']);

const texte = (valeur, max) => {
  if (valeur === null || valeur === undefined) return null;
  const s = String(valeur).trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Enregistre un evenement. Ne leve jamais, n'attend jamais.
 *
 * @param {object} evenement
 * @param {string} evenement.type    'order.created', 'pdf.ready'...
 * @param {string} [evenement.level] info (defaut) | warn | error
 * @param {string} [evenement.message] une phrase lisible
 * @param {string} [evenement.bookId]
 * @param {string} [evenement.orderId]
 * @param {string} [evenement.ownerId]
 * @param {object} [evenement.metadata] le detail propre a ce type
 */
function logEvent({ type, level = 'info', message, bookId, orderId, ownerId, metadata } = {}) {
  const typeNettoye = texte(type, 60);
  if (!typeNettoye) return;

  const ligne = {
    type: typeNettoye,
    level: NIVEAUX.has(level) ? level : 'info',
    message: texte(message, 500),
    book_id: texte(bookId, 60),
    order_id: texte(orderId, 60),
    owner_id: texte(ownerId, 60),
    metadata: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      env: environnement()
    }
  };

  // `.then(ok, ko)` et non `await` : on repart aussitot. Le second argument
  // avale l'echec — sans lui, une table absente (migration pas encore
  // passee) produirait un unhandledRejection a chaque evenement.
  try {
    supabase.from('app_events').insert(ligne).then(
      () => {},
      (error) => {
        console.warn('[evenement] non enregistre :', typeNettoye, '-', error?.message || error);
      }
    );
  } catch (error) {
    console.warn('[evenement] non enregistre :', typeNettoye, '-', error?.message || error);
  }
}

/**
 * Les derniers evenements, pour l'espace d'administration.
 * Filtres facultatifs : une commande, un livre, un niveau.
 */
async function listEvents({ orderId, bookId, level, limit = 200 } = {}) {
  let requete = supabase
    .from('app_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 200, 1), 500));

  if (orderId) requete = requete.eq('order_id', orderId);
  if (bookId) requete = requete.eq('book_id', bookId);
  if (level && NIVEAUX.has(level)) requete = requete.eq('level', level);

  const { data, error } = await requete;
  if (error) throw error;
  return data || [];
}

/**
 * Efface les evenements trop anciens.
 *
 * Sans purge, la table grossit indefiniment — lentement a ce volume, mais
 * une table qu'on ne nettoie jamais finit toujours par poser probleme, et
 * toujours au mauvais moment.
 */
async function purgeEvents({ jours = 90 } = {}) {
  const limite = new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('app_events')
    .delete()
    .lt('created_at', limite)
    .select('id');

  if (error) throw error;
  return { removed: Array.isArray(data) ? data.length : 0 };
}

module.exports = { logEvent, listEvents, purgeEvents, environnement };
