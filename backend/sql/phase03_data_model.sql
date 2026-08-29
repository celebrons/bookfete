-- Phase 03 — Modele de donnees du moteur de mise en page (sans IA).
-- 100% additif : aucune colonne existante n'est supprimee, aucune ligne n'est perdue.
-- A executer une fois dans l'editeur SQL Supabase, sur le projet actuel (bookfete).
-- Se relance sans risque (create if not exists / drop policy if exists partout).

create extension if not exists "pgcrypto";

-- Reutilise la fonction de trigger deja posee par prompt_engine.sql.
-- Redefinie ici au cas ou ce script serait execute seul sur un projet neuf.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- 1. book_templates — catalogue des styles (Elegance, Editorial, Minimal...)
-- ============================================================
create table if not exists public.book_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  label text not null,
  description text not null default '',
  design_tokens jsonb not null default '{}'::jsonb,
  allowed_layouts jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists book_templates_slug_uniq
  on public.book_templates(slug);

drop trigger if exists trg_book_templates_updated_at on public.book_templates;
create trigger trg_book_templates_updated_at
before update on public.book_templates
for each row execute procedure public.set_updated_at();

-- ============================================================
-- 2. layout_definitions — catalogue des mises en page (grilles photo/texte/contribution)
-- ============================================================
create table if not exists public.layout_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  label text not null,
  kind text not null check (kind in ('photo', 'texte', 'contribution', 'mixte')),
  slot_schema jsonb not null default '{}'::jsonb,
  min_items integer not null default 0 check (min_items >= 0),
  max_items integer not null default 1 check (max_items >= min_items),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists layout_definitions_slug_uniq
  on public.layout_definitions(slug);

create index if not exists layout_definitions_kind_idx
  on public.layout_definitions(kind, active);

drop trigger if exists trg_layout_definitions_updated_at on public.layout_definitions;
create trigger trg_layout_definitions_updated_at
before update on public.layout_definitions
for each row execute procedure public.set_updated_at();

-- ============================================================
-- 3. book_content_items — pool de contenu normalise (photos + textes),
--    quelle que soit leur origine (upload solo ou contribution groupe).
-- ============================================================
create table if not exists public.book_content_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  contribution_id uuid references public.contributions(id) on delete set null,
  source text not null check (source in ('upload', 'contribution')),
  kind text not null check (kind in ('photo', 'texte')),
  url text,
  text text,
  metadata jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists book_content_items_book_idx
  on public.book_content_items(book_id, display_order);

create index if not exists book_content_items_contribution_idx
  on public.book_content_items(contribution_id)
  where contribution_id is not null;

drop trigger if exists trg_book_content_items_updated_at on public.book_content_items;
create trigger trg_book_content_items_updated_at
before update on public.book_content_items
for each row execute procedure public.set_updated_at();

-- ============================================================
-- 4. book_pages — sortie du moteur de mise en page (une ligne par page).
--    Remplace le detournement de `contributions` via emails sentinelles.
-- ============================================================
create table if not exists public.book_pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  page_index integer not null check (page_index >= 0),
  layout_id uuid references public.layout_definitions(id),
  content jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists book_pages_book_page_uniq
  on public.book_pages(book_id, page_index);

drop trigger if exists trg_book_pages_updated_at on public.book_pages;
create trigger trg_book_pages_updated_at
before update on public.book_pages
for each row execute procedure public.set_updated_at();

