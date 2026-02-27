// C:\Users\USER\bookfete\frontend\src\components\auth\RegisterLuxe.js
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';
import './AuthLuxe.css';

const RegisterLuxe = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // États pour afficher/masquer les mots de passe
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setLoading(false);
      return;
    }

    try {
      console.log('📝 Tentative d\'inscription pour:', email);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;
      
      console.log('✅ Inscription réussie:', data);

      if (data.user) {
        setTimeout(() => {
          setSuccess(true);
        }, 1000);
      } else {
        setSuccess(true);
      }

    } catch (error) {
      console.error('❌ Erreur inscription:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '64px',
            marginBottom: 'var(--space-lg)',
            animation: 'fadeIn 0.6s ease'
          }}>
            ✨
          </div>
          <span className="label-gold">FÉLICITATIONS</span>
          <h2 style={{ marginBottom: 'var(--space-md)' }}>Inscription réussie !</h2>
          <p className="body-text" style={{ color: 'var(--text-light)' }}>
            Votre compte a été créé avec succès.
          </p>
          <p className="body-text" style={{ 
            color: 'var(--text-light)',
            marginBottom: 'var(--space-xl)' 
          }}>
            Vous pouvez maintenant vous connecter.
          </p>
          <button 
            onClick={() => navigate('/login')}
            className="btn btn-primary"
            style={{ padding: '14px 40px' }}
          >
            Aller à la connexion
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
          <p>Créez votre compte gratuitement</p>
        </div>

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="auth-form">
          <div className="auth-field">
            <label htmlFor="fullName">Nom complet</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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
              onChange={(e) => setEmail(e.target.value)}
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
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength="6"
                disabled={loading}
                style={{ paddingRight: '45px' }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
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
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
            <small style={{
              fontSize: '11px',
              color: 'var(--text-light)',
              marginTop: '4px',
              display: 'block'
            }}>
              Minimum 6 caractères
            </small>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
                style={{ paddingRight: '45px' }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
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
          Déjà un compte ?
          <Link to="/login">
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterLuxe;