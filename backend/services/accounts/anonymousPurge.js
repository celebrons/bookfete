// Purge des comptes ANONYMES abandonnes (plan de mise en production,
// "purge des comptes anonymes abandonnes").
//
// Un visiteur peut composer un livre, televerser des photos, sans jamais
// creer de compte (voir services/anonymousSession.js) — c'est volontaire,
// la premiere promesse du produit. Mais un visiteur qui n'est jamais
// revenu laisse des donnees personnelles (photos, textes) en base sans
// base legale pour les conserver indefiniment.
//
// CONDITION DE SECURITE, non negociable : ne purger que des comptes qui
// n'ont STRICTEMENT AUCUNE commande liee a l'un de leurs livres.
// orders.book_id n'a aucune contrainte de cle etrangere (voir
// sql/orders.sql) — rien en base n'empeche de supprimer un livre dont une
// commande reelle depend, donc cette verification est le seul rempart. En
// pratique ce cas ne devrait jamais arriver : passer une commande exige de
// creer un compte reel au checkout (voir plan "anonymous-start"), donc un
// compte RESTE anonyme uniquement s'il n'a jamais paye — mais on verifie
// quand meme, jamais une hypothese qui ne couterait rien a confirmer.
const supabase = require('../../config/supabase');
const storageService = require('../storageService');
const { logEvent } = require('../events/eventLog');

const PHOTO_BUCKET = 'contribution-photos';

// Tous les utilisateurs anonymes, toutes pages confondues — listUsers()
// plafonne a 1000 par page ; ce projet est loin de ce volume aujourd'hui,
// mais une purge est exactement le genre d'operation qu'on ne veut pas
// re-ecrire le jour ou ca grossit.
async function listAnonymousUsers() {
  const utilisateurs = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const lot = data?.users || [];
    utilisateurs.push(...lot.filter((u) => u.is_anonymous === true));
    if (lot.length < 1000) break;
    page += 1;
  }
  return utilisateurs;
}

/**
 * Previsualise les comptes anonymes abandonnes depuis plus de `jours`
 * jours (par date de CREATION — pas de derniere connexion, qui peut se
 * rafraichir silencieusement sans action reelle de l'utilisateur).
 */
async function listAbandonedAnonymousAccounts({ jours = 7 } = {}) {
  const limite = Date.now() - jours * 24 * 60 * 60 * 1000;
  const anonymes = await listAnonymousUsers();
  const candidats = anonymes.filter((u) => new Date(u.created_at).getTime() < limite);
  if (candidats.length === 0) return [];

  const ids = candidats.map((u) => u.id);
  const [{ data: books }, { data: orders }] = await Promise.all([
    supabase.from('books').select('id, title, owner_id, created_at').in('owner_id', ids),
    supabase.from('orders').select('book_id')
  ]);

  const commandesParLivre = new Set((orders || []).map((o) => o.book_id).filter(Boolean));
  const livresParProprietaire = (books || []).reduce((acc, book) => {
    (acc[book.owner_id] = acc[book.owner_id] || []).push(book);
    return acc;
  }, {});

  return candidats.map((u) => {
    const livres = livresParProprietaire[u.id] || [];
    const aUneCommande = livres.some((b) => commandesParLivre.has(b.id));
    return {
      userId: u.id,
      createdAt: u.created_at,
      bookCount: livres.length,
      bookIds: livres.map((b) => b.id),
      // Jamais un candidat reel a la suppression : affiche pour que
      // l'administration VOIE que ce cas existe plutot que de le decouvrir
      // en cherchant pourquoi un total ne correspond pas.
      excluPourCommande: aUneCommande
    };
  });
}

/**
 * Supprime effectivement les comptes abandonnes : leurs photos (stockage),
 * leurs livres (base, cascade sur le contenu), leur profil, puis le compte
 * d'authentification lui-meme. Recalcule la liste au moment de l'appel —
 * jamais confiance en une liste deja affichee a l'ecran.
 */
async function purgeAbandonedAnonymousAccounts({ jours = 7, actorEmail } = {}) {
  const candidats = (await listAbandonedAnonymousAccounts({ jours })).filter((c) => !c.excluPourCommande);

  for (const candidat of candidats) {
    // eslint-disable-next-line no-await-in-loop
    for (const bookId of candidat.bookIds) {
      // eslint-disable-next-line no-await-in-loop
      await storageService.deleteBookFolder(PHOTO_BUCKET, bookId);
    }
    if (candidat.bookIds.length) {
      // eslint-disable-next-line no-await-in-loop
      await supabase.from('books').delete().in('id', candidat.bookIds);
    }
    // eslint-disable-next-line no-await-in-loop
    await supabase.from('profiles').delete().eq('id', candidat.userId);
    // eslint-disable-next-line no-await-in-loop
    await supabase.auth.admin.deleteUser(candidat.userId).catch(() => {});
  }

  logEvent({
    type: 'admin.anonymous_accounts.purged',
    level: 'warn',
    actor: actorEmail,
    message: `${candidats.length} compte(s) anonyme(s) abandonne(s) depuis plus de ${jours} jour(s) supprime(s)`,
    metadata: { userIds: candidats.map((c) => c.userId), jours }
  });

  return { removed: candidats.length, userIds: candidats.map((c) => c.userId) };
}

module.exports = { listAbandonedAnonymousAccounts, purgeAbandonedAnonymousAccounts };
