-- ============================================================
-- phase27 — ferme l'enumeration publique du bucket photos
-- ============================================================
--
-- TROUVE ET VERIFIE EN CONDITIONS REELLES le 2026-10-04 : avec la seule cle
-- anonyme publique du site (celle que n'importe quel visiteur du site a
-- deja dans son navigateur), on peut LISTER tous les dossiers du bucket
-- "contribution-photos" (chaque dossier = un book_id), puis lister les
-- photos de chacun, puis les voir toutes. Aucun compte, aucun lien,
-- aucune devinette necessaire. Reproduit avec succes avant ce correctif.
--
-- CE QUI RESTE INCHANGE (verifie en conditions reelles, cote serveur) :
-- une requete HTTP SANS AUCUN EN-TETE D'AUTHENTIFICATION sur
--   /storage/v1/object/public/contribution-photos/<book_id>/<fichier>
-- reussit (HTTP 200) — cet endpoint de lecture par CHEMIN EXACT ne
-- consulte jamais les regles RLS, uniquement le drapeau "public" du
-- bucket. L'affichage des photos dans l'atelier, le PDF, Gelato et
-- l'apercu admin continue donc de fonctionner EXACTEMENT comme avant.
--
-- CE QUE CE SCRIPT RETIRE : la ou les regles RLS qui autorisent une
-- requete SELECT generique sur storage.objects pour ce bucket — c'est
-- cette regle-la, et uniquement elle, qui permet le LISTAGE (.list(), une
-- requete SELECT classique, contrairement a la lecture par chemin exact
-- ci-dessus). Recherchee par CONTENU (le nom de la regle n'est pas connu
-- a l'avance : ce bucket a ete configure hors de ce depot, cote tableau
-- de bord Supabase) plutot que par un nom devine.
--
-- A VERIFIER APRES EXECUTION (voir deploy/README.md ou demander a
-- Claude) : relancer un test de listage anonyme doit desormais echouer ;
-- une vraie photo existante doit continuer a s'afficher normalement.
--
-- Idempotent : relancable sans risque (ne fait rien la 2e fois si la
-- regle a deja ete retiree).
-- ============================================================

do $$
declare
  pol record;
  nb int := 0;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'SELECT'
      and qual ilike '%contribution-photos%'
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
    raise notice 'Regle retiree : %', pol.policyname;
    nb := nb + 1;
  end loop;

  if nb = 0 then
    raise notice 'Aucune regle correspondante trouvee — soit deja corrige, soit la regle existante ne mentionne pas "contribution-photos" explicitement (voir la requete de diagnostic dans le message de Claude).';
  end if;
end $$;
