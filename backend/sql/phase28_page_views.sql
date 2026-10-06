-- Suivi de trafic minimal, pour savoir combien de visites le site recoit et
-- sur quelles pages (demande du 2026-10-06 : "mets quelque chose pour que je
-- puisse suivre le trafic du site").
--
-- Volontairement SANS cookie, SANS identifiant persistant, SANS IP ni user-
-- agent complet stockes : juste le chemin visite, le referrer (d'ou vient le
-- visiteur), et quand. Rien ici ne permet de relier deux visites a la meme
-- personne -- choix delibere pour rester hors du champ du consentement RGPD
-- (meme logique qu'un compteur de logs serveur), plutot que d'ajouter
-- Google Analytics et la banniere de consentement qui irait avec.
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists idx_page_views_created_at on public.page_views(created_at desc);
create index if not exists idx_page_views_path on public.page_views(path);

-- RLS activee SANS aucune policy, meme choix que app_events/app_settings :
-- seule la cle de service (le backend) y ecrit/lit. L'endpoint public qui
-- enregistre une visite (POST /api/analytics/pageview) passe par le backend,
-- jamais par un jeton utilisateur direct.
alter table public.page_views enable row level security;

-- Grant explicite (changement Supabase du 30 octobre, deja rencontre sur
-- app_settings/invoices) : seul service_role en a besoin.
grant select, insert, delete on public.page_views to service_role;
