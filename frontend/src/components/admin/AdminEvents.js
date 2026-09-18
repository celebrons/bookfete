import React, { useCallback, useEffect, useState } from 'react';
import { listEvents } from '../../services/adminApi';
import './AdminEvents.css';

// Journal des evenements metier, dans l'espace d'administration.
//
// Demande du 2026-09-18. Ce ne sont PAS les journaux du serveur : une ligne
// par chose importante arrivee a un livre ou a une commande. La journee du
// 2026-09-17/18 a montre la difference — le doublon Gelato, le statut reecrit
// par un serveur perime, la traduction fausse : aucun n'a produit d'erreur,
// les journaux techniques etaient vides. Ce qui manquait etait le DEROULE.
//
// Purement presentatif : la lecture est faite par l'API admin, elle-meme
// fermee par defaut (ADMIN_EMAILS).

// Chaque type d'evenement a un libelle lisible. Un type inconnu s'affiche
// tel quel plutot que d'etre masque : mieux vaut une ligne brute qu'une
// ligne absente.
const LIBELLES = {
  'order.created': 'Commande créée',
  'order.deleted': 'Commande supprimée',
  'pdf.ready': 'PDF généré',
  'pdf.failed': 'Échec de génération PDF',
  'gelato.submit.started': 'Envoi imprimeur lancé',
  'gelato.submitted': 'Déposé chez l’imprimeur',
  'gelato.submit.failed': 'Échec envoi imprimeur',
  'status.changed': 'Changement de statut'
};

const NIVEAUX = [
  { valeur: '', libelle: 'Tout' },
  { valeur: 'info', libelle: 'Information' },
  { valeur: 'warn', libelle: 'Attention' },
  { valeur: 'error', libelle: 'Erreur' }
];

const quand = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('fr-FR');
};

// Le detail utile, sans l'environnement qu'on affiche a part.
const detail = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return '';
  return Object.entries(metadata)
    .filter(([cle]) => cle !== 'env')
    .map(([cle, valeur]) => `${cle} : ${typeof valeur === 'object' ? JSON.stringify(valeur) : valeur}`)
    .join(' · ');
};

function AdminEvents() {
  const [evenements, setEvenements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [niveau, setNiveau] = useState('');

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const reponse = await listEvents({ level: niveau || undefined, limit: 200 });
      setEvenements(Array.isArray(reponse?.events) ? reponse.events : []);
    } catch (err) {
      setErreur(err?.message || 'Lecture du journal impossible');
    } finally {
      setChargement(false);
    }
  }, [niveau]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <section className="admin-events">
      <div className="admin-events-head">
        <h2>Journal des événements</h2>
        <div className="admin-events-filtres">
          <select value={niveau} onChange={(e) => setNiveau(e.target.value)} aria-label="Filtrer par niveau">
            {NIVEAUX.map((n) => <option key={n.valeur} value={n.valeur}>{n.libelle}</option>)}
          </select>
          <button type="button" className="btn btn-outline" onClick={charger} disabled={chargement}>
            {chargement ? 'Chargement…' : 'Actualiser'}
          </button>
        </div>
      </div>

      {erreur && <p className="admin-events-erreur">{erreur}</p>}

      {!erreur && !chargement && evenements.length === 0 && (
        <p className="admin-state">
          Aucun événement pour l’instant. Ils apparaîtront dès la prochaine commande,
          génération de PDF ou envoi à l’imprimeur.
        </p>
      )}

      {evenements.length > 0 && (
        <div className="admin-events-table-wrap">
          <table className="admin-events-table">
            <thead>
              <tr>
                <th>Quand</th>
                <th>Quoi</th>
                <th>Qui</th>
                <th>Où</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {evenements.map((e) => (
                <tr key={e.id} className={`is-${e.level}`}>
                  <td className="admin-events-quand">{quand(e.created_at)}</td>
                  <td>
                    <span className="admin-events-type">{LIBELLES[e.type] || e.type}</span>
                    {e.message && <span className="admin-events-message">{e.message}</span>}
                  </td>
                  {/* QUI a agi : une adresse quand c'est une personne,
                      « gelato » ou « systeme » sinon. */}
                  <td className="admin-events-qui">{e.actor || '—'}</td>
                  {/* Quel serveur a agi. Indispensable depuis qu'on fait
                      tourner plusieurs environnements sur la meme base. */}
                  <td className="admin-events-env">{e.metadata?.env || '—'}</td>
                  <td className="admin-events-detail">{detail(e.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default AdminEvents;
