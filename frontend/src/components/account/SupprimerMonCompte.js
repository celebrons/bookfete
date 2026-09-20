import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { getApiBaseUrl } from '../../services/compositionApi';
import './SupprimerMonCompte.css';

// Supprimer son compte (2026-09-20).
//
// Quelqu'un qui a confie ses photos de famille doit pouvoir les retirer sans
// ecrire a personne. Mais c'est l'action la plus destructrice de
// l'application, et elle est irreversible : la mise en page suit cette
// double contrainte.
//
//   DISCRET. Un simple lien en bas de page, pas un bouton rouge en evidence.
//   Personne ne vient dans ses parametres pour supprimer son compte — celui
//   qui le cherche le trouvera, les autres ne doivent pas tomber dessus.
//
//   EXPLICITE. Une fois ouvert, on NOMME ce qui disparait, chiffres a
//   l'appui quand on les a. « Etes-vous sur ? » ne veut rien dire ; « vos 3
//   livres et 68 photos » se comprend.
//
//   DELIBERE. Il faut ecrire SUPPRIMER pour confirmer. Ce n'est pas une
//   formalite : c'est le geste qui distingue une decision d'un clic de trop,
//   et il n'existe aucune annulation apres coup.
const MOT_DE_CONFIRMATION = 'SUPPRIMER';

function SupprimerMonCompte({ nombreLivres = 0, nombreCommandes = 0 }) {
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  const supprimer = async () => {
    setErreur('');
    setEnCours(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expiree. Reconnectez-vous.');

      const reponse = await fetch(`${getApiBaseUrl()}/auth/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw new Error(corps?.error || 'La suppression a echoue.');

      // Le compte n'existe plus : la session locale n'a plus d'objet.
      await supabase.auth.signOut().catch(() => {});
      navigate('/', { replace: true });
    } catch (err) {
      setErreur(err.message || 'La suppression a echoue.');
      setEnCours(false);
    }
  };

  if (!ouvert) {
    return (
      <p className="suppr-compte-ligne">
        <button type="button" className="suppr-compte-lien" onClick={() => setOuvert(true)}>
          Supprimer mon compte
        </button>
      </p>
    );
  }

  const peutSupprimer = saisie.trim().toUpperCase() === MOT_DE_CONFIRMATION;

  return (
    <div className="suppr-compte-panneau">
      <h3>Supprimer définitivement votre compte</h3>

      <p className="suppr-compte-texte">
        Cette action est <strong>irréversible</strong>. Seront effacés immédiatement :
      </p>
      <ul className="suppr-compte-liste">
        <li>
          {nombreLivres > 0
            ? <>vos <strong>{nombreLivres} livre{nombreLivres > 1 ? 's' : ''}</strong>, leurs pages et leurs souvenirs</>
            : <>vos livres, leurs pages et leurs souvenirs</>}
        </li>
        <li><strong>toutes vos photos</strong>, y compris les originaux</li>
        <li>
          {nombreCommandes > 0
            ? <>l’historique de vos <strong>{nombreCommandes} commande{nombreCommandes > 1 ? 's' : ''}</strong></>
            : <>l’historique de vos commandes</>}
        </li>
        <li>votre adresse e-mail et vos adresses de livraison</li>
      </ul>
      <p className="suppr-compte-texte">
        Rien de tout cela ne pourra être récupéré, par vous ni par nous.
        Si un livre est en cours de fabrication, la suppression sera refusée jusqu’à sa livraison.
      </p>

      <label className="suppr-compte-label" htmlFor="suppr-confirmation">
        Écrivez <strong>{MOT_DE_CONFIRMATION}</strong> pour confirmer
      </label>
      <input
        id="suppr-confirmation"
        type="text"
        className="input-luxe"
        value={saisie}
        onChange={(event) => setSaisie(event.target.value)}
        autoComplete="off"
        placeholder={MOT_DE_CONFIRMATION}
      />

      {erreur && <p className="suppr-compte-erreur">{erreur}</p>}

      <div className="suppr-compte-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => { setOuvert(false); setSaisie(''); setErreur(''); }}
          disabled={enCours}
        >
          Annuler
        </button>
        <button
          type="button"
          className="btn suppr-compte-valider"
          onClick={supprimer}
          disabled={!peutSupprimer || enCours}
        >
          {enCours ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
      </div>
    </div>
  );
}

export default SupprimerMonCompte;
