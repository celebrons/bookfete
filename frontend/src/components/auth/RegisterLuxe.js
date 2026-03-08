import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../../styles/luxe-theme.css';
import './AuthLuxe.css';

const buildApiBaseUrl = () => {
  const configured = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const trimmed = configured.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

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

  const navigate = useNavigate();

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

      if (payload?.requiresEmailConfirmation) {
        setSuccessMessage('Compte cree. La confirmation email est activee sur Supabase.');
      } else {
        setSuccessMessage('Votre compte est actif. Vous pouvez vous connecter immediatement.');
      }
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
          <p
            className="body-text"
            style={{
              color: 'var(--text-light)',
              marginBottom: 'var(--space-xl)'
            }}
          >
            Vous pouvez vous connecter immediatement.
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
          <span className="label-gold">BIENVENUE</span>
          <h2>Inscription</h2>
          <p>Creez votre compte utilisateur</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

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
