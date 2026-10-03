-- Reglages globaux de l'application, modifiables SANS redemarrer le serveur.
--
-- Demande du 2026-10-04 : un bouton dans l'espace admin pour basculer tout
-- le site entre mode test (cles Stripe de test, brouillons Gelato) et
-- production reelle (vrais paiements, vraies commandes facturees chez
-- l'imprimeur) — jusqu'ici, ce basculement demandait d'editer le fichier
-- .env a la main puis de redemarrer (voir STRIPE_SECRET_KEY/
-- GELATO_LIVE_ORDERS). Une ligne unique ici, relue regulierement par le
-- serveur (voir services/settings/appMode.js), remplace ces deux reglages
-- disperses par UN SEUL etat, pilotable en un clic.
--
-- Une seule ligne attendue en pratique (id fixe) : ce n'est pas une table de
-- reglages par utilisateur, juste un etat global.
create table if not exists public.app_settings (
  id text primary key default 'global',
  mode text not null default 'test' check (mode in ('test', 'production')),
  updated_at timestamptz not null default now(),
  -- Qui a bascule, en clair (meme convention que app_events.actor) — savoir
  -- qui a allume la production reelle n'est pas un detail.
  updated_by text
);

insert into public.app_settings (id, mode)
values ('global', 'test')
on conflict (id) do nothing;

-- RLS activee SANS aucune policy, meme choix que app_events : seule la cle
-- de service (le backend) y touche. Un reglage qui decide si de l'argent
-- reel est encaisse n'a rien a faire accessible, meme en lecture, a un
-- jeton utilisateur.
alter table public.app_settings enable row level security;

-- Grant explicite (voir note du 2026-09-27 sur le changement Supabase du
-- 30 octobre : les nouvelles tables ne recoivent plus les droits par defaut
-- sur l'API Data) — seul service_role en a besoin, aucune raison d'en
-- accorder a anon/authenticated sur cette table.
grant select, insert, update, delete on public.app_settings to service_role;
