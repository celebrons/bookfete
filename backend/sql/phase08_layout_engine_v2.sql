-- Phase 08 — Moteur de mise en page v2 : catalogue de layouts genereiques
-- pilote par le contenu (scoring), nouveaux paliers de pages.
-- Voir le plan "Moteur de mise en page v2" pour le detail des decisions.
--
-- 100% additif au niveau du schema (nouvelle colonne, jamais de suppression
-- de ligne). Les anciens layouts (phase04_layout_catalog_seed.sql) sont
-- desactives (active=false), jamais supprimes : layout_definitions.id est
-- reference par book_pages.layout_id, et les livres deja composes avec
-- l'ancien catalogue doivent continuer a se charger (ils degradent vers un
-- rendu generique cote pageRenderer.js, verifie tolerant a un layout inactif
-- — corrige simplement en recomposant le livre, fonctionnalite deja livree).
--
-- Rejouable sans risque : `on conflict (slug) do update` (contrairement au
-- `do nothing` de phase04) puisque l'objectif explicite est de pouvoir
-- ajuster facilement les valeurs de capacite plus tard, en relancant ce
-- script.

-- ============================================================
-- 1. Colonne capacity : compatibilite structurelle contenu <-> layout,
--    consommee uniquement par layoutEngine.js (slot_schema reste dedie au
--    rendu cote pageRenderer.js, jamais mélangé).
-- ============================================================
alter table public.layout_definitions
  add column if not exists capacity jsonb not null default '{}'::jsonb;

-- ============================================================
-- 2. Nouveau catalogue de ~10-12 layouts generiques (cahier des charges v2).
--    kind/min_items/max_items sont aussi renseignes (pas seulement
--    capacity) : si cette migration tourne avant le deploiement du nouveau
--    code applicatif, l'ancien moteur (qui ne lit que kind/min_items/
--    max_items) reste fonctionnel contre ce catalogue.
-- ============================================================

-- Famille "photo"
insert into public.layout_definitions (slug, label, kind, slot_schema, min_items, max_items, capacity, active)
values
  (
    'FULL_PHOTO', 'Photo pleine page', 'photo',
    '{"slots":[{"type":"photo","size":"full"}]}',
    1, 1,
    '{"slots":[{"type":"photo"}]}',
    true
  ),
  (
    'TWO_PHOTOS', 'Duo de photos', 'photo',
    '{"slots":[{"type":"photo"},{"type":"photo"}]}',
    2, 2,
    '{"slots":[{"type":"photo"},{"type":"photo"}]}',
    true
  ),
  (
    'FOUR_PHOTOS', 'Grille de 4 photos', 'photo',
    '{"slots":[{"type":"photo"},{"type":"photo"},{"type":"photo"},{"type":"photo"}],"arrangement":"grid"}',
    4, 4,
    '{"slots":[{"type":"photo"},{"type":"photo"},{"type":"photo"},{"type":"photo"}]}',
    true
  ),
  (
    'PHOTO_WITH_CAPTION', 'Photo avec legende', 'mixte',
    '{"slots":[{"type":"photo","size":"full"},{"type":"texte","style":"caption"}]}',
    2, 2,
    '{"slots":[{"type":"photo"},{"type":"text","lengthClass":["SHORT"]}]}',
    true
  )
on conflict (slug) do update set
  label = excluded.label,
  kind = excluded.kind,
  slot_schema = excluded.slot_schema,
  min_items = excluded.min_items,
  max_items = excluded.max_items,
  capacity = excluded.capacity,
  active = true;

-- Famille "texte"
insert into public.layout_definitions (slug, label, kind, slot_schema, min_items, max_items, capacity, active)
values
  (
    'ONE_TESTIMONY', 'Un temoignage', 'texte',
    '{"slots":[{"type":"texte","size":"full"}]}',
    1, 1,
    '{"slots":[{"type":"text","lengthClass":["SHORT","MEDIUM","LONG"]}]}',
    true
  ),
  (
    'TWO_TESTIMONIES', 'Deux temoignages', 'texte',
    '{"slots":[{"type":"texte"},{"type":"texte"}],"arrangement":"columns"}',
    2, 2,
    '{"slots":[{"type":"text","lengthClass":["SHORT","MEDIUM"]},{"type":"text","lengthClass":["SHORT","MEDIUM"]}]}',
    true
  ),
  (
    'THREE_TESTIMONIES', 'Trois temoignages', 'texte',
    '{"slots":[{"type":"texte"},{"type":"texte"},{"type":"texte"}],"arrangement":"columns"}',
    3, 3,
    '{"slots":[{"type":"text","lengthClass":["SHORT"]},{"type":"text","lengthClass":["SHORT"]},{"type":"text","lengthClass":["SHORT"]}]}',
    true
  )
on conflict (slug) do update set
  label = excluded.label,
  kind = excluded.kind,
  slot_schema = excluded.slot_schema,
  min_items = excluded.min_items,
  max_items = excluded.max_items,
  capacity = excluded.capacity,
  active = true;

