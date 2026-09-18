-- Journal des EVENEMENTS METIER.
--
-- Demande du 2026-09-18 : « il faudrait un suivi des logs / evenements
-- quelque part sur le site ».
--
-- Pas des journaux serveur : une ligne par chose IMPORTANTE qui arrive a un
-- livre ou a une commande. La journee du 2026-09-17/18 a montre pourquoi —
-- le doublon Gelato, le statut reecrit par un serveur perime, la traduction
-- fausse : aucun n'a produit d'erreur, les journaux etaient vides. Ce qui
-- manquait n'etait pas une trace technique, mais de savoir CE QUI S'ETAIT
-- PASSE, et depuis quel environnement.
--
-- Table deliberement simple : pas de relations dures (une commande supprimee
-- ne doit pas effacer son historique — c'est justement ce qu'on veut pouvoir
-- relire), et un `metadata` libre pour le detail propre a chaque type.

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- 'order.created', 'pdf.ready', 'gelato.submitted', 'status.changed'...
  type text not null,

  -- info | warn | error. Permet de filtrer sur ce qui a mal tourne sans
  -- avoir a connaitre la liste des types.
  level text not null default 'info',

  -- De quoi on parle. Volontairement SANS cle etrangere : l'evenement
  -- survit a la suppression du livre ou de la commande.
  book_id uuid,
  order_id uuid,
  owner_id uuid,

  -- QUI a agi, en clair. L identifiant seul ne repond pas a la question :
  -- il faudrait le resoudre a chaque lecture, et il ne dit rien quand
  -- l action vient de l imprimeur ou d une tache automatique. On stocke donc
  -- l adresse email quand une personne est a l origine, et un mot lisible
  -- sinon (« systeme », « gelato »).
  actor text,

  -- Une phrase lisible, ecrite pour etre comprise sans le code sous les yeux.
  message text,

  -- Le detail : nombre de pages, duree, identifiant Gelato, ancien et
  -- nouveau statut, environnement d'origine...
  metadata jsonb not null default '{}'::jsonb
);

-- L'usage est toujours le meme : les derniers evenements, parfois filtres
-- sur une commande ou un livre.
create index if not exists idx_app_events_created_at on public.app_events(created_at desc);
create index if not exists idx_app_events_order_id on public.app_events(order_id);
create index if not exists idx_app_events_book_id on public.app_events(book_id);
create index if not exists idx_app_events_level on public.app_events(level);

-- RLS activee SANS aucune policy : personne ne lit ni n'ecrit avec un jeton
-- utilisateur. Seule la cle de service (le backend) y accede, et la lecture
-- passe par l'espace d'administration, lui-meme ferme par defaut.
--
-- C'est volontaire : un journal d'evenements contient qui a commande quoi et
-- quand. Ca n'a rien a faire entre les mains d'un client, meme pour ses
-- propres lignes.
alter table public.app_events enable row level security;
