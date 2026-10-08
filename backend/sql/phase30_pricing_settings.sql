-- Tarifs des livres, modifiables depuis l'espace admin sans redeployer
-- (demande du 2026-10-07 : "gerer les tarifs des livres via l'interface
-- Admin"). Meme schema qu'app_settings (phase26) : une ligne unique, relue
-- en arriere-plan par le serveur (voir services/pricing/pricingSettings.js).
--
-- N'y figurent QUE les valeurs qui sont un vrai CHOIX commercial : prix de
-- base et prix par 2 pages de chaque format, prix du PDF seul, remise du
-- pack. La livraison (SHIPPING_PRICE_CENTS) et les taux de change
-- (EXCHANGE_RATES_FROM_EUR) restent dans pricingConfig.js, codes en dur :
-- ce sont des couts/taux reels pointes sur l'API Gelato / la BCE, pas des
-- prix que Bookipix decide — les y melanger risquerait une commande vendue
-- sous son cout reel sans que personne ne le remarque (deja arrive une
-- fois avec la livraison France, voir pricingConfig.js).
create table if not exists public.pricing_settings (
  id text primary key default 'global',
  config jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.pricing_settings (id, config)
values ('global', jsonb_build_object(
  'formats', jsonb_build_object(
    'livret', jsonb_build_object('basePriceCents', 2990, 'pricePer2PagesCents', 190),
    'standard', jsonb_build_object('basePriceCents', 3990, 'pricePer2PagesCents', 220),
    'luxe', jsonb_build_object('basePriceCents', 4990, 'pricePer2PagesCents', 290)
  ),
  'pdfPriceCents', 799,
  'packDiscountPercent', 10
))
on conflict (id) do nothing;

-- RLS activee SANS aucune policy, meme choix que app_settings : seule la
-- cle de service (le backend) y touche. Un reglage qui decide le prix
-- facture a un client n'a rien a faire accessible, meme en lecture, a un
-- jeton utilisateur.
alter table public.pricing_settings enable row level security;

grant select, insert, update, delete on public.pricing_settings to service_role;
