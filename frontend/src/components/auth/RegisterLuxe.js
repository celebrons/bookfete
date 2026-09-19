import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import {
  convertAnonymousToAccount,
  isCurrentlyAnonymous,
  rememberAnonymousTokenBeforeLogin
} from '../../services/anonymousSession';
import '../../styles/luxe-theme.css';
import './AuthLuxe.css';

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const DRAFT_KEY = 'createBookDraftSansIA';

const RegisterLuxe = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Reformule l'ecran ("Enregistrez votre livre" plutot que "Inscription")
  // quand un livre est deja en attente de sauvegarde (brouillon laisse par
  // CreateBookSansIA.js avant de rediriger ici) — sinon copie generique
  // (quelqu'un arrive directement sur /register sans avoir commence de livre).
  const [hasPendingDraft] = useState(() => Boolean(localStorage.getItem(DRAFT_KEY)));

  const navigate = useNavigate();

  // Meme cible que LoginLuxe.js : returnTo si present (pose par
  // CreateBookSansIA.js ou par la page de commande quand elle demande un
  // compte), sinon le tableau de bord.
  //
  // On l'EFFACE en le lisant, comme LoginLuxe : une cible laissee derriere
  // detournerait la connexion suivante, des semaines plus tard, vers une
  // page qui n'a plus rien a voir.
  const returnTarget = () => {
    const cible = localStorage.getItem('returnTo');
    localStorage.removeItem('returnTo');
    return cible || '/dashboard';
  };

  const handleOAuth = async (provider) => {
    setError(null);
    // L'aller-retour OAuth remplace la session anonyme : on met son jeton de
    // cote pour pouvoir rattacher les livres commences au retour (App.js).
    await rememberAnonymousTokenBeforeLogin();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${returnTarget()}` }
    });
    if (oauthError) setError(oauthError.message);
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caracteres.');
      setLoading(false);
      return;
    }

    try {
      // Demarrage sans compte (2026-09-12) : si le visiteur a deja commence
      // son livre en session ANONYME, on ne cree pas un second compte — on
      // CONVERTIT celui-ci. L'identifiant reste le meme, donc le livre, les
      // photos et les pages deja composees restent rattaches sans aucun
      // transfert. Creer un nouveau compte ici les abandonnerait.
      if (await isCurrentlyAnonymous()) {
        await convertAnonymousToAccount({ email, password, fullName });
        localStorage.removeItem(DRAFT_KEY);
        navigate(returnTarget(), { replace: true });
        return;
      }

      const response = await fetch(`${buildApiBaseUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Erreur lors de la creation du compte.');
      }

      // Le compte est cree cote serveur (client service-role) : ca n'ouvre
      // pas de session dans CE navigateur pour autant. On tente une
      // connexion immediate avec les memes identifiants pour eviter un
      // aller-retour manuel par /login — si l'email doit d'abord etre
      // confirme, ca echoue simplement et on retombe sur l'ecran d'attente
      // ci-dessous (rien de perdu : le brouillon reste en localStorage).
      if (!payload?.requiresEmailConfirmation) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInError) {
          navigate(returnTarget(), { replace: true });
          return;
        }
      }

      setSuccessMessage(
        payload?.requiresEmailConfirmation
          ? 'Compte cree. Confirmez votre email pour pouvoir vous connecter.'
          : 'Votre compte est actif. Connectez-vous pour continuer.'
      );
      setSuccess(true);
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '64px',
              marginBottom: 'var(--space-lg)',
              animation: 'fadeIn 0.6s ease'
            }}
          >
            OK
          </div>
          <span className="label-gold">COMPTE CREE</span>
          <h2 style={{ marginBottom: 'var(--space-md)' }}>Inscription reussie</h2>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>
            {successMessage || 'Compte cree avec succes.'}
          </p>
          {hasPendingDraft && (
            <p className="body-text" style={{ color: 'var(--text-light)' }}>
              Votre livre est deja sauvegarde, il vous attend.
            </p>
          )}
          <p
            className="body-text"
            style={{
              color: 'var(--text-light)',
              marginBottom: 'var(--space-xl)'
            }}
          >
            Connectez-vous pour continuer.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="btn btn-primary"
            style={{ padding: '14px 40px' }}
          >
            Aller a la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="label-gold">{hasPendingDraft ? 'DERNIERE ETAPE' : 'BIENVENUE'}</span>
          <h2>{hasPendingDraft ? 'Enregistrez votre livre' : 'Inscription'}</h2>
          <p>
            {hasPendingDraft
              ? 'Creez un compte pour sauvegarder votre livre et le retrouver a tout moment.'
              : 'Creez votre compte utilisateur'}
          </p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-oauth">
          <button type="button" className="btn btn-outline auth-oauth-btn" onClick={() => handleOAuth('google')} disabled={loading}>
            Continuer avec Google
          </button>
          <button type="button" className="btn btn-outline auth-oauth-btn" onClick={() => handleOAuth('apple')} disabled={loading}>
            Continuer avec Apple
          </button>
        </div>

        <div className="auth-divider">
          <span>OU CREER UN COMPTE AVEC EMAIL</span>
        </div>

        <form onSubmit={handleRegister} className="auth-form">
          <div className="auth-field">
            <label htmlFor="fullName">Nom complet</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Jean Dupont"
              required
              disabled={loading}
              autoComplete="name"
            />
          </div>

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

          <div className="auth-field">
            <label htmlFor="password">Mot de passe</label>
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
            <small
              style={{
                fontSize: '11px',
                color: 'var(--text-light)',
                marginTop: '4px',
                display: 'block'
              }}
            >
              Minimum 8 caracteres
            </small>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="********"
                required
                disabled={loading}
                style={{ paddingRight: '45px' }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
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
                {showConfirmPassword ? 'O' : 'o'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-button"
            disabled={loading}
          >
            {loading ? 'Inscription...' : "S'inscrire"}
          </button>
        </form>

        <div className="auth-divider">
          <span>OU</span>
        </div>

        <div className="auth-footer">
          Deja un compte ?
          <Link to="/login">
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterLuxe;
