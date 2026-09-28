-- ============================================================
-- phase24 — verrouillage du livre apres paiement
-- ============================================================
--
-- Demande (plan de mise en production, "Verrouiller le livre apres
-- paiement") : rien n'empechait aujourd'hui d'ajouter des pages a un livre
-- apres que sa commande ait ete payee, alors que le fichier envoye a
-- l'imprimeur suit le livre au moment de l'ENVOI, pas au moment du
-- PAIEMENT — un client aurait pu payer un livre de 30 pages et en recevoir
-- un de 40, ou l'inverse.
--
-- Une seule colonne, posee une fois au TOUT PREMIER paiement reussi
-- (voir routes/orders.js: persistStripePaymentForOrder) : idempotente,
-- jamais reecrite ensuite meme si la commande change encore d'etat.
--
-- Idempotent et non destructif : aucune donnee n'est touchee.
-- ============================================================

alter table public.books
  add column if not exists locked_at timestamptz;

comment on column public.books.locked_at is
  'Pose au tout premier paiement reussi d''une commande liee a ce livre (voir routes/orders.js persistStripePaymentForOrder). NULL = livre encore modifiable. Les routes d''edition (composition.js requireOwnedBook, books.js PUT /:id) refusent toute modification quand elle est posee, sauf si ALLOW_BOOK_EDITS_AFTER_PAYMENT=1 est defini cote serveur (mode test).';
