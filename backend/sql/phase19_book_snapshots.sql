-- Phase 19 — point de restauration avant une generation automatique
--
-- Demande utilisateur (2026-09-15) : « pour le mode automatique, j'aimerais le
-- tester mais sans detruire ce que je viens de faire manuellement (possibilite
-- de revenir sur mon travail manuel termine) ».
--
-- Ce qui existait deja : une generation automatique PRESERVE les pages
-- verrouillees (composees a la main) — c'est verifie. Ce qu'elle ne preservait
-- pas, c'est tout le reste : les pages deja composees automatiquement sont
-- remplacees, et il n'y avait aucun moyen de revenir en arriere. Le bouton
-- etait donc inutilisable par prudence.
--
-- UNE SEULE LIGNE PAR LIVRE, volontairement. Ce n'est pas un historique :
-- c'est un filet, celui du dernier geste destructeur. Un historique complet
-- demanderait une politique de retention, une interface de navigation, et
-- ferait grossir la base sans fin — alors que le besoin exprime est « je veux
-- pouvoir essayer sans risque ». Le `on conflict (book_id)` de l'insertion
-- remplace donc simplement le point precedent.
--
-- Les SOUVENIRS (book_content_items) ne sont jamais copies ici : une
-- generation ne les supprime pas, seule leur repartition en pages change.
-- N'instantaner que les pages garde la table petite et la restauration
-- evidente a raisonner.

create table if not exists public.book_snapshots (
  book_id uuid primary key references public.books(id) on delete cascade,
  -- Le tableau complet des book_pages au moment du geste : page_index,
  -- layout_id, content, locked. Suffisant pour reconstruire le livre a
  -- l'identique.
  pages jsonb not null default '[]'::jsonb,
  -- Nombre de pages ANNONCE au moment du geste : c'est lui qui est facture,
  -- il doit etre restaure avec le reste (voir bookContentService.syncPageCount).
  page_count integer,
  -- Ce qui a provoque l'instantane ('compose' aujourd'hui). Permet de nommer
  -- precisement ce qu'on propose de retablir, plutot qu'un « Annuler » vague.
  reason text not null default 'compose',
  created_at timestamptz not null default timezone('utc', now())
);

-- Lecture toujours par book_id (cle primaire) : aucun autre index necessaire.

alter table public.book_snapshots enable row level security;

-- Meme regle que book_pages : seul le proprietaire du livre y touche. La table
-- n'est de toute facon jamais lue directement par le navigateur (tout passe
-- par l'API, avec la cle de service), mais la politique reste posee pour que
-- la table ne soit pas ouverte par defaut si cela changeait un jour.
drop policy if exists "book_snapshots_owner" on public.book_snapshots;
create policy "book_snapshots_owner" on public.book_snapshots
  for all
  using (
    exists (
      select 1 from public.books b
      where b.id = book_snapshots.book_id and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.books b
      where b.id = book_snapshots.book_id and b.owner_id = auth.uid()
    )
  );
