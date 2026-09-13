-- Phase 17 — mise en page "2 photos horizontales" (TWO_PHOTOS_STACKED)
--
-- Le catalogue ne proposait que TWO_PHOTOS : deux photos COTE A COTE, donc
-- deux cadres etroits et hauts ("2 photos verticales" dans le vocabulaire de
-- l'utilisateur). Il manquait son symetrique : deux photos l'une SOUS l'autre,
-- donc deux cadres larges et bas — le seul arrangement qui accueille sans
-- recadrage brutal une photo prise en paysage (retour utilisateur 2026-09-13).
--
-- Nouveau slug plutot que reactivation de l'ancien `photo-duo-vertical`
-- (inactif, issu du catalogue d'origine) : ce slug est un piege de
-- vocabulaire — il designe deux photos empilees VERTICALEMENT, c'est-a-dire
-- exactement des cadres HORIZONTAUX. Le reactiver sous ce nom garantissait la
-- confusion a la prochaine lecture.
--
-- 100% additif : aucune ligne existante n'est modifiee ni supprimee.
-- A executer une fois dans l'editeur SQL Supabase. Se relance sans risque
-- (on conflict do update + garde idempotente sur allowed_layouts).

insert into public.layout_definitions (slug, label, kind, min_items, max_items, capacity, active)
values
  (
    'TWO_PHOTOS_STACKED', 'Deux photos l''une sous l''autre', 'photo', 2, 2,
    '{"slots":[{"type":"photo"},{"type":"photo"}]}'::jsonb,
    true
  )
on conflict (slug) do update set
  label = excluded.label,
  kind = excluded.kind,
  min_items = excluded.min_items,
  max_items = excluded.max_items,
  capacity = excluded.capacity,
  active = excluded.active;

-- Autorise le nouveau slug dans les 3 styles existants (meme coherence que
-- phase11 : ce qui est disponible dans l'atelier manuel doit l'etre aussi
-- pour la composition automatique). Garde idempotente : ne fait rien si le
-- slug est deja present.
update public.book_templates
set allowed_layouts = allowed_layouts || '["TWO_PHOTOS_STACKED"]'::jsonb
where not (allowed_layouts @> '["TWO_PHOTOS_STACKED"]'::jsonb);
