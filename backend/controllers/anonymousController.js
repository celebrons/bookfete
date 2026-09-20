// backend/controllers/anonymousController.js
//
// Demarrage SANS COMPTE (2026-09-12). Le visiteur commence son livre
// immediatement : le frontend ouvre une session Supabase ANONYME
// (`signInAnonymously`, a activer dans le tableau de bord Supabase), qui
// cree un vrai `auth.users` marque `is_anonymous`. Consequence importante :
// `owner_id` existe des le premier instant, donc les livres, l'upload de
// photos, la composition et les regles RLS fonctionnent SANS AUCUNE
// modification — c'est tout l'interet de passer par le mecanisme natif
// plutot que d'inventer un modele "brouillon anonyme" parallele.
//
// Ce controleur ne traite que les deux moments ou ce choix demande un
// arbitrage cote serveur :
//   1. la conversion du compte anonyme en compte reel (meme identifiant, donc
//      rien a deplacer — il manque seulement la ligne `profiles`). Depuis le
//      2026-09-20 cette conversion se fait le plus souvent SANS mot de passe :
//      une adresse e-mail attachee a la session anonyme et verifiee par un
//      code a 6 chiffres (frontend/services/emailOtp.js) ;
//   2. le rattachement a un compte DEJA EXISTANT (identifiant different : les
//      livres commences anonymement doivent changer de proprietaire, sinon
//      ils deviennent orphelins et invisibles).
//
// Le cas 2 est le seul endroit reellement sensible de cette fonctionnalite :
// transferer des livres d'un compte a un autre est exactement le genre
// d'operation qu'un attaquant aimerait detourner. La garantie repose sur un
// point unique et verifiable : le serveur exige le JETON de la session
// anonyme et le valide LUI-MEME aupres de Supabase. Fournir un simple
// identifiant ne suffirait pas — n'importe qui pourrait alors reclamer les
// livres d'autrui en devinant un uuid.

const supabase = require('../config/supabase');

// Valide un jeton de session anonyme et renvoie son utilisateur, ou null.
// Trois refus possibles, tous silencieux pour l'appelant (on ne renseigne
// jamais un attaquant sur la raison de l'echec) :
//   - jeton absent/invalide/expire ;
//   - jeton valide mais d'un compte NON anonyme (on ne transfere jamais les
//     livres d'un vrai compte, meme si son jeton a fuite) ;
//   - jeton identique a l'utilisateur courant (rien a transferer).
async function resolveAnonymousUser(rawToken, currentUserId) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.id) return null;
  if (user.is_anonymous !== true) return null;
  if (user.id === currentUserId) return null;

  return user;
}

// POST /api/auth/anonymous/complete
// Appelee APRES que le client a converti sa session anonyme en compte reel
// (`supabase.auth.updateUser({ email, password })`). L'identifiant ne change
// pas lors d'une conversion : il n'y a donc AUCUN livre a deplacer. Il
// manque seulement la ligne `profiles`, que le parcours d'inscription normal
// cree (voir authController.register) et que la conversion ne cree pas.
const completeAnonymousSignup = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Utilisateur non authentifie' });
    }
    // Garde-fou : ce qui manque pour creer un profil, c'est une ADRESSE,
    // pas un mot de passe. Depuis l'authentification par code
    // (frontend/services/emailOtp.js), un compte legitime peut n'avoir
    // jamais eu de mot de passe — et, selon le moment ou le fournisseur
    // bascule `is_anonymous`, peut meme porter encore ce drapeau alors que
    // son adresse vient d'etre verifiee. On se fonde donc sur l'adresse.
    const email = String(req.user.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(409).json({ error: "Aucune adresse verifiee sur ce compte : la creation du compte n'a pas abouti." });
    }
    const fullName = String(req.body?.full_name || req.user.user_metadata?.full_name || email.split('@')[0] || '').trim();

    const { error } = await supabase
      .from('profiles')
      .upsert([{ id: req.user.id, email, full_name: fullName }], { onConflict: 'id' });

    // Non bloquant, exactement comme a l'inscription normale : un profil
    // manquant ne doit pas empecher quelqu'un d'utiliser son compte.
    if (error) {
      console.warn('Profil non cree apres conversion anonyme', req.user.id, ':', error.message);
    }

    return res.json({ id: req.user.id, email, full_name: fullName });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/anonymous/link
// Appelee APRES connexion a un compte DEJA EXISTANT, quand le visiteur avait
// commence un livre anonymement. L'identifiant a change : les livres
// commences doivent suivre, sinon ils disparaissent pour toujours (ils
// restent lies a un compte anonyme auquel plus personne n'accede).
//
// Seuls les LIVRES sont transferes : tout le reste (pages, souvenirs, photos)
// est rattache au livre par `book_id`, jamais a un proprietaire — rien
// d'autre a deplacer. Les commandes non plus : un compte anonyme ne peut pas
// en creer (voir la garde dans routes/orders.js).
const linkAnonymousBooks = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Utilisateur non authentifie' });
    }
    if (req.user.is_anonymous === true) {
      return res.status(400).json({ error: 'Connectez-vous a un compte reel pour recuperer vos livres.' });
    }

    const anonymousUser = await resolveAnonymousUser(req.body?.anonymousToken, req.user.id);
    if (!anonymousUser) {
      // Volontairement un succes "0 livre" et non une erreur : le cas le plus
      // frequent est un jeton simplement perime (le visiteur avait commence
      // il y a longtemps). Rien a recuperer n'est pas un echec.
      return res.json({ transferred: 0, books: [] });
    }

    const { data, error } = await supabase
      .from('books')
      .update({ owner_id: req.user.id })
      .eq('owner_id', anonymousUser.id)
      .select('id, title');

    if (error) throw error;

    return res.json({ transferred: (data || []).length, books: data || [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  resolveAnonymousUser,
  completeAnonymousSignup,
  linkAnonymousBooks
};
