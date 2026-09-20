-- ============================================================
-- phase23 — retirer la politique permissive restee sur profiles
-- ============================================================
--
-- CE QUI S'EST PASSE.
--
-- phase22 a bien ferme `books` : plus rien n'est lisible ni modifiable sans
-- compte. Mais `profiles` est reste GRAND OUVERT — 197 fiches, avec les
-- adresses e-mail, lisibles avec la cle publique et sans etre connecte.
-- Verifie apres execution, pas suppose :
--
--   node scripts/check-rls.js
--   -> OK     books    : aucune ligne lisible
--   -> FAILLE profiles : 5 ligne(s)
--
-- POURQUOI phase22 N'A PAS SUFFI.
--
-- Les politiques RLS s'ADDITIONNENT (elles sont combinees par OU, jamais par
-- ET). `profiles` portait deja une politique permissive — typiquement le
-- « Public profiles are viewable by everyone » des modeles Supabase, pose
-- hors de ce depot, comme la table et son declencheur (voir phase16).
-- Ajouter `profiles_self_select` n'a donc rien restreint : il suffit qu'UNE
-- politique autorise pour que l'acces passe.
--
-- `books` n'avait aucune politique : l'activation de RLS y a tout ferme d'un
-- coup, ce qui explique que la moitie du correctif ait paru fonctionner.
--
-- CE QUE FAIT CE FICHIER.
--
-- Il retire toutes les politiques de `profiles` SAUF les deux voulues. On
-- procede par boucle plutot qu'en nommant la politique fautive : son nom
-- exact depend du modele utilise a la creation du projet, et personne ici ne
-- l'a choisi. Le backend n'est pas concerne (cle `service_role`, qui
-- contourne RLS), et le navigateur ne lit jamais cette table.
--
-- Idempotent : relancable sans effet de bord.
-- ============================================================

-- 1) Pour voir ce qui existe AVANT (le resultat s'affiche dans l'editeur).
select policyname, cmd, qual::text as condition
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;

-- 2) Le menage.
do $$
declare
  politique record;
begin
  for politique in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname not in ('profiles_self_select', 'profiles_self_update')
  loop
    raise notice 'Suppression de la politique permissive : %', politique.policyname;
    execute format('drop policy %I on public.profiles', politique.policyname);
  end loop;
end $$;

-- 3) Filet de securite : les deux politiques voulues doivent exister, meme
--    si phase22 n'a pas ete execute ou a ete partiellement applique.
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

-- 4) Ce qui doit rester apres : exactement deux lignes.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;

-- ------------------------------------------------------------
-- Verification finale (terminal) :
--   node scripts/check-rls.js   -> doit afficher « OK » partout
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- MEME PIEGE AILLEURS ?
--
-- Les autres tables ont ete sondees le 2026-09-20 et ne laissent rien
-- passer : book_content_items, book_pages, orders, app_events,
-- book_participants, book_snapshots. Seule `book_templates` reste lisible
-- publiquement, et c'est VOULU (politique `book_templates_read_all`,
-- phase03) : ce sont les modeles de livre du catalogue, aucune donnee
-- personnelle.
--
-- Pour verifier a tout moment qu'aucune politique permissive n'est revenue
-- ailleurs, la requete suivante liste celles qui autorisent tout le monde :
--
--   select tablename, policyname, cmd, qual::text
--   from pg_policies
--   where schemaname = 'public' and qual::text in ('true', '(true)')
--   order by tablename;
-- ------------------------------------------------------------
