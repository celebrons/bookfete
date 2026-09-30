import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
function SupprimerMonCompte({ nombreLivres = 0, nombreCommandes = 0 }) {
  const { t } = useTranslation('account');
  // Mot de confirmation TRADUIT (chantier bilingue, 2026-09-30) : un
  // visiteur anglophone tape "DELETE", pas "SUPPRIMER" — l'instruction
  // affichee et la verification doivent toujours s'accorder, jamais l'une
  // en anglais et l'autre restee en francais.
  const motDeConfirmation = t('deleteAccount.confirmWord');
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
      if (!session?.access_token) throw new Error(t('deleteAccount.errorSessionExpired'));

      const reponse = await fetch(`${getApiBaseUrl()}/auth/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw new Error(corps?.error || t('deleteAccount.errorFailed'));

      // Le compte n'existe plus : la session locale n'a plus d'objet.
      await supabase.auth.signOut().catch(() => {});
      navigate('/', { replace: true });
    } catch (err) {
      setErreur(err.message || t('deleteAccount.errorFailed'));
      setEnCours(false);
    }
  };

  if (!ouvert) {
    return (
      <p className="suppr-compte-ligne">
        <button type="button" className="suppr-compte-lien" onClick={() => setOuvert(true)}>
          {t('deleteAccount.link')}
        </button>
      </p>
    );
  }

  const peutSupprimer = saisie.trim().toUpperCase() === motDeConfirmation.toUpperCase();

  return (
    <div className="suppr-compte-panneau">
      <h3>{t('deleteAccount.title')}</h3>

      <p className="suppr-compte-texte">
        {t('deleteAccount.intro')}
      </p>
      <ul className="suppr-compte-liste">
        <li>
          {nombreLivres > 0
            ? <>{t('deleteAccount.itemBooksPrefix')} <strong>{t('deleteAccount.itemBooksCount', { count: nombreLivres, plural: nombreLivres > 1 ? 's' : '' })}</strong>{t('deleteAccount.itemBooksSuffix')}</>
            : t('deleteAccount.itemBooksPlain')}
        </li>
        <li><strong>{t('deleteAccount.itemPhotos')}</strong></li>
        <li>
          {nombreCommandes > 0
            ? <>{t('deleteAccount.itemOrdersPrefix')} <strong>{t('deleteAccount.itemOrdersCount', { count: nombreCommandes, plural: nombreCommandes > 1 ? 's' : '' })}</strong></>
            : t('deleteAccount.itemOrdersPlain')}
        </li>
        <li>{t('deleteAccount.itemAddresses')}</li>
      </ul>
      <p className="suppr-compte-texte">
        {t('deleteAccount.warning')}
      </p>

      <label className="suppr-compte-label" htmlFor="suppr-confirmation">
        {t('deleteAccount.confirmLabel', { word: motDeConfirmation })}
      </label>
      <input
        id="suppr-confirmation"
        type="text"
        className="input-luxe"
        value={saisie}
        onChange={(event) => setSaisie(event.target.value)}
        autoComplete="off"
        placeholder={motDeConfirmation}
      />

      {erreur && <p className="suppr-compte-erreur">{erreur}</p>}

      <div className="suppr-compte-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => { setOuvert(false); setSaisie(''); setErreur(''); }}
          disabled={enCours}
        >
          {t('deleteAccount.cancel')}
        </button>
        <button
          type="button"
          className="btn suppr-compte-valider"
          onClick={supprimer}
          disabled={!peutSupprimer || enCours}
        >
          {enCours ? t('deleteAccount.submitting') : t('deleteAccount.submit')}
        </button>
      </div>
    </div>
  );
}

export default SupprimerMonCompte;
