import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { messageReseau } from '../../services/httpClient';
import '../../styles/luxe-theme.css';
import './AuthLuxe.css';

// Demande de reinitialisation (2026-09-30) : jusqu'ici le lien "Mot de passe
// oublie" de LoginLuxe.js n'etait qu'un texte inerte ("Reinitialisation
// bientot disponible"). supabase.auth.resetPasswordForEmail envoie l'email
// via le systeme d'authentification de Supabase (independant de Brevo/
// transactionalEmails.js, qui ne gere que les emails METIER — commande,
// PDF pret, etc.) et renvoie toujours un succes, meme si l'adresse n'existe
// pas : ne jamais reveler ici quels emails ont un compte.
const ForgotPasswordLuxe = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [envoye, setEnvoye] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        String(email || '').trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe` }
      );
      if (resetError) throw resetError;
      setEnvoye(true);
    } catch (resetError) {
      setError(messageReseau(resetError) || resetError.message);
    } finally {
      setLoading(false);
    }
  };

  if (envoye) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <span className="label-gold">EMAIL ENVOYÉ</span>
          <h2 style={{ marginBottom: 'var(--space-md)' }}>Vérifiez votre boîte de réception</h2>
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-xl)' }}>
            Si un compte existe avec l'adresse <strong>{email}</strong>, un email vient d'être envoyé
            avec un lien pour choisir un nouveau mot de passe. Pensez à vérifier vos indésirables.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ padding: '14px 40px' }}>
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="label-gold">MOT DE PASSE OUBLIÉ</span>
          <h2>Réinitialiser votre mot de passe</h2>
          <p>Indiquez votre adresse email, nous vous envoyons un lien pour en choisir un nouveau.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@exemple.com"
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <button type="submit" className="btn btn-primary auth-button" disabled={loading}>
            {loading ? 'Envoi...' : 'Envoyer le lien'}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login">← Retour à la connexion</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordLuxe;
