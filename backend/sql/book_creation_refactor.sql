-- Refonte parcours de creation de livre (types/sous-types + configuration par livre)
-- Executer une fois dans Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),
  type_slug text not null,
  subtype_slug text not null,
  type_label text not null,
  subtype_label text not null,
  default_tone text not null default 'intime',
  default_chapter_count integer not null default 6 check (default_chapter_count in (4, 6, 8)),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists event_types_type_subtype_uniq
  on public.event_types(type_slug, subtype_slug);

create index if not exists event_types_sort_idx
  on public.event_types(sort_order, type_slug, subtype_slug);

create table if not exists public.book_configs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,

  event_type text not null,
  event_subtype text not null,
  event_date date not null,
  event_location text not null,
  recipient_name text not null,

  recipient_nickname text,
  narrative_style text check (narrative_style in ('poetique', 'factuel', 'intime', 'humoristique')),

  recipient_age integer,
  character_trait text,
  signature_anecdote text,
  signature_phrase text,
  signature_place text,
  future_wish text,
  signature_passion text,

  years_in_role integer,
  job_description_plain text,
  will_be_missed_for text,
  contributor_circle text check (contributor_circle in ('pro', 'family', 'mixed')),
  retirement_project text,

  departure_context text check (departure_context in ('job', 'expat', 'move')),
  time_together text,
  next_destination text,

  recipient_name_2 text,
  how_they_met text,
  complementarity text,
  relationship_duration text,
  couple_anecdote text,

  parents_names text,
  birth_anecdote text,
  family_context text,

  destination text,
  trip_duration text,
  trip_period text,
  group_description text,
  trip_highlight text,
  unexpected_moment text,
  signature_moment text,
  trip_impact text,

  project_name text,
  project_duration text,
  team_description text,
  biggest_challenge text,
  team_joke text,
  project_impact text,
  turning_point text,

  family_name text,
  reunion_occasion text,
  generations_count integer,
  family_ritual text,
  family_legend text,
  family_saying text,
  transmission_wish text,

  chapter_count integer check (chapter_count in (4, 6, 8)),
  book_finish text check (book_finish in ('livret', 'classique', 'luxe')),
  paper_type text check (paper_type in ('satine', 'mat', 'verge_ivoire')),

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists book_configs_book_id_uniq
  on public.book_configs(book_id);

create index if not exists book_configs_event_idx
  on public.book_configs(event_type, event_subtype);

create index if not exists book_configs_updated_idx
  on public.book_configs(updated_at desc);

create or replace function public.set_book_configs_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_event_types_updated_at on public.event_types;
create trigger trg_event_types_updated_at
before update on public.event_types
for each row execute procedure public.set_book_configs_updated_at();

drop trigger if exists trg_book_configs_updated_at on public.book_configs;
create trigger trg_book_configs_updated_at
before update on public.book_configs
for each row execute procedure public.set_book_configs_updated_at();

alter table public.event_types enable row level security;
alter table public.book_configs enable row level security;

drop policy if exists "event_types_read_all" on public.event_types;
create policy "event_types_read_all"
  on public.event_types
  for select
  using (true);

