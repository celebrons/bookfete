import React, { useCallback, useEffect, useState } from 'react';
import { fetchAppMode, setAppModeRemote } from '../../services/adminApi';
import './AdminModeToggle.css';

// Mode global test/production (2026-10-04) : un seul etat pour Stripe
// (vrais paiements) ET Gelato (vraies commandes facturees/imprimees) —
// voir backend/services/settings/appMode.js. Place en tete de l'espace
// admin, volontairement : c'est le controle le plus consequent de cette
// page, il ne doit jamais se noyer parmi le reste.
//
// Le bouton reste cliquable meme quand des cles live manquent (pour que
// `missingForProduction` soit visible et explicite), mais la confirmation
// elle-meme refuse d'avancer tant que la liste n'est pas vide — jamais une
// bascule "a moitie prete".
const PHRASE_PRODUCTION = 'ACTIVER LA PRODUCTION';

function AdminModeToggle() {
  const [etat, setEtat] = useState(null); // { mode, missingForProduction }
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  const [confirmation, setConfirmation] = useState(null); // 'production' | 'test' | null
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      setEtat(await fetchAppMode());
      setErreur('');
    } catch (err) {
      setErreur(err?.message || 'Lecture du mode impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const ouvrirConfirmation = (cible) => {
    setConfirmation(cible);
    setSaisie('');
    setErreur('');
  };

  const fermerConfirmation = () => {
    setConfirmation(null);
    setSaisie('');
  };

  const confirmer = async () => {
    setEnCours(true);
    setErreur('');
    try {
      const resultat = await setAppModeRemote(confirmation);
      setEtat((precedent) => ({ ...precedent, mode: resultat.mode }));
      fermerConfirmation();
      // Reprend la liste "manquant pour la production" a jour (utile si on
      // vient de repasser en test : la revoir prete pour la prochaine fois).
      charger();
    } catch (err) {
      setErreur(err?.message || 'Bascule impossible.');
      if (Array.isArray(err?.missing)) {
        setEtat((precedent) => ({ ...precedent, missingForProduction: err.missing }));
      }
    } finally {
      setEnCours(false);
    }
  };

  if (chargement) return <p className="admin-state">Lecture du mode…</p>;
  if (!etat) return <p className="admin-events-erreur">{erreur}</p>;

  const estProduction = etat.mode === 'production';
  const manquants = etat.missingForProduction || [];

  return (
    <section className={`admin-mode ${estProduction ? 'is-production' : 'is-test'}`}>
      <div className="admin-mode-etat">
        <span className="admin-mode-badge">{estProduction ? 'PRODUCTION RÉELLE' : 'MODE TEST'}</span>
        <p className="admin-mode-description">
          {estProduction
            ? 'Les paiements Stripe sont réels, et chaque commande Impression/Pack payée part réellement chez Gelato (facturée, imprimée, expédiée).'
            : 'Stripe est en mode test (aucun vrai paiement) et chaque commande reste un brouillon chez Gelato (jamais facturée ni imprimée).'}
        </p>
      </div>

      {!estProduction && manquants.length > 0 && (
        <p className="admin-mode-manquant">
          Pour activer la production réelle, il manque encore : {manquants.join(' · ')}.
        </p>
      )}

      <button
        type="button"
        className={`btn ${estProduction ? 'btn-outline' : 'btn-primary'} admin-mode-bouton`}
        onClick={() => ouvrirConfirmation(estProduction ? 'test' : 'production')}
      >
        {estProduction ? 'Repasser en mode test' : 'Activer la production réelle'}
      </button>

      {erreur && !confirmation && <p className="admin-events-erreur">{erreur}</p>}

      {confirmation && (
        <div className="admin-mode-backdrop" onClick={fermerConfirmation}>
          <div className="admin-mode-modal" onClick={(event) => event.stopPropagation()}>
            {confirmation === 'production' ? (
              <>
                <h2>Activer la production réelle</h2>
                <p>
                  À partir de maintenant, chaque paiement est réel (Stripe) et chaque commande
                  Impression/Pack payée part réellement chez Gelato (facturée, imprimée, expédiée).
                  Cette action est journalisée.
                </p>
                <p className="admin-mode-modal-consigne">
                  Pour confirmer, tapez exactement : <strong>{PHRASE_PRODUCTION}</strong>
                </p>
                <input
                  className="input-luxe"
                  value={saisie}
                  onChange={(event) => setSaisie(event.target.value)}
                  placeholder={PHRASE_PRODUCTION}
                  autoFocus
                />
              </>
            ) : (
              <>
                <h2>Repasser en mode test</h2>
                <p>
                  Les paiements Stripe redeviennent factices et les commandes Impression/Pack
                  redeviennent des brouillons chez Gelato (jamais facturées ni imprimées).
                </p>
              </>
            )}

            {erreur && <p className="admin-events-erreur">{erreur}</p>}

            <div className="admin-mode-modal-actions">
              <button type="button" className="btn btn-outline" onClick={fermerConfirmation} disabled={enCours}>
                Annuler
              </button>
              <button
                type="button"
                className={`btn ${confirmation === 'production' ? 'btn-primary' : 'btn-outline'}`}
                onClick={confirmer}
                disabled={enCours || (confirmation === 'production' && saisie.trim() !== PHRASE_PRODUCTION)}
              >
                {enCours ? 'En cours…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminModeToggle;