-- Famille "mixte" (l'ordre des slots encode l'ordre visuel photo/texte)
insert into public.layout_definitions (slug, label, kind, slot_schema, min_items, max_items, capacity, active)
values
  (
    'PHOTO_TEXT', 'Photo puis temoignage', 'mixte',
    '{"slots":[{"type":"photo"},{"type":"texte"}]}',
    2, 2,
    '{"slots":[{"type":"photo"},{"type":"text","lengthClass":["SHORT","MEDIUM","LONG"]}]}',
    true
  ),
  (
    'TEXT_PHOTO', 'Temoignage puis photo', 'mixte',
    '{"slots":[{"type":"texte"},{"type":"photo"}]}',
    2, 2,
    '{"slots":[{"type":"text","lengthClass":["SHORT","MEDIUM","LONG"]},{"type":"photo"}]}',
    true
  ),
  (
    'TWO_PHOTOS_TEXT', 'Deux photos et un temoignage', 'mixte',
    '{"slots":[{"type":"photo"},{"type":"photo"},{"type":"texte"}]}',
    3, 3,
    '{"slots":[{"type":"photo"},{"type":"photo"},{"type":"text","lengthClass":["SHORT","MEDIUM"]}]}',
    true
  )
on conflict (slug) do update set
  label = excluded.label,
  kind = excluded.kind,
  slot_schema = excluded.slot_schema,
  min_items = excluded.min_items,
  max_items = excluded.max_items,
  capacity = excluded.capacity,
  active = true;

-- Famille "contribution" : conservee du v1 a l'identique (pas de capacity,
-- garde le comportement min_items/max_items) — le rendu contributeur reste
-- utilise, meme si le mode Groupe est aujourd'hui desactive cote produit.
insert into public.layout_definitions (slug, label, kind, slot_schema, min_items, max_items, active)
values
  ('contribution-standard', 'Contribution', 'contribution', '{"slots":[{"type":"photo","repeat":true,"max":3},{"type":"prenom"},{"type":"texte"}]}', 1, 4, true)
on conflict (slug) do update set active = true;

-- ============================================================
-- 3. Desactivation des anciens layouts v1 (phase04_layout_catalog_seed.sql).
--    IMPORTANT : contribution-standard est explicitement EXCLU de cette
--    liste (voir bloc ci-dessus) — ne pas l'ajouter ici par erreur.
-- ============================================================
update public.layout_definitions
set active = false
where slug in (
  'photo-pleine-page', 'photo-avec-marge', 'photo-duo-horizontal', 'photo-duo-vertical',
  'photo-trio', 'photo-grille-4', 'photo-vignettes', 'photo-mosaique',
  'texte-centre', 'texte-pleine-page', 'texte-citation', 'texte-plusieurs-courts',
  'mixte-texte-photo'
);

-- ============================================================
-- 4. allowed_layouts des 3 styles (book_templates), reecrits sur la
--    nouvelle nomenclature. slotsPerPage n'est plus le controle de densite
--    principal en v2 (le scoring + allowed_layouts le remplacent) : conserve
--    uniquement comme reglage cosmetique herite (TemplateMiniPreview cote
--    front) et filet de securite bas-niveau.
-- ============================================================
update public.book_templates set allowed_layouts =
  '["FULL_PHOTO","TWO_PHOTOS","PHOTO_WITH_CAPTION","ONE_TESTIMONY","TWO_TESTIMONIES","PHOTO_TEXT","TEXT_PHOTO","contribution-standard"]'::jsonb
where slug = 'elegance';

update public.book_templates set allowed_layouts =
  '["FULL_PHOTO","TWO_PHOTOS","FOUR_PHOTOS","PHOTO_WITH_CAPTION","ONE_TESTIMONY","TWO_TESTIMONIES","THREE_TESTIMONIES","PHOTO_TEXT","TEXT_PHOTO","TWO_PHOTOS_TEXT","contribution-standard"]'::jsonb
where slug = 'editorial';

update public.book_templates set allowed_layouts =
  '["FULL_PHOTO","ONE_TESTIMONY","contribution-standard"]'::jsonb
where slug = 'minimal';

-- ============================================================
-- 5. Nouveaux paliers de pages (16/24/32/48/64, remplace 24/32/40/48/60).
--    book_products reste inactif/prix a 0 partout (tarification = phase
--    ulterieure du plan d'ensemble) : aucune commande reelle n'est
--    impactee. Verifie : aucune reference en dur a 40/60 ailleurs dans le
--    code (routes/products.js et productCatalog.js lisent la table
--    dynamiquement).
-- ============================================================
insert into public.book_products (page_count, format, price_cents, active)
values
  (16, 'standard', 0, false),
  (64, 'standard', 0, false)
on conflict (page_count, format) do nothing;

update public.book_products
set active = false
where format = 'standard' and page_count in (40, 60);
