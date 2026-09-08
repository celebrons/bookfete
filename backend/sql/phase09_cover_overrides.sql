-- Phase 09 — Surcharges manuelles legeres sur la couverture (photo, sous-titre,
-- date, phrase de 4eme de couverture). Le moteur automatique (coverComposer.js)
-- reste la source de decision par defaut : cette colonne est purement
-- optionnelle, un livre qui ne l'a jamais touchee se comporte exactement
-- comme avant (voir coverComposer.js : book?.cover_overrides est toujours lu
-- de facon defensive, jamais requis).
--
-- 100% additif, rejouable sans risque.

alter table public.books
  add column if not exists cover_overrides jsonb not null default '{}'::jsonb;

-- Forme attendue (documentee ici, non contrainte en base pour rester simple) :
-- {
--   "frontPhotoId": "uuid | null",            -- null/absent = choix automatique
--   "subtitle": "string",                      -- vide = rien affiche
--   "dateLabel": "string",                      -- vide = repli sur event_date si present
--   "closingPhraseMode": "auto|custom|none",   -- absent = "auto"
--   "closingPhraseText": "string",              -- utilise seulement si mode="custom"
--   "kickerMode": "auto|custom|none",          -- absent = "auto" (libelle de l'occasion, ex. "Fin de projet")
--   "kickerText": "string"                      -- utilise seulement si mode="custom"
-- }
-- (2026-09 : kickerMode/kickerText ajoutes — meme colonne jsonb, aucune
-- migration necessaire, voir coverComposer.js:resolveKicker. Le TITRE
-- lui-meme (book.title) n'a pas besoin d'entree ici : c'est deja une
-- colonne directement modifiable, cover_overrides ne s'occupe que des
-- elements qui n'avaient pas d'autre logement.)
