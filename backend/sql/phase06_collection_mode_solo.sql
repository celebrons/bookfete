-- Corrige un oubli de phase03_data_model.sql : le §05 de l'artefact
-- "Celebrons sans IA" prevoit collection_mode in (solo | open | targeted),
-- la contrainte posee n'avait garde que (open | targeted). Un livre Solo
-- (createur seul, aucune contribution collectee) doit pouvoir le dire
-- explicitement plutot que d'utiliser 'open' par defaut sans que ca
-- signifie rien.
-- 100% additif, rejouable sans risque.

alter table public.books drop constraint if exists books_collection_mode_check;
alter table public.books add constraint books_collection_mode_check
  check (collection_mode in ('solo', 'open', 'targeted'));
