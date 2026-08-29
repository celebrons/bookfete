-- Phase 04 — Amorce du catalogue de templates et de layouts (moteur sans IA).
-- Complete phase03_data_model.sql : les tables book_templates et
-- layout_definitions existent deja mais sont vides, ce qui bloque
-- POST /api/books/:bookId/compose (aucun layout candidat).
-- 100% additif, relancable sans risque (on conflict (slug) do nothing :
-- si vous avez deja ajuste un libelle/design_tokens a la main, ce script
-- ne l'ecrase pas).

-- ============================================================
-- 1. layout_definitions — catalogue de depart (§06 de la note d'architecture)
-- ============================================================

-- Famille "photo"
insert into public.layout_definitions (slug, label, kind, slot_schema, min_items, max_items, active)
values
  ('photo-pleine-page', 'Photo pleine page', 'photo', '{"slots":[{"type":"photo","size":"full"}]}', 1, 1, true),
  ('photo-avec-marge', 'Photo avec marge', 'photo', '{"slots":[{"type":"photo","size":"inset"}]}', 1, 1, true),
  ('photo-duo-horizontal', 'Duo horizontal', 'photo', '{"slots":[{"type":"photo"},{"type":"photo"}],"orientation":"horizontal"}', 2, 2, true),
  ('photo-duo-vertical', 'Duo vertical', 'photo', '{"slots":[{"type":"photo"},{"type":"photo"}],"orientation":"vertical"}', 2, 2, true),
  ('photo-trio', 'Trio', 'photo', '{"slots":[{"type":"photo"},{"type":"photo"},{"type":"photo"}]}', 3, 3, true),
  ('photo-grille-4', 'Grille de 4', 'photo', '{"slots":[{"type":"photo"},{"type":"photo"},{"type":"photo"},{"type":"photo"}],"arrangement":"grid"}', 4, 4, true),
  ('photo-vignettes', 'Grande photo + vignettes', 'photo', '{"slots":[{"type":"photo","size":"hero"},{"type":"photo","size":"thumb","repeat":true}]}', 2, 6, true),
  ('photo-mosaique', 'Mosaïque', 'photo', '{"slots":[{"type":"photo","repeat":true}],"arrangement":"mosaic"}', 5, 12, true)
on conflict (slug) do nothing;

-- Famille "texte"
insert into public.layout_definitions (slug, label, kind, slot_schema, min_items, max_items, active)
values
  ('texte-centre', 'Message centré', 'texte', '{"slots":[{"type":"texte","align":"center"}]}', 1, 1, true),
  ('texte-pleine-page', 'Message pleine page', 'texte', '{"slots":[{"type":"texte","size":"full"}]}', 1, 1, true),
  ('texte-citation', 'Grande citation', 'texte', '{"slots":[{"type":"texte","style":"quote"}]}', 1, 1, true),
  ('texte-plusieurs-courts', 'Plusieurs messages courts', 'texte', '{"slots":[{"type":"texte","size":"short","repeat":true}]}', 2, 4, true)
on conflict (slug) do nothing;

-- Famille "mixte" (texte + photo dans une meme page, hors bloc contribution)
insert into public.layout_definitions (slug, label, kind, slot_schema, min_items, max_items, active)
values
  ('mixte-texte-photo', 'Message + photo', 'mixte', '{"slots":[{"type":"texte"},{"type":"photo"}]}', 1, 20, true)
on conflict (slug) do nothing;

-- Famille "contribution" (photo(s) + prenom + message d'un meme contributeur)
insert into public.layout_definitions (slug, label, kind, slot_schema, min_items, max_items, active)
values
  ('contribution-standard', 'Contribution', 'contribution', '{"slots":[{"type":"photo","repeat":true,"max":3},{"type":"prenom"},{"type":"texte"}]}', 1, 4, true)
on conflict (slug) do nothing;

-- ============================================================
-- 2. book_templates — trois styles de depart
-- ============================================================
-- design_tokens.slotsPerPage pilote la densite du moteur de mise en page
-- (backend/services/composition/layoutEngine.js) : plus il est bas, plus
-- la composition respire (peu de blocs par page) ; plus il est haut, plus
-- elle est dense.

insert into public.book_templates (slug, label, description, design_tokens, allowed_layouts, active, sort_order)
values
  (
    'elegance',
    'Élégance',
    'Mise en page aérée, une idée par page, typographie généreuse.',
    '{"slotsPerPage": 2, "palette": "ivoire-or", "typography": "serif"}',
    '["photo-pleine-page","photo-avec-marge","photo-duo-horizontal","photo-duo-vertical","texte-centre","texte-citation","texte-pleine-page","contribution-standard"]',
    true,
    1
  ),
  (
    'editorial',
    'Editorial',
    'Mise en page dense façon magazine, grilles et mosaïques de photos.',
    '{"slotsPerPage": 4, "palette": "encre-papier", "typography": "sans-serif"}',
    '["photo-pleine-page","photo-duo-horizontal","photo-trio","photo-grille-4","photo-vignettes","texte-centre","mixte-texte-photo","texte-plusieurs-courts","contribution-standard"]',
    true,
    2
  ),
  (
    'minimal',
    'Minimal',
    'Une photo ou un message par page, marges larges, sobriété maximale.',
    '{"slotsPerPage": 1, "palette": "noir-blanc", "typography": "sans-serif"}',
    '["photo-pleine-page","texte-pleine-page","contribution-standard"]',
    true,
    3
  )
on conflict (slug) do nothing;
