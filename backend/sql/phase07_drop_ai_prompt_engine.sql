-- Retrait complet du moteur de prompts IA (promptEngine.js, aiService.js et
-- tout ce qui en dependait ont ete supprimes du code applicatif). Ce script
-- nettoie ce qui reste en base : plus rien ne lit ni n'ecrit dans ces
-- tables/colonnes depuis le retrait du code.
--
-- A executer une fois dans l'editeur SQL Supabase. Verifie avant d'ecrire
-- ceci : aucune reference a prompt_templates / prompt_generation_logs /
-- chapters.amorce_* dans le code applicatif (grep exhaustif effectue).

-- 1. Tables du moteur de prompts (prompt_engine.sql) — plus aucun code ne
--    les lit, promptEngine.js est supprime.
drop table if exists public.prompt_generation_logs;
drop table if exists public.prompt_templates;

-- 2. Ancien systeme de prompts, deja identifie comme mort avant meme le
--    retrait de l'IA (voir drop_legacy_ai_prompt_tables.sql) — au cas ou
--    ce script n'aurait pas encore ete execute.
drop table if exists public.ai_prompt_versions;
drop table if exists public.ai_prompt_templates;

-- 3. Colonnes ajoutees a chapters pour l'amorce generee par IA
--    (chapter_amorce_refactor.sql) — plus lues ni ecrites.
alter table public.chapters drop column if exists amorce_text;
alter table public.chapters drop column if exists triggers;
alter table public.chapters drop column if exists amorce_generated_at;
alter table public.chapters drop column if exists amorce_validated;
