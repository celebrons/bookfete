import React, { useCallback, useEffect, useState } from 'react';
import { fetchServerHealth } from '../../services/adminApi';
import './AdminHealth.css';

// Etat de sante du serveur, dans l'espace d'administration.
//
// Demande du 2026-09-18 : voir les consommations et les performances sans
// ouvrir de terminal.
//
// Ce qui N'EST PAS ici : les journaux systeme. Les lire demande des
// privileges et n'existe que sous Linux — ca ne marcherait ni en local ni
// sur Render. Les erreurs applicatives, elles, sont dans le journal des
// evenements juste en dessous, et fonctionnent partout.

const duree = (secondes) => {
  if (!Number.isFinite(secondes)) return '—';
  const j = Math.floor(secondes / 86400);
  const h = Math.floor((secondes % 86400) / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  if (j > 0) return `${j} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
};

// Un seuil visuel, pas une alerte : de quoi reperer en balayant ce qui
// approche de ses limites.
const ton = (pourcent) => {
  if (!Number.isFinite(pourcent)) return '';
  if (pourcent >= 90) return 'is-critique';
  if (pourcent >= 70) return 'is-tendu';
  return '';
};

function Mesure({ libelle, valeur, detail, pourcent }) {
  return (
    <div className={`admin-health-carte ${ton(pourcent)}`}>
      <span className="admin-health-libelle">{libelle}</span>
      <strong className="admin-health-valeur">{valeur}</strong>
      {detail && <span className="admin-health-detail">{detail}</span>}
      {Number.isFinite(pourcent) && (
        <div className="admin-health-jauge">
          <div className="admin-health-jauge-remplie" style={{ width: `${Math.min(100, pourcent)}%` }} />
        </div>
      )}
    </div>
  );
}

function AdminHealth() {
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    try {
      setEtat(await fetchServerHealth());
      setErreur(null);
    } catch (err) {
      setErreur(err?.message || 'Mesure impossible');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
    // Rafraichi seul : une page de supervision qu'il faut recharger a la main
    // ne sert a rien pendant qu'on regarde un rendu tourner.
    const minuteur = setInterval(charger, 15000);
    return () => clearInterval(minuteur);
  }, [charger]);

  if (chargement) return <p className="admin-state">Mesure de l’état du serveur…</p>;
  if (erreur) return <p className="admin-events-erreur">{erreur}</p>;
  if (!etat) return null;

  const memoirePourcent = etat.memoire.machineTotaleMo
    ? Math.round((etat.memoire.machineUtiliseeMo / etat.memoire.machineTotaleMo) * 100)
    : null;

  return (
    <section className="admin-health">
      <div className="admin-health-head">
        <h2>État du serveur</h2>
        <span className="admin-health-signature">
          {etat.environnement} · {etat.version || 'version inconnue'} · node {etat.node}
        </span>
      </div>

      <div className="admin-health-grille">
        <Mesure
          libelle="Mémoire de la machine"
          valeur={`${etat.memoire.machineUtiliseeMo} / ${etat.memoire.machineTotaleMo} Mo`}
          detail={`${etat.memoire.machineLibreMo} Mo libres`}
          pourcent={memoirePourcent}
        />
        <Mesure
          libelle="Mémoire de l’application"
          valeur={`${etat.memoire.processusMo} Mo`}
          detail={`un rendu PDF en demande ~600 Mo`}
        />
        <Mesure
          libelle="Processeur"
          valeur={`${etat.processeur.pourcent1min} %`}
          detail={`charge ${etat.processeur.charge1min} sur ${etat.processeur.coeurs} cœur(s)`}
          pourcent={etat.processeur.pourcent1min}
        />
        {etat.disque ? (
          <Mesure
            libelle="Disque"
            valeur={`${Math.round(etat.disque.utiliseMo / 1024)} / ${Math.round(etat.disque.totalMo / 1024)} Go`}
            pourcent={etat.disque.pourcent}
          />
        ) : (
          <Mesure libelle="Disque" valeur="—" detail="non mesurable sur cet hébergement" />
        )}
        <Mesure
          libelle="Rendus PDF en cours"
          valeur={etat.rendusEnCours === null ? '—' : String(etat.rendusEnCours)}
          detail={
            etat.navigateursDeRendu && etat.navigateursDeRendu.processus > 0
              ? `${etat.navigateursDeRendu.processus} navigateur(s), ${etat.navigateursDeRendu.memoireMo} Mo`
              : 'aucun navigateur actif'
          }
        />
        {/* Les rendus passent un par un depuis le 2026-09-19 : deux Chrome
            en meme temps rendaient le serveur injoignable. Ce compteur dit
            combien attendent leur tour — s'il ne redescend jamais, un rendu
            est bloque. */}
        <Mesure
          libelle="File des rendus"
          valeur={etat.rendusEnFile === null || etat.rendusEnFile === undefined ? '—' : String(etat.rendusEnFile)}
          detail={
            etat.rendusEnFile > 1
              ? `${etat.rendusEnFile - 1} en attente de leur tour`
              : 'un rendu a la fois, rien en attente'
          }
        />
        <Mesure
          libelle="Application démarrée depuis"
          valeur={duree(etat.demarreDepuisSecondes)}
          detail={`machine : ${duree(etat.machineDemarreeDepuisSecondes)}`}
        />
        <Mesure
          libelle="Dernière sauvegarde"
          valeur={
            etat.derniereSauvegarde
              ? new Date(etat.derniereSauvegarde.quand).toLocaleString('fr-FR')
              : 'aucune'
          }
          detail={
            etat.derniereSauvegarde
              ? `${etat.derniereSauvegarde.tailleMo} Mo · ${etat.derniereSauvegarde.nombre} conservée(s)`
              : 'la base n’est pas encore protégée'
          }
        />
      </div>

      <p className="admin-health-note">
        Mesuré à {new Date(etat.mesureLe).toLocaleTimeString('fr-FR')}, actualisé toutes les 15 secondes.
      </p>
    </section>
  );
}

export default AdminHealth;
