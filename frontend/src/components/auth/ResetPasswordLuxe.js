import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { messageReseau } from '../../services/httpClient';
import '../../styles/luxe-theme.css';
import './AuthLuxe.css';

// Choix du nouveau mot de passe (2026-09-30), apres le lien recu depuis
// ForgotPasswordLuxe.js. Supabase traite lui-meme l'URL de retour (jeton
// dans le fragment #, type=recovery) des la creation du client
// (detectSessionInUrl, active par defaut) : cette page n'a donc qu'a
// verifier qu'une session existe avant d'autoriser le changement, jamais a
// lire le jeton elle-meme. Verifie par getSession() ET par l'evenement
// PASSWORD_RECOVERY (l'un peut arriver avant que l'ecouteur soit pose,
// l'autre le rattrape) — la encore, jamais bloquant si l'ordre varie.
const ResetPasswordLuxe = () => {
  const navigate = useNavigate();
  const [verification, setVerification] = useState(true);
  const [sessionPrete, setSessionPrete] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    let monte = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!monte) return;
      if (session) setSessionPrete(true);
      setVerification(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!monte) return;
      if (event === 'PASSWORD_RECOVERY' || session) {
        setSessionPrete(true);
        setVerification(false);
      }
    });

    return () => { monte = false; subscription.unsubscribe(); };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSucces(true);
    } catch (updateError) {
      setError(messageReseau(updateError) || updateError.message);
    } finally {
      setLoading(false);
    }
  };

  if (verification) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>Vérification du lien...</p>
        </div>
      </div>
    );
  }

  if (succes) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <span className="label-gold">MOT DE PASSE MIS À JOUR</span>
          <h2 style={{ marginBottom: 'var(--space-md)' }}>C'est fait</h2>
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-xl)' }}>
            Votre nouveau mot de passe est actif. Vous êtes déjà connecté·e.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '14px 40px' }}
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            Aller à mon espace
          </button>
        </div>
      </div>
    );
  }

  if (!sessionPrete) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <span className="label-gold">LIEN EXPIRÉ</span>
          <h2 style={{ marginBottom: 'var(--space-md)' }}>Ce lien n'est plus valide</h2>
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-xl)' }}>
            Les liens de réinitialisation ne sont valables qu'une seule fois et pendant un temps limité.
          </p>
          <Link to="/mot-de-passe-oublie" className="btn btn-primary" style={{ padding: '14px 40px' }}>
            Redemander un lien
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="label-gold">NOUVEAU MOT DE PASSE</span>
          <h2>Choisissez un nouveau mot de passe</h2>
          <p>Au moins 8 caractères.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="password">Nouveau mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
                minLength="8"
                disabled={loading}
                style={{ paddingRight: '45px' }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  color: 'var(--text-light)',
                  padding: '4px'
                }}
                tabIndex="-1"
              >
                {showPassword ? 'O' : 'o'}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="********"
              required
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn btn-primary auth-button" disabled={loading}>
            {loading ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordLuxe;