drop policy if exists "book_configs_owner_select" on public.book_configs;
create policy "book_configs_owner_select"
  on public.book_configs
  for select
  using (
    exists (
      select 1
      from public.books b
      where b.id = book_configs.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_configs_owner_insert" on public.book_configs;
create policy "book_configs_owner_insert"
  on public.book_configs
  for insert
  with check (
    exists (
      select 1
      from public.books b
      where b.id = book_configs.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_configs_owner_update" on public.book_configs;
create policy "book_configs_owner_update"
  on public.book_configs
  for update
  using (
    exists (
      select 1
      from public.books b
      where b.id = book_configs.book_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.books b
      where b.id = book_configs.book_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "book_configs_owner_delete" on public.book_configs;
create policy "book_configs_owner_delete"
  on public.book_configs
  for delete
  using (
    exists (
      select 1
      from public.books b
      where b.id = book_configs.book_id
        and b.owner_id = auth.uid()
    )
  );

insert into public.event_types (
  type_slug,
  subtype_slug,
  type_label,
  subtype_label,
  default_tone,
  default_chapter_count,
  sort_order
)
values
  ('anniversaire', 'anniversary_18', 'Anniversaire', '18 ans', 'intime', 6, 10),
  ('anniversaire', 'anniversary_30', 'Anniversaire', '30 ans', 'humoristique', 6, 11),
  ('anniversaire', 'anniversary_40_50', 'Anniversaire', '40 ou 50 ans', 'intime', 8, 12),
  ('anniversaire', 'anniversary_60_70', 'Anniversaire', '60 ou 70 ans', 'poetique', 8, 13),
  ('anniversaire', 'anniversary_80_plus', 'Anniversaire', '80 ans et plus', 'poetique', 8, 14),
  ('anniversaire', 'anniversary_other', 'Anniversaire', 'Autre age', 'intime', 6, 15),

  ('retraite', 'retirement_pro', 'Retraite', 'Retraite vue par les collegues', 'factuel', 6, 20),
  ('retraite', 'retirement_family', 'Retraite', 'Retraite vue par la famille', 'intime', 6, 21),
  ('retraite', 'retirement_mixed', 'Retraite', 'Les deux cercles melanges', 'intime', 8, 22),

  ('depart', 'departure_job', 'Depart', 'Nouveau poste / nouvelle entreprise', 'factuel', 6, 30),
  ('depart', 'departure_expat', 'Depart', 'Expatriation / depart a l etranger', 'poetique', 8, 31),
  ('depart', 'departure_move', 'Depart', 'Demenagement / depart d une ville', 'intime', 6, 32),

  ('mariage', 'wedding_marriage', 'Mariage', 'Mariage', 'poetique', 8, 40),
  ('mariage', 'wedding_pacs', 'Mariage', 'PACS ou union libre', 'intime', 6, 41),
  ('mariage', 'wedding_anniversary', 'Mariage', 'Noces (10, 25, 50 ans...)', 'poetique', 8, 42),

  ('naissance', 'birth_after', 'Naissance', 'Livre de naissance (apres la naissance)', 'intime', 6, 50),
  ('naissance', 'birth_during', 'Naissance', 'Livre de grossesse (pendant l attente)', 'poetique', 6, 51),

  ('voyage', 'trip_friends', 'Voyage', 'Voyage entre amis', 'humoristique', 6, 60),
  ('voyage', 'trip_family', 'Voyage', 'Voyage en famille', 'intime', 8, 61),
  ('voyage', 'trip_school', 'Voyage', 'Voyage scolaire ou colo', 'factuel', 6, 62),

  ('projet', 'project_company', 'Projet', 'Projet d entreprise', 'factuel', 6, 70),
  ('projet', 'project_association', 'Projet', 'Projet associatif ou evenementiel', 'intime', 6, 71),
  ('projet', 'project_school', 'Projet', 'Promotion ou cursus scolaire', 'intime', 6, 72),

  ('famille', 'family_annual', 'Famille', 'Reunion annuelle', 'intime', 6, 80),
  ('famille', 'family_reunion', 'Famille', 'Retrouvailles exceptionnelles', 'poetique', 8, 81),
  ('famille', 'family_memory', 'Famille', 'Livre de memoire / genealogie vivante', 'poetique', 8, 82),

  ('custom', 'custom', 'Choix libre', 'Choix libre', 'intime', 6, 90)
on conflict (type_slug, subtype_slug)
do update
set
  type_label = excluded.type_label,
  subtype_label = excluded.subtype_label,
  default_tone = excluded.default_tone,
  default_chapter_count = excluded.default_chapter_count,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());
