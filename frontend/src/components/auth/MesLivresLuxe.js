import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmailOtpForm from './EmailOtpForm';
import { getCurrentSession, isAnonymousSession } from '../../services/anonymousSession';
import '../../styles/luxe-theme.css';
import './EmailOtpForm.css';

// « Retrouver mes livres » (2026-09-20).
//
// Le pendant indispensable du demarrage sans compte : la session anonyme vit
// dans UN navigateur. Changer d'appareil, effacer ses cookies, ou simplement
// revenir depuis son telephone faisait tout disparaitre — c'est la seule
// vraie limite du parcours sans inscription, et il lui fallait une sortie.
//
// Une adresse, un code, et on retrouve ses livres. Aucun mot de passe n'a
// jamais ete cree, il n'y a donc rien a « avoir oublie » : c'est le meme
// geste a la premiere commande et deux mois plus tard.
function MesLivresLuxe() {
  const navigate = useNavigate();
  const [dejaConnecte, setDejaConnecte] = useState(false);

  useEffect(() => {
    let annule = false;
    getCurrentSession().then((session) => {
      if (annule) return;
      // Une session anonyme n'est pas « etre connecte » : c'est justement la
      // situation ou l'on vient chercher ses livres.
      setDejaConnecte(Boolean(session) && !isAnonymousSession(session));
    });
    return () => { annule = true; };
  }, []);

  return (
    <div className="orders-page">
      <div className="container-luxe orders-shell">
        <article className="orders-panel" style={{ maxWidth: 520 }}>
          <h1 style={{ marginTop: 0 }}>Retrouver mes livres</h1>

          {dejaConnecte ? (
            <>
              <p className="orders-disclaimer">
                Vous êtes déjà identifié. Vos livres vous attendent sur votre tableau de bord.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard')}>
                Voir mes livres
              </button>
            </>
          ) : (
            <>
              <p className="orders-disclaimer" style={{ marginBottom: 16 }}>
                Indiquez l’adresse e-mail utilisée lors de votre commande. Nous vous envoyons
                un code de connexion — il n’y a pas de mot de passe à retrouver.
              </p>
              <EmailOtpForm
                libelleAction="Voir mes livres"
                onSuccess={() => navigate('/dashboard', { replace: true })}
              />
              <p className="otp-hint" style={{ marginTop: 16 }}>
                Un livre commencé sur cet appareil sans compte sera automatiquement rattaché.
              </p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}

export default MesLivresLuxe;
