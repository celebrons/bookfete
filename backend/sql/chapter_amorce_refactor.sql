-- Refonte étape 1 workflow chapitre : amorce + mots-déclencheurs
-- À exécuter dans Supabase SQL editor.

alter table if exists public.chapters
  add column if not exists amorce_text text;

alter table if exists public.chapters
  add column if not exists triggers jsonb not null default '[]'::jsonb;

alter table if exists public.chapters
  add column if not exists amorce_generated_at timestamptz;

alter table if exists public.chapters
  add column if not exists amorce_validated boolean not null default false;

create index if not exists chapters_book_order_idx
  on public.chapters(book_id, order_index);

alter table if exists public.prompt_templates
  drop constraint if exists prompt_templates_type_check;

alter table if exists public.prompt_templates
  add constraint prompt_templates_type_check
  check (type in (
    'book_title',
    'chapter_titles',
    'chapter_amorce',
    'contributor_questions',
    'chapter_body',
    'frame_texts'
  ));