-- ============================================================
-- 5. book_products — grille tarifaire (nombre de pages -> prix), configurable en base.
--    Remplace les constantes codees en dur cote frontend.
-- ============================================================
create table if not exists public.book_products (
  id uuid primary key default gen_random_uuid(),
  page_count integer not null check (page_count > 0),
  format text not null default 'standard',
  price_cents integer not null default 0 check (price_cents >= 0),
  cost_cents integer check (cost_cents >= 0),
  print_product_ref text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists book_products_page_count_format_uniq
  on public.book_products(page_count, format);

drop trigger if exists trg_book_products_updated_at on public.book_products;
create trigger trg_book_products_updated_at
before update on public.book_products
for each row execute procedure public.set_updated_at();

-- Amorce des 5 paliers retenus (§ decisions) — prix a 0, a ajuster manuellement
-- avant d'ouvrir la commande dessus (n'affecte aucune commande existante,
-- ces lignes ne sont lues nulle part tant que le nouveau checkout n'est pas branche).
insert into public.book_products (page_count, format, price_cents, active)
values
  (24, 'standard', 0, false),
  (32, 'standard', 0, false),
  (40, 'standard', 0, false),
  (48, 'standard', 0, false),
  (60, 'standard', 0, false)
on conflict (page_count, format) do nothing;

-- ============================================================
-- 6. books — parametres du moteur (mode de pagination, template, mode de collecte)
-- ============================================================
alter table public.books
  add column if not exists page_count integer check (page_count is null or page_count > 0);

alter table public.books
  add column if not exists page_count_mode text not null default 'auto'
  check (page_count_mode in ('auto', 'manual'));

alter table public.books
  add column if not exists template_id uuid references public.book_templates(id);

alter table public.books
  add column if not exists collection_mode text not null default 'open'
  check (collection_mode in ('open', 'targeted'));

-- ============================================================
-- 7. contributions — rattachement direct au livre (independant du chapitre),
--    chapitre desormais optionnel.
-- ============================================================
alter table public.contributions
  add column if not exists book_id uuid references public.books(id) on delete cascade;

-- Backfill : toute contribution existante est rattachee via son chapitre actuel.
update public.contributions c
set book_id = ch.book_id
from public.chapters ch
where c.chapter_id = ch.id
  and c.book_id is null;

-- On ne verrouille book_id en NOT NULL que si le backfill a tout couvert
-- (securite si des contributions orphelines existent deja en base).
do $$
declare
  remaining integer;
begin
  select count(*) into remaining from public.contributions where book_id is null;
  if remaining = 0 then
    execute 'alter table public.contributions alter column book_id set not null';
  else
    raise notice 'contributions.book_id : % ligne(s) sans book_id apres backfill — NOT NULL non applique, a corriger manuellement.', remaining;
  end if;
end $$;

create index if not exists contributions_book_idx
  on public.contributions(book_id);

-- Le chapitre devient optionnel : une contribution appartient d'abord au livre.
alter table public.contributions
  alter column chapter_id drop not null;

-- ============================================================
-- 8. chapter_invites — chapitre optionnel (invitation ciblee sans chapitre precis
--    possible), + libelle de cible pour le mode "targeted".
-- ============================================================
alter table public.chapter_invites
  alter column chapter_id drop not null;

alter table public.chapter_invites
  add column if not exists target_label text;

-- ============================================================
-- RLS — meme schema que book_configs (proprietaire du livre uniquement),
-- catalogues (templates/layouts/produits) en lecture publique, ecriture
-- reservee au service_role (utilise par le backend, qui contourne RLS).
-- ============================================================
alter table public.book_templates enable row level security;
alter table public.layout_definitions enable row level security;
alter table public.book_products enable row level security;
alter table public.book_content_items enable row level security;
alter table public.book_pages enable row level security;

drop policy if exists "book_templates_read_all" on public.book_templates;
create policy "book_templates_read_all"
  on public.book_templates
  for select
  using (active = true);

drop policy if exists "layout_definitions_read_all" on public.layout_definitions;
create policy "layout_definitions_read_all"
  on public.layout_definitions
  for select
  using (active = true);

drop policy if exists "book_products_read_all" on public.book_products;
create policy "book_products_read_all"
  on public.book_products
  for select
  using (active = true);

drop policy if exists "book_content_items_owner_select" on public.book_content_items;
create policy "book_content_items_owner_select"
  on public.book_content_items
  for select
  using (
    exists (
      select 1 from public.books b
      where b.id = book_content_items.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_content_items_owner_insert" on public.book_content_items;
create policy "book_content_items_owner_insert"
  on public.book_content_items
  for insert
  with check (
    exists (
      select 1 from public.books b
      where b.id = book_content_items.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_content_items_owner_update" on public.book_content_items;
create policy "book_content_items_owner_update"
  on public.book_content_items
  for update
  using (
    exists (
      select 1 from public.books b
      where b.id = book_content_items.book_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.books b
      where b.id = book_content_items.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_content_items_owner_delete" on public.book_content_items;
create policy "book_content_items_owner_delete"
  on public.book_content_items
  for delete
  using (
    exists (
      select 1 from public.books b
      where b.id = book_content_items.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_pages_owner_select" on public.book_pages;
create policy "book_pages_owner_select"
  on public.book_pages
  for select
  using (
    exists (
      select 1 from public.books b
      where b.id = book_pages.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_pages_owner_insert" on public.book_pages;
create policy "book_pages_owner_insert"
  on public.book_pages
  for insert
  with check (
    exists (
      select 1 from public.books b
      where b.id = book_pages.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_pages_owner_update" on public.book_pages;
create policy "book_pages_owner_update"
  on public.book_pages
  for update
  using (
    exists (
      select 1 from public.books b
      where b.id = book_pages.book_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.books b
      where b.id = book_pages.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_pages_owner_delete" on public.book_pages;
create policy "book_pages_owner_delete"
  on public.book_pages
  for delete
  using (
    exists (
      select 1 from public.books b
      where b.id = book_pages.book_id
        and b.owner_id = auth.uid()
    )
  );
