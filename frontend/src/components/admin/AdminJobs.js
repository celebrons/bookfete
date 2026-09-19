import React, { useCallback, useEffect, useState } from 'react';
import { listJobs, stopPdfJob, stopGelatoJob, cleanupJobs } from '../../services/adminApi';
import './AdminJobs.css';

// Les travaux longs : fabrications de PDF et envois a l'imprimeur.
//
// Demande du 2026-09-18/19 : « voir toutes les demandes de generation de PDF
// ou a Gelato, leur statut (en cours, bloquee, echouee, reussie) et pouvoir
// les arreter / nettoyer ».
//
// Ces deux travaux n'ont rien en commun techniquement — l'un lance un
// navigateur, l'autre televerse un fichier chez un imprimeur — mais ils
// posent la MEME question : qu'est-ce qui tourne, depuis quand, et est-ce
// que c'est normal ? Ils partagent donc un tableau et un vocabulaire.
//
// C'est le premier ecran de cet espace qui AGIT. Les deux actions sont donc
// explicites sur ce qu'elles font vraiment, et confirmees.

const TONS = {
  'en cours': 'is-encours',
  'en attente': 'is-attente',
  bloquee: 'is-bloquee',
  echouee: 'is-echouee',
  reussie: 'is-reussie',
  arretee: 'is-arretee'
};

const GENRES = {
  pdf: 'PDF',
  gelato: 'Imprimeur'
};

const quand = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('fr-FR');
};

// Depuis combien de temps. Une duree parle tout de suite ; une heure exacte
// demande un calcul mental a chaque lecture.
const depuis = (iso) => {
  if (!iso) return '';
  const debut = Date.parse(iso);
  if (Number.isNaN(debut)) return '';
  const s = Math.max(0, Math.round((Date.now() - debut) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
};

function Avancement({ avancement }) {
  if (!avancement) return null;
  const { phase, done, total } = avancement;
  if (!total) return <span className="admin-jobs-phase">{phase}</span>;
  return (
    <span className="admin-jobs-phase">
      {phase} {done}/{total}
    </span>
  );
}

function AdminJobs() {
  const [travaux, setTravaux] = useState([]);
  const [resume, setResume] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  const [enAction, setEnAction] = useState('');

  const charger = useCallback(async () => {
    try {
      const data = await listJobs();
      setTravaux(data.travaux || []);
      setResume(data.resume || null);
      setErreur('');
    } catch (err) {
      setErreur(err?.message || 'Lecture impossible');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
    // Un rendu dure des minutes : un tableau qu'il faut recharger a la main
    // ne sert a rien pendant qu'on le regarde avancer.
    const minuteur = setInterval(charger, 5000);
    return () => clearInterval(minuteur);
  }, [charger]);

  const arreter = async (travail) => {
    const message = travail.genre === 'gelato'
      ? 'Relacher le verrou de cet envoi ?\n\nCela NE RAPPELLE PAS le fichier : ce qui est déjà parti chez l’imprimeur y reste. Cela rend seulement la commande relançable.'
      : 'Arrêter cette fabrication ?\n\nLe navigateur de rendu est tué : le PDF ne sera pas produit.';
    // eslint-disable-next-line no-alert
    if (!window.confirm(message)) return;

    setEnAction(travail.id);
    try {
      if (travail.genre === 'gelato') await stopGelatoJob(travail.orderId);
      else await stopPdfJob(travail.id);
      await charger();
    } catch (err) {
      setErreur(err?.message || 'Arrêt impossible');
    } finally {
      setEnAction('');
    }
  };

  const nettoyer = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Oublier les demandes terminées ?\n\nCelles qui tournent encore ne sont pas touchées.')) return;
    setEnAction('nettoyage');
    try {
      await cleanupJobs();
      await charger();
    } catch (err) {
      setErreur(err?.message || 'Nettoyage impossible');
    } finally {
      setEnAction('');
    }
  };

  if (chargement) return <p className="admin-state">Lecture des travaux en cours…</p>;

  return (
    <section className="admin-jobs">
      <div className="admin-jobs-head">
        <h2>Travaux</h2>
        <div className="admin-jobs-head-droite">
          {resume && (
            <span className="admin-jobs-resume">
              {resume.enCours} en cours · {resume.bloquees} bloquée(s) ·{' '}
              {resume.echouees} échouée(s) · {resume.reussies} réussie(s)
            </span>
          )}
          <button
            className="btn btn-outline btn-petit"
            type="button"
            onClick={nettoyer}
            disabled={enAction === 'nettoyage'}
          >
            Nettoyer les terminées
          </button>
        </div>
      </div>

      {erreur && <p className="admin-events-erreur">{erreur}</p>}

      {travaux.length === 0 ? (
        <p className="admin-state">Aucune fabrication ni envoi en mémoire.</p>
      ) : (
        <div className="admin-jobs-table">
          {travaux.map((t) => (
            <div className={`admin-jobs-ligne ${TONS[t.etat] || ''}`} key={`${t.genre}-${t.id}`}>
              <span className="admin-jobs-genre">{GENRES[t.genre] || t.genre}</span>

              <span className="admin-jobs-livre">
                <strong>{t.livre || t.bookId || '—'}</strong>
                {t.demandeur && <span className="admin-jobs-demandeur">{t.demandeur}</span>}
              </span>

              <span className="admin-jobs-etat">
                {t.etat}
                <Avancement avancement={t.avancement} />
              </span>

              <span className="admin-jobs-temps">
                {quand(t.demarreLe || t.creeLe)}
                <span className="admin-jobs-depuis">
                  {t.fini ? `terminée en ${depuis(t.demarreLe)}` : `depuis ${depuis(t.demarreLe || t.creeLe)}`}
                </span>
              </span>

              <span className="admin-jobs-fichier">
                {t.fichier
                  ? (t.fichier.absent ? 'fichier nettoyé' : `${t.fichier.mo} Mo`)
                  : ''}
              </span>

              <span className="admin-jobs-action">
                {t.arretable && (
                  <button
                    className="btn btn-outline btn-petit"
                    type="button"
                    onClick={() => arreter(t)}
                    disabled={enAction === t.id}
                  >
                    {t.genre === 'gelato' ? 'Déverrouiller' : 'Arrêter'}
                  </button>
                )}
              </span>

              {t.erreur && <span className="admin-jobs-erreur">{t.erreur}</span>}
            </div>
          ))}
        </div>
      )}

      <p className="admin-jobs-note">
        Ces demandes vivent en mémoire du serveur : un redémarrage vide la liste.
        Les fichiers PDF déjà produits, eux, restent téléchargeables — ils sont
        retrouvés sur le disque.
      </p>
    </section>
  );
}

export default AdminJobs;
