-- Prompts separes pour introduction et epilogue.
-- A executer dans Supabase SQL editor.

alter table if exists public.prompt_templates
  drop constraint if exists prompt_templates_type_check;

alter table if exists public.prompt_templates
  add constraint prompt_templates_type_check
  check (type in (
    'book_title',
    'chapter_titles',
    'book_introduction',
    'book_conclusion',
    'chapter_amorce',
    'contributor_questions',
    'chapter_body',
    'frame_texts'
  ));

