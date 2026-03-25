import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
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
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: String(emailValue || '').trim().toLowerCase(),
        password: String(passwordValue || '')
      });

      if (loginError) throw loginError;

      const returnTo = localStorage.getItem('returnTo');
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
