-- Phase 18 — mise en page "1 photo sur double page" (FULL_PHOTO_SPREAD)
--
-- Une seule et meme photo etalee sur les DEUX pages d'une double page. C'est
-- le geste le plus spectaculaire d'un beau livre, et il manquait au catalogue
-- (demande utilisateur 2026-09-13).
--
-- UN SEUL slug, pose sur les DEUX pages : le moteur de rendu deduit la moitie
-- a afficher de la PARITE du numero de page (index pair = page de gauche,
-- impair = page de droite — meme convention que l'atelier, ou
-- leftPageIndex = spread * 2). Deux slugs "left"/"right" auraient double le
-- catalogue pour une information que la position porte deja.
--
-- La page contient donc un seul emplacement photo, comme FULL_PHOTO : c'est
-- l'ecriture des deux pages en meme temps qui fait la double page, pas une
-- capacite particuliere. Rien a inventer cote modele de donnees.
--
-- 100% additif. A executer une fois dans l'editeur SQL Supabase. Se relance
-- sans risque (on conflict do update + garde idempotente sur allowed_layouts).

insert into public.layout_definitions (slug, label, kind, min_items, max_items, capacity, active)
values
  (
    'FULL_PHOTO_SPREAD', 'Une photo sur double page', 'photo', 1, 1,
    '{"slots":[{"type":"photo"}]}'::jsonb,
    true
  )
on conflict (slug) do update set
  label = excluded.label,
  kind = excluded.kind,
  min_items = excluded.min_items,
  max_items = excluded.max_items,
  capacity = excluded.capacity,
  active = excluded.active;

-- Autorise le nouveau slug dans les 3 styles existants (meme principe que
-- phase11/phase17). Garde idempotente : ne fait rien si deja present.
--
-- NOTE : la composition AUTOMATIQUE ne le choisira pas d'elle-meme — elle
-- compose page par page et n'a aucune notion de paire. Ce layout est
-- volontairement reserve au geste manuel dans l'atelier ; l'autoriser ici ne
-- sert qu'a ne pas le faire rejeter par les garde-fous de style.
update public.book_templates
set allowed_layouts = allowed_layouts || '["FULL_PHOTO_SPREAD"]'::jsonb
where not (allowed_layouts @> '["FULL_PHOTO_SPREAD"]'::jsonb);
