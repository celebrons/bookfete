-- Prompt engine schema (DB-first prompts, no hardcoded content).
-- Run once in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'book_title',
    'chapter_titles',
    'book_introduction',
    'book_conclusion',
    'chapter_amorce',
    'contributor_questions',
    'chapter_body',
    'frame_texts'
  )),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  label text not null default '',
  system_prompt text not null default '',
  context_block text not null default '',
  data_block text not null default '',
  output_format text not null default '',
  forbidden_phrases jsonb not null default '[]'::jsonb,
  min_words integer not null default 0 check (min_words >= 0),
  max_words integer not null default 0 check (max_words >= 0),
  activated_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by text null
);

create unique index if not exists prompt_templates_type_active_uniq
  on public.prompt_templates(type)
  where status = 'active';

create unique index if not exists prompt_templates_type_version_uniq
  on public.prompt_templates(type, version);

create index if not exists prompt_templates_lookup_idx
  on public.prompt_templates(type, status, version desc);

create table if not exists public.prompt_generation_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.prompt_templates(id) on delete cascade,
  template_version integer not null,
  prompt_type text not null,
  attempt integer not null check (attempt > 0),
  word_count integer not null default 0 check (word_count >= 0),
  is_valid boolean not null default false,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists prompt_generation_logs_template_idx
  on public.prompt_generation_logs(template_id, created_at desc);

create index if not exists prompt_generation_logs_type_idx
  on public.prompt_generation_logs(prompt_type, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_prompt_templates_updated_at on public.prompt_templates;
create trigger trg_prompt_templates_updated_at
before update on public.prompt_templates
for each row execute procedure public.set_updated_at();
