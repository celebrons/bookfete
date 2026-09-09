-- Phase 15 — Mode collectif : invitations nominatives, statuts, tracabilite.
--
-- Ajoute une couche additive au-dessus de l'existant, ne remplace rien :
-- books.share_token (phase12, lien unique anonyme) reste inchange et
-- fonctionne independamment. Voir le plan d'implementation pour le
-- raisonnement complet (pourquoi pas une reprise de l'ancien systeme
-- chapter_invites/contributions).
--
-- 100% additif, rejouable sans risque (`if not exists`). A executer une
-- fois dans l'editeur SQL Supabase.

-- Reglages de la collecte, portes directement par books (relation 1-1,
-- meme convention que event_date/recipient_name/share_token).
alter table public.books
  add column if not exists collective_activated_at timestamptz,
  add column if not exists collective_event_title text,
  add column if not exists collective_message text,
  add column if not exists collective_deadline date,
  add column if not exists collective_reminders_enabled boolean not null default false,
  add column if not exists collective_reminder_days_before integer[] not null default '{7,2}';

-- Un invite = une personne nommee, un lien individuel, un statut suivi.
-- 'invited' -> 'opened' (premiere ouverture du lien) -> 'started' (premiere
-- contribution envoyee) -> 'completed' (a explicitement clique "J'ai
-- termine"). Jamais regressif (voir routes/collective.js: markStatusIfEarlier).
create table if not exists public.book_participants (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  email text not null,
  name text,
  invite_token text not null unique,
  status text not null default 'invited'
    check (status in ('invited', 'opened', 'started', 'completed')),
  invited_at timestamptz not null default timezone('utc', now()),
  opened_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_reminder_sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists book_participants_book_idx
  on public.book_participants(book_id);

-- Tracabilite reelle ("qui a envoye cette photo ?") : identite resolue
-- SERVEUR via le token individuel du participant, jamais fournie par le
-- client — contrairement a book_content_items.metadata.contributor_name
-- (flux du lien de partage anonyme existant, un prenom libre non verifie,
-- laisse tel quel et inchange par cette migration).
alter table public.book_content_items
  add column if not exists participant_id uuid references public.book_participants(id) on delete set null;

create index if not exists book_content_items_participant_idx
  on public.book_content_items(participant_id)
  where participant_id is not null;
