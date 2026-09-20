import React, { useEffect, useRef, useState } from 'react';
import { demanderUnCode, verifierLeCode } from '../../services/emailOtp';
import './EmailOtpForm.css';

// E-mail, puis code a 6 chiffres. Rien d'autre (2026-09-20).
//
// Pas de mot de passe a inventer, pas de confirmation, pas de nom : au
// moment de commander, chaque champ supplementaire est un acheteur en
// moins. L'adresse suffit a retrouver son livre et a suivre sa fabrication,
// et le code prouve qu'elle est bien a lui.
//
// Deux usages, un seul composant :
//   - au paiement, EN PLACE dans la page de commande (jamais une
//     redirection : le livre et la commande en cours vivent dans cet ecran,
//     les quitter multiplierait les facons de les perdre) ;
//   - depuis « Mes livres », pour retrouver ses livres sur un autre
//     appareil.
//
// Le choix conversion/connexion est pris par le service (emailOtp.js) : ce
// composant ne fait que le transporter d'une etape a l'autre.
const DELAI_RENVOI_S = 60;

function EmailOtpForm({
  emailInitial = '',
  libelleAction = 'Continuer',
  onSuccess,
  onCancel
}) {
  const [etape, setEtape] = useState('email');
  const [email, setEmail] = useState(emailInitial);
  const [code, setCode] = useState('');
  const [voie, setVoie] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [attenteRenvoi, setAttenteRenvoi] = useState(0);
  const champCode = useRef(null);

  // Compte a rebours du renvoi. Supabase refuse un second envoi trop
  // rapproche : mieux vaut griser le lien que laisser quelqu'un declencher
  // une erreur qu'il ne comprendra pas.
  useEffect(() => {
    if (attenteRenvoi <= 0) return undefined;
    const minuteur = setTimeout(() => setAttenteRenvoi((v) => v - 1), 1000);
    return () => clearTimeout(minuteur);
  }, [attenteRenvoi]);

  useEffect(() => {
    if (etape === 'code' && champCode.current) champCode.current.focus();
  }, [etape]);

  const envoyerLeCode = async (event) => {
    if (event) event.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const { voie: voieChoisie } = await demanderUnCode(email);
      setVoie(voieChoisie);
      setEtape('code');
      setAttenteRenvoi(DELAI_RENVOI_S);
    } catch (err) {
      setErreur(err.message || "L'envoi du code a echoue.");
    } finally {
      setEnCours(false);
    }
  };

  const validerLeCode = async (event) => {
    if (event) event.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const resultat = await verifierLeCode({ email, code, voie });
      if (onSuccess) await onSuccess(resultat);
    } catch (err) {
      setErreur(err.message || 'Verification impossible.');
    } finally {
      setEnCours(false);
    }
  };

  if (etape === 'email') {
    return (
      <form className="otp-form" onSubmit={envoyerLeCode}>
        <label className="otp-label" htmlFor="otp-email">Votre adresse e-mail</label>
        <input
          id="otp-email"
          type="email"
          className="input-luxe"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="vous@exemple.fr"
          autoComplete="email"
          required
        />
        <p className="otp-hint">
          Nous vous envoyons un code à 6 chiffres. Pas de mot de passe à retenir.
        </p>
        {erreur && <p className="otp-error">{erreur}</p>}
        <div className="otp-actions">
          {onCancel && (
            <button type="button" className="btn btn-outline" onClick={onCancel} disabled={enCours}>
              Annuler
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={enCours}>
            {enCours ? 'Envoi…' : 'Recevoir mon code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="otp-form" onSubmit={validerLeCode}>
      <label className="otp-label" htmlFor="otp-code">Code reçu par e-mail</label>
      <input
        id="otp-code"
        ref={champCode}
        type="text"
        className="input-luxe otp-code-input"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={6}
        required
      />
      <p className="otp-hint">
        Envoyé à <strong>{email}</strong>.{' '}
        <button
          type="button"
          className="otp-link"
          onClick={() => { setEtape('email'); setCode(''); setErreur(''); }}
        >
          Changer d’adresse
        </button>
      </p>
      {erreur && <p className="otp-error">{erreur}</p>}
      <div className="otp-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={envoyerLeCode}
          disabled={enCours || attenteRenvoi > 0}
        >
          {attenteRenvoi > 0 ? `Renvoyer (${attenteRenvoi} s)` : 'Renvoyer le code'}
        </button>
        <button type="submit" className="btn btn-primary" disabled={enCours || code.length !== 6}>
          {enCours ? 'Vérification…' : libelleAction}
        </button>
      </div>
    </form>
  );
}

export default EmailOtpForm;
