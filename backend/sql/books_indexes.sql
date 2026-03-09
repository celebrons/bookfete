-- Performance indexes for account/dashboard project listing
-- Run once in Supabase SQL editor

create index if not exists idx_books_owner_created_at
  on public.books(owner_id, created_at desc);

create index if not exists idx_books_owner_updated_at
  on public.books(owner_id, updated_at desc);
