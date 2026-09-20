import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import {
  linkAnonymousBooksAfterLogin,
  rememberAnonymousTokenBeforeLogin
} from '../../services/anonymousSession';
import '../../styles/luxe-theme.css';
import './AuthLuxe.css';

const TEST1_CREDENTIALS = {
  email: 'test1@test.com',
  password: 'password123'
};

const LoginLuxe = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runLogin = async (emailValue, passwordValue) => {
    setLoading(true);
    setError(null);

    try {
      // Demarrage sans compte (2026-09-12) : le visiteur a peut-etre commence
      // un livre en session anonyme avant de se connecter a un compte qui
      // existait deja. Se connecter REMPLACE la session, donc l'identifiant
      // change et les livres commences deviendraient orphelins. On met le
      // jeton anonyme de cote AVANT (il disparaitrait apres), puis on
      // demande au serveur de transferer les livres APRES.
      await rememberAnonymousTokenBeforeLogin();

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: String(emailValue || '').trim().toLowerCase(),
        password: String(passwordValue || '')
      });

      if (loginError) throw loginError;

      // Jamais bloquant : ne pas retrouver un livre commence ne doit pas
      // empecher de se connecter.
      await linkAnonymousBooksAfterLogin();

      const returnTo = localStorage.getItem('returnTo');
      localStorage.removeItem('returnTo');
      localStorage.removeItem('pendingBookData');
      localStorage.removeItem('pendingChapters');

      if (returnTo) {
        navigate(returnTo, { replace: true });
      } else {
        navigate('/dashboard');
      }
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    await runLogin(email, password);
  };

  const handleTest1Login = async () => {
    if (loading) return;
    setEmail(TEST1_CREDENTIALS.email);
    setPassword(TEST1_CREDENTIALS.password);
    await runLogin(TEST1_CREDENTIALS.email, TEST1_CREDENTIALS.password);
  };

  // signInWithOAuth fait un aller-retour plein-page vers le fournisseur : on
  // choisit explicitement ou revenir plutot que de compter sur un
  // comportement par defaut. Reprend le meme `returnTo` que le login par
  // mot de passe (pose par CreateBookSansIA.js avant de rediriger ici) —
  // /create-book relit alors son brouillon et, session presente, cree le
  // livre automatiquement. Sans returnTo (visite normale de /login), on va
  // simplement au tableau de bord, jamais vers un ecran de creation non lie.
  const handleOAuth = async (provider) => {
    setError(null);
    // Meme raison que dans runLogin : l'aller-retour OAuth remplacera la
    // session anonyme, son jeton doit donc etre mis de cote maintenant. Le
    // rattachement des livres se fera au retour, au chargement de l'app
    // (voir App.js) — ce composant ne sera plus monte.
    await rememberAnonymousTokenBeforeLogin();
    const returnTo = localStorage.getItem('returnTo') || '/dashboard';
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${returnTo}` }
    });
    if (oauthError) setError(oauthError.message);
  };


  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="label-gold">BIENVENUE</span>
          <h2>Connexion</h2>
          <p>Accedez a votre espace personnel</p>
        </div>

        {error && (
          <div className="auth-error">
            {error === 'Invalid login credentials' ? 'Email ou mot de passe incorrect' : error}
          </div>
        )}

        <div className="auth-oauth">
          <button type="button" className="btn btn-outline auth-oauth-btn" onClick={() => handleOAuth('google')} disabled={loading}>
            Continuer avec Google
          </button>
          <button type="button" className="btn btn-outline auth-oauth-btn" onClick={() => handleOAuth('apple')} disabled={loading}>
            Continuer avec Apple
          </button>
        </div>

        <div className="auth-divider">
          <span>OU PAR EMAIL</span>
        </div>

        <form onSubmit={handleLogin} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@exemple.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="auth-options">
            <label className="remember-me">
              <input type="checkbox" />
              <span>Se souvenir de moi</span>
            </label>
            <span className="forgot-link" style={{ opacity: 0.7 }}>
              Reinitialisation bientot disponible
            </span>
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-button"
            disabled={loading}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div className="test-accounts">
          <p className="test-accounts-title">Acces rapide compte test</p>
          <div className="test-accounts-grid">
            <button
              type="button"
              className="btn test-account-btn"
              onClick={handleTest1Login}
              disabled={loading}
            >
              <span className="test-account-email">{TEST1_CREDENTIALS.email}</span>
              <span className="test-account-role">test1</span>
            </button>
          </div>
          <p className="test-accounts-note">
            Mot de passe: <strong>{TEST1_CREDENTIALS.password}</strong>
          </p>
        </div>

        <div className="auth-divider">
          <span>OU</span>
        </div>

        {/* Le chemin le plus court pour quelqu'un qui a commande sans jamais
            creer de mot de passe : adresse + code, rien a se rappeler
            (2026-09-20). Mis AVANT « creer un compte » parce que c'est le
            cas le plus frequent de retour sur le site. */}
        <div className="auth-footer">
          Vous avez commandé sans mot de passe ?
          <Link to="/mes-livres">
            Retrouver mes livres
          </Link>
        </div>

        <div className="auth-footer">
          Pas encore de compte ?
          <Link to="/register">
            Creer un compte
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginLuxe;
