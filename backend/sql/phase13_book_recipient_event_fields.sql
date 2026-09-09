-- Phase 13 — colonnes manquantes sur public.books : recipient_name/event_date.
--
-- Bug signale par l'utilisateur (2026-09-09) : creer un livre collaboratif
-- ("livre collectif") avec une date renseignee echoue avec
-- "Could not find the 'event_date' column of 'books' in the schema cache"
-- (erreur PostgREST typique d'une colonne absente).
--
-- Cause : CreateBookSansIA.js (mode "open"/collaboratif) envoie
-- `recipient_name`/`event_date` directement dans le payload de creation
-- (routes/books.js: POST / insere `{ ...req.body, owner_id, share_token }`
-- tel quel dans public.books, sans liste blanche de colonnes). Une memoire
-- de session anterieure ([[entry-funnel-redesign-status]]) affirmait que
-- ces deux colonnes "existaient deja" sur public.books — affirmation
-- erronee (jamais verifiee directement contre la base reelle) : les seuls
-- champs de meme nom trouves dans ce depot sont ceux de
-- book_creation_refactor.sql, qui les place sur une table SEPAREE
-- (public.book_configs, un ancien modele "config narrative detaillee" de
-- l'ere IA) — jamais sur public.books lui-meme. Rien dans sql/ ne cree
-- ces colonnes sur public.books ; corrige ici.
--
-- 100% additif, nullable (le formulaire peut laisser la date vide). A
-- executer une fois dans l'editeur SQL Supabase. Se relance sans risque
-- (`if not exists`).

alter table public.books
  add column if not exists recipient_name text,
  add column if not exists event_date date;
