-- Ajoute l'IP du visiteur au suivi de trafic (demande du 2026-10-07 :
-- "afficher les @IP (provenance)"). Absente volontairement de phase28 pour
-- rester, par defaut, hors du champ du consentement RGPD -- une IP EST une
-- donnee personnelle (CNIL). Ce qui le justifie ici : interet legitime
-- (comprendre la provenance reelle du trafic, detecter un abus), lecture
-- reservee a l'espace admin (ADMIN_EMAILS), jamais partagee ni croisee avec
-- un autre identifiant, et PURGEE (voir purgePageViews, meme principe que
-- purgeEvents) plutot que conservee indefiniment.
alter table public.page_views add column if not exists ip text;
