-- Migration robuste pour la table orders (compatible table deja existante)

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid()
);

-- Colonnes principales (ajout si absentes)
alter table public.orders add column if not exists owner_id uuid;
alter table public.orders add column if not exists book_id uuid;
alter table public.orders add column if not exists book_title text;
alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists type text;
alter table public.orders add column if not exists status text;
alter table public.orders add column if not exists quantity integer default 1;
alter table public.orders add column if not exists currency text default 'EUR';
alter table public.orders add column if not exists unit_cents integer default 0;
alter table public.orders add column if not exists total_cents integer default 0;
alter table public.orders add column if not exists shipping_address jsonb;
alter table public.orders add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.orders add column if not exists snapshot jsonb default '{}'::jsonb;
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists pdf_ready_at timestamptz;
alter table public.orders add column if not exists sent_to_printer_at timestamptz;
alter table public.orders add column if not exists printed_at timestamptz;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists created_at timestamptz default now();
alter table public.orders add column if not exists updated_at timestamptz default now();

-- Backfill owner_id depuis user_id si un ancien schema existe
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'user_id'
  ) then
    execute 'update public.orders set owner_id = user_id where owner_id is null and user_id is not null';
  end if;
end $$;

-- Valeurs par defaut de securite
update public.orders
set
  status = coalesce(nullif(status, ''), 'awaiting_payment'),
  type = coalesce(nullif(type, ''), 'pdf'),
  currency = coalesce(nullif(currency, ''), 'EUR'),
  quantity = greatest(coalesce(quantity, 1), 1),
  unit_cents = greatest(coalesce(unit_cents, 0), 0),
  total_cents = greatest(coalesce(total_cents, 0), 0),
  metadata = coalesce(metadata, '{}'::jsonb),
  snapshot = coalesce(snapshot, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

-- Normalisation des anciens statuts potentiels
update public.orders
set status = case lower(coalesce(status, ''))
  when '' then 'awaiting_payment'
  when 'pending' then 'awaiting_payment'
  when 'awaiting' then 'awaiting_payment'
  when 'waiting_payment' then 'awaiting_payment'
  when 'processing' then 'paid'
  when 'in_progress' then 'print_queued'
  when 'queued' then 'print_queued'
  when 'completed' then 'delivered'
  else status
end
where true;

-- Contraintes (remplacement force pour eviter les vieux checks)
alter table public.orders drop constraint if exists orders_type_check;
alter table public.orders add constraint orders_type_check
  check (type in ('pdf', 'print', 'pack'));

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (
    status in (
      'draft',
      'awaiting_payment',
      'paid',
      'pdf_generating',
      'pdf_ready',
      'print_queued',
      'sent_to_printer',
      'printed',
      'shipped',
      'delivered',
      'cancelled',
      'failed'
    )
  );

-- Unicite du numero de commande (si possible)
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_orders_order_number_unique'
  ) then
    create unique index idx_orders_order_number_unique
      on public.orders(order_number)
      where order_number is not null;
  end if;
end $$;

create index if not exists idx_orders_owner_created_at on public.orders(owner_id, created_at desc);
create index if not exists idx_orders_book_id on public.orders(book_id);
create index if not exists idx_orders_status on public.orders(status);

-- RLS
alter table public.orders enable row level security;

drop policy if exists "orders_owner_select" on public.orders;
create policy "orders_owner_select"
  on public.orders
  for select
  using (auth.uid() = owner_id);

drop policy if exists "orders_owner_insert" on public.orders;
create policy "orders_owner_insert"
  on public.orders
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists "orders_owner_update" on public.orders;
create policy "orders_owner_update"
  on public.orders
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
