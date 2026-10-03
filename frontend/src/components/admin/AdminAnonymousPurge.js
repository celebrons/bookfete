import React, { useState } from 'react';
import { listAbandonedAnonymousAccounts, purgeAbandonedAnonymousAccounts } from '../../services/adminApi';
import './AdminAnonymousPurge.css';

// Purge des comptes anonymes abandonnes (plan de mise en production,
// 2026-10-04) : un visiteur peut composer un livre sans jamais creer de
// compte (voir services/anonymousSession.js) — c'est voulu. Mais celui qui
// n'est jamais revenu laisse des photos et des textes en base sans base
// legale pour les garder indefiniment. Previsualisation obligatoire avant
// toute suppression — jamais un bouton qui agit a l'aveugle.
const SEUIL_PAR_DEFAUT = 7;

function AdminAnonymousPurge() {
  const [jours, setJours] = useState(SEUIL_PAR_DEFAUT);
  const [apercu, setApercu] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [purge, setPurge] = useState(false);
  const [erreur, setErreur] = useState(null);

  const chargerApercu = async () => {
    setChargement(true);
    setErreur(null);
    try {
      setApercu(await listAbandonedAnonymousAccounts(jours));
    } catch (err) {
      setErreur(err?.message || 'Lecture impossible');
    } finally {
      setChargement(false);
    }
  };

  const confirmerEtPurger = async () => {
    if (!apercu || apercu.total === 0) return;
    const confirme = window.confirm(
      `Supprimer ${apercu.total} compte(s) anonyme(s) abandonne(s) depuis plus de ${jours} jour(s) ?\n\n`
      + 'Photos, livres, profil et compte seront effacés. Irréversible.'
    );
    if (!confirme) return;

    setPurge(true);
    setErreur(null);
    try {
      await purgeAbandonedAnonymousAccounts(jours);
      await chargerApercu();
    } catch (err) {
      setErreur(err?.message || 'Suppression impossible');
    } finally {
      setPurge(false);
    }
  };

  return (
    <section className="admin-anon-purge">
      <div className="admin-anon-purge-head">
        <h2>Comptes anonymes abandonnés</h2>
        <div className="admin-anon-purge-controles">
          <label>
            Depuis plus de
            <input
              type="number"
              min="1"
              value={jours}
              onChange={(e) => setJours(Math.max(1, Number(e.target.value) || SEUIL_PAR_DEFAUT))}
            />
            jour(s)
          </label>
          <button type="button" className="btn btn-outline btn-petit" onClick={chargerApercu} disabled={chargement}>
            {chargement ? 'Vérification…' : 'Vérifier'}
          </button>
        </div>
      </div>

      {erreur && <p className="admin-anon-purge-erreur">{erreur}</p>}

      {apercu && (
        <div className="admin-anon-purge-resultat">
          <p>
            <strong>{apercu.total}</strong> compte(s) à supprimer
            {apercu.exclusPourCommande > 0 && (
              <span className="admin-anon-purge-exclus">
                {' '}· {apercu.exclusPourCommande} exclu(s) (une commande leur est liée — jamais touché)
              </span>
            )}
          </p>
          {apercu.total > 0 && (
            <button type="button" className="btn btn-outline btn-petit" onClick={confirmerEtPurger} disabled={purge}>
              {purge ? 'Suppression…' : `Supprimer ces ${apercu.total} compte(s)`}
            </button>
          )}
        </div>
      )}

      <p className="admin-anon-purge-note">
        Un compte anonyme qui n'est jamais revenu depuis sa création reste en base avec ses photos,
        sans durée fixée — cette action nettoie ce qui a été abandonné.
      </p>
    </section>
  );
}

export default AdminAnonymousPurge;
