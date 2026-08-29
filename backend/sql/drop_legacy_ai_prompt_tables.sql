-- Retrait des tables d'un ancien systeme de prompts, jamais cable au code actuel.
-- Verifie : aucune reference a ai_prompt_templates / ai_prompt_versions dans le code applicatif
-- (seul promptEngine.js + la table prompt_templates sont utilises pour la generation IA active).
-- A executer manuellement dans Supabase SQL editor quand vous etes prets.

drop table if exists public.ai_prompt_versions;
drop table if exists public.ai_prompt_templates;
