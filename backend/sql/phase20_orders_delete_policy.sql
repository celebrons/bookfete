-- Permettre a un utilisateur de SUPPRIMER sa propre commande.
--
-- Signale le 2026-09-16 : « dans les commandes j'ai l'impression que le
-- bouton supprimer ne marche pas ». Constate en base : 14 commandes encore
-- presentes apres plusieurs tentatives de suppression.
--
-- Cause : sql/orders.sql active RLS sur public.orders et definit les
-- policies select / insert / update — mais AUCUNE pour delete. Sous RLS,
-- une suppression sans policy correspondante ne leve pas d'erreur : elle
-- supprime simplement zero ligne. Le backend recevait donc un succes et
-- repondait « supprimee », alors que la commande etait toujours la.
--
-- La regle est la meme que pour les trois autres : on ne touche qu'a ses
-- propres commandes.
--
-- Le garde-fou metier reste cote application (routes/orders.js) et n'est pas
-- duplique ici : une commande reellement partie en production chez
-- l'imprimeur, ou payee avec Stripe en mode live, est refusee avant meme
-- d'atteindre la base. Ce choix est deliberement conserve — la base autorise,
-- l'application arbitre.

drop policy if exists "orders_owner_delete" on public.orders;
create policy "orders_owner_delete"
  on public.orders
  for delete
  using (auth.uid() = owner_id);
