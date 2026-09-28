-- Factures : creees automatiquement au paiement d'une commande, envoyees
-- par email (PDF en piece jointe), et telechargeables depuis l'espace
-- client. Voir backend/services/invoicing/invoiceService.js.
--
-- NUMEROTATION LEGALE : une facture francaise doit porter un numero
-- SEQUENTIEL, SANS TROU (Code de commerce art. L441-9 / CGI art. 242
-- nonies A). order_number (routes/orders.js, createOrderNumber) ne convient
-- pas : il est construit a partir d'un horodatage + un tirage aleatoire,
-- collision-resistant mais ni ordonne ni sans trou. invoice_counters/
-- next_invoice_number() ci-dessous fournissent un compteur ATOMIQUE, remis a
-- zero chaque annee (les deux pratiques sont legales en France, tant que la
-- sequence a l'interieur d'une annee ne saute jamais un numero).

create table if not exists public.invoice_counters (
  year integer primary key,
  next_number integer not null default 1
);

-- Incremente et renvoie le PROCHAIN numero a emettre pour l'annee donnee, en
-- une seule instruction atomique (INSERT ... ON CONFLICT ... RETURNING) :
-- deux commandes payees au meme instant ne peuvent jamais recevoir le meme
-- numero, meme avec plusieurs requetes concurrentes (webhook Stripe + route
-- de confirmation navigateur, voir persistStripePaymentForOrder).
create or replace function public.next_invoice_number(p_year integer)
returns integer
language sql
as $$
  insert into public.invoice_counters (year, next_number)
  values (p_year, 2)
  on conflict (year) do update set next_number = invoice_counters.next_number + 1
  returning next_number - 1;
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  -- SET NULL (pas CASCADE) : une facture emise est un document legal qui
  -- doit survivre a la commande qui l'a declenchee, y compris si celle-ci
  -- est un jour supprimee (ex. DELETE /api/orders/:id, route de test — voir
  -- memoire "exit-journey-checkout-status"). L'instantane ci-dessous
  -- (seller/buyer/line_items/totals) reste complet et lisible seul.
  -- UNIQUE : empeche deux factures pour la meme commande, y compris en cas
  -- d'appel concurrent (webhook Stripe + route de confirmation navigateur,
  -- voir invoiceService.js). NULL autorise plusieurs fois (facture dont la
  -- commande source a ete supprimee depuis) : Postgres ne compare jamais
  -- deux NULL comme egaux dans une contrainte UNIQUE.
  order_id uuid unique references public.orders(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null unique,
  issued_at timestamptz not null default now(),
  -- Instantane COMPLET au moment de l'emission : un document legal ne doit
  -- jamais changer retroactivement si l'identite du vendeur, l'adresse du
  -- client ou les tarifs evoluent plus tard (meme principe que orders.snapshot).
  seller jsonb not null,
  buyer jsonb not null,
  line_items jsonb not null,
  totals jsonb not null,
  -- Chemin dans le bucket prive "invoices" (pas d'URL publique - une facture
  -- porte l'adresse et le montant du client, plus sensible qu'un fichier
  -- d'impression). Telechargement via URL signee, voir GET /orders/:id/invoice.
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoices_order_id on public.invoices(order_id);
create index if not exists idx_invoices_owner_id on public.invoices(owner_id);

alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;

-- Aucune policy sur invoice_counters : jamais lu/ecrit que par le backend
-- (service role, qui contourne RLS), jamais expose au client.

-- Un client peut lire SES propres factures (liste/detail depuis l'espace
-- commande) ; aucune policy d'ecriture cote client — seul le service role
-- (backend, apres paiement confirme) cree des factures.
drop policy if exists invoices_owner_select on public.invoices;
create policy invoices_owner_select on public.invoices
  for select using (auth.uid() = owner_id);
