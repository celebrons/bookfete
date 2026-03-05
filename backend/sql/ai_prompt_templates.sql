-- Prompt templates for AI generation
-- Execute this once in Supabase SQL editor before using prompt versioning.

create extension if not exists pgcrypto;

create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,
  event_type text not null default '*',
  locale text not null default 'fr',
  active_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_prompt_templates_unique unique (prompt_key, event_type, locale)
);

create table if not exists public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.ai_prompt_templates(id) on delete cascade,
  version integer not null,
  system_prompt text not null,
  user_prompt_template text not null,
  temperature numeric(4,2),
  max_tokens integer,
  status text not null default 'published',
  created_by text,
  created_at timestamptz not null default now(),
  constraint ai_prompt_versions_unique unique (template_id, version)
);

create index if not exists ai_prompt_templates_lookup_idx
  on public.ai_prompt_templates(prompt_key, event_type, locale);

create index if not exists ai_prompt_versions_template_idx
  on public.ai_prompt_versions(template_id, version desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_prompt_templates_updated_at on public.ai_prompt_templates;
create trigger trg_ai_prompt_templates_updated_at
before update on public.ai_prompt_templates
for each row
execute function public.set_updated_at();
