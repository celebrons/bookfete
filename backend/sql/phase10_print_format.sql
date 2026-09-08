-- Phase 10 — Type d'album (format d'impression) choisi par l'utilisateur.
-- 100% additif : aucune colonne existante n'est supprimee, aucune ligne n'est perdue.
-- A executer une fois dans l'editeur SQL Supabase.
-- Se relance sans risque (add column if not exists).
--
-- Reprend exactement les 3 ids deja definis par
-- backend/services/composition/coverFormat.js (COVER_FORMATS) : livret
-- (148x210mm), standard (210x297mm), luxe (240x320mm). Tout livre existant
-- herite silencieusement de 'standard' (comportement inchange pour qui ne
-- touche pas au nouveau selecteur de Configuration).

alter table public.books
  add column if not exists print_format text not null default 'standard'
  check (print_format in ('livret', 'standard', 'luxe'));
