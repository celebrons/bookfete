-- ============================================================
-- phase22 — RLS sur public.books et public.profiles
-- ============================================================
--
-- CE QUI EST OUVERT AUJOURD'HUI, ET QUI NE DEVRAIT PAS L'ETRE.
--
-- Constate le 2026-09-20 avec la cle ANON publique (celle qu'embarque
-- chaque navigateur), sans etre connecte a quoi que ce soit :
--
--   books    -> 15 lignes LISIBLES, et MODIFIABLES
--   profiles -> 196 lignes lisibles, avec les adresses e-mail
--
-- N'importe qui pouvait donc lire les titres, les destinataires, les dates
-- d'evenement, les adresses e-mail des proprietaires — et renommer ou
-- modifier le livre de quelqu'un d'autre. Les autres tables
-- (book_content_items, book_pages, orders, app_events) etaient, elles,
-- correctement protegees depuis phase03/orders.sql : seules ces deux-la
-- avaient ete oubliees.
--
-- POURQUOI CA NE CASSE RIEN.
--
-- Le backend parle a Supabase avec la cle `service_role`, qui contourne RLS
-- par conception : toutes les routes (composition, commandes, liens de
-- partage collaboratifs, espace admin) continuent de fonctionner a
-- l'identique. Le NAVIGATEUR, lui, ne lit `books` que pour des livres dont
-- l'utilisateur est proprietaire (atelier, tableau de bord, apercu,
-- commande) — y compris en session anonyme, qui possede un vrai `auth.uid()`
-- et est bien proprietaire de ses livres. `profiles` n'est jamais lu depuis
-- le navigateur.
--
-- Les contributeurs d'un album collaboratif passent par le backend via
-- `share_token` (routes /api/public/share/...), donc par `service_role` :
-- ils ne sont pas concernes et n'ont toujours pas besoin de compte.
--
-- Idempotent et non destructif : aucune donnee n'est touchee, les politiques
-- sont recreees a chaque execution.
-- ============================================================

-- ------------------------------------------------------------
-- books : un livre n'appartient qu'a son proprietaire
-- ------------------------------------------------------------
alter table public.books enable row level security;

drop policy if exists "books_owner_select" on public.books;
create policy "books_owner_select"
  on public.books
  for select
  using (owner_id = auth.uid());

drop policy if exists "books_owner_insert" on public.books;
create policy "books_owner_insert"
  on public.books
  for insert
  with check (owner_id = auth.uid());

-- `using` ET `with check` : sans le second, un proprietaire legitime
-- pourrait reassigner son livre a quelqu'un d'autre en modifiant owner_id.
drop policy if exists "books_owner_update" on public.books;
create policy "books_owner_update"
  on public.books
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "books_owner_delete" on public.books;
create policy "books_owner_delete"
  on public.books
  for delete
  using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- profiles : chacun ne voit que sa propre fiche
-- ------------------------------------------------------------
-- Jamais lue depuis le navigateur aujourd'hui : on ferme donc au plus
-- serre. Les ecrans qui affichent le proprietaire d'un livre (espace admin)
-- passent par le backend et sa cle `service_role`.
alter table public.profiles enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select"
  on public.profiles
  for select
  using (id = auth.uid());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Pas de politique d'INSERT ni de DELETE : la ligne est creee par un
-- declencheur sur auth.users et par le backend (authController.register /
-- anonymousController.completeAnonymousSignup), tous deux en service_role.
-- Laisser un client creer ou supprimer une fiche n'a aucun usage legitime.

-- ------------------------------------------------------------
-- book_participants : l'inverse du probleme, trouve en verifiant
-- ------------------------------------------------------------
-- Constate le 2026-09-20 : la table contient 2 lignes reelles, et le
-- navigateur en voit ZERO. Elle a donc RLS active SANS aucune politique
-- (phase15_collective_mode.sql n'en pose aucune) : tout est refuse, y
-- compris au proprietaire du livre.
--
-- Consequence silencieuse : le tableau de bord joint
-- `participants:book_participants(status)` pour compter les participants
-- d'un album collectif. Cette jointure revient vide pour tout le monde —
-- les albums collectifs affichent donc toujours 0 participant, sans
-- qu'aucune erreur ne le signale.
--
-- Une politique de LECTURE pour le proprietaire du livre suffit : les
-- ecritures (invitations, changements de statut) passent par le backend en
-- service_role, qui contourne RLS.
alter table public.book_participants enable row level security;

drop policy if exists "book_participants_owner_select" on public.book_participants;
create policy "book_participants_owner_select"
  on public.book_participants
  for select
  using (
    exists (
      select 1 from public.books b
      where b.id = book_participants.book_id
        and b.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- Verification (a lancer apres, cote serveur) :
--   node scripts/check-rls.js
-- Il rejoue exactement les acces qui passaient avant cette migration et
-- doit tous les voir refuses.
-- ------------------------------------------------------------
