-- Phase 12 — lien de partage collaboratif : un token par livre, resolu par
-- une route publique (voir routes/composition.js: resolveBookByShareToken,
-- GET/POST /api/public/share/:token) pour laisser un proche ajouter photos/
-- textes SANS compte, directement dans book_content_items (le modele utilise
-- par l'atelier) — remplace, pour les livres crees via le nouveau parcours,
-- l'ancien systeme d'invitation par email rattache a un chapitre
-- (chapter_invites, laisse intact, non touche par cette migration).
--
-- Le token est genere cote application (crypto.randomUUID(), voir
-- routes/books.js: POST /) plutot que via un `default` SQL — evite de
-- dependre d'une extension Postgres (pgcrypto/uuid-ossp) dont l'activation
-- ne peut pas etre verifiee depuis ce depot.
--
-- 100% additif. A executer une fois dans l'editeur SQL Supabase. Se relance
-- sans risque (`if not exists`).

alter table public.books
  add column if not exists share_token text unique;
