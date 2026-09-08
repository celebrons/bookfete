-- Phase 11 — 4 nouveaux layouts pour l'atelier de creation personnalisee
-- (edition manuelle page par page) : trois photos, et les 3 mises en page
-- "titre" demandees (titre+texte, titre+2 photos, titre+4 photos).
-- 100% additif : aucune ligne existante n'est supprimee.
-- A executer une fois dans l'editeur SQL Supabase. Se relance sans risque
-- (on conflict do update sur layout_definitions, garde idempotente sur
-- allowed_layouts).
--
-- Meme forme capacity.slots que les layouts v2 existants (voir
-- phase08_layout_engine_v2.sql) : un "titre" n'est pas un nouveau type de
-- slot (capacity ne connait que 'photo'/'text') — c'est un slot texte court
-- (lengthClass SHORT) en premiere position ; c'est la position dans le
-- layout qui lui donne un style de titre au rendu (voir
-- services/composition/pageRenderer.js : renderTitleTextBlock/
-- renderTitlePhotosBlock), pas une propriete de la base.

insert into public.layout_definitions (slug, label, kind, min_items, max_items, capacity, active)
values
  (
    'THREE_PHOTOS', 'Trois photos', 'photo', 3, 3,
    '{"slots":[{"type":"photo"},{"type":"photo"},{"type":"photo"}]}'::jsonb,
    true
  ),
  (
    'TITLE_TEXT', 'Titre et texte', 'mixte', 2, 2,
    '{"slots":[{"type":"text","lengthClass":["SHORT"]},{"type":"text","lengthClass":["SHORT","MEDIUM","LONG"]}]}'::jsonb,
    true
  ),
  (
    'TITLE_TWO_PHOTOS', 'Titre et deux photos', 'mixte', 3, 3,
    '{"slots":[{"type":"text","lengthClass":["SHORT"]},{"type":"photo"},{"type":"photo"}]}'::jsonb,
    true
  ),
  (
    'TITLE_FOUR_PHOTOS', 'Titre et quatre photos', 'mixte', 5, 5,
    '{"slots":[{"type":"text","lengthClass":["SHORT"]},{"type":"photo"},{"type":"photo"},{"type":"photo"},{"type":"photo"}]}'::jsonb,
    true
  )
on conflict (slug) do update set
  label = excluded.label,
  kind = excluded.kind,
  min_items = excluded.min_items,
  max_items = excluded.max_items,
  capacity = excluded.capacity,
  active = excluded.active;

-- Ajoute les 4 nouveaux slugs aux 3 templates existants (coherence de style
-- entre composition automatique et atelier manuel) — garde idempotente sur
-- la presence de THREE_PHOTOS pour ne jamais dupliquer a une relance.
update public.book_templates
set allowed_layouts = allowed_layouts || '["THREE_PHOTOS", "TITLE_TEXT", "TITLE_TWO_PHOTOS", "TITLE_FOUR_PHOTOS"]'::jsonb
where not (allowed_layouts @> '["THREE_PHOTOS"]'::jsonb);
