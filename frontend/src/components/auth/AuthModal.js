import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth';
import './Auth.css';

const AuthModal = ({ isOpen, onClose, mode: initialMode = 'login' }) => {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'login') {
        const result = await authService.signIn(email, password);
        if (result.success) {
          onClose();
          navigate('/dashboard');
        } else {
          setError(result.error);
        }
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('Les mots de passe ne correspondent pas');
          setLoading(false);
          return;
        }

        const result = await authService.signUp(email, password, fullName);
        if (result.success) {
          setSuccess('Inscription réussie ! Vous pouvez maintenant vous connecter.');
          setTimeout(() => {
            setMode('login');
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setFullName('');
          }, 2000);
        } else {
          setError(result.error);
        }
      } else if (mode === 'reset') {
        const result = await authService.resetPassword(email);
        if (result.success) {
          setSuccess('Un email de réinitialisation vous a été envoyé.');
          setTimeout(() => {
            setMode('login');
            setEmail('');
          }, 3000);
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <div className="auth-modal-header">
          <h2>
            {mode === 'login' && 'Connexion'}
            {mode === 'register' && 'Inscription'}
            {mode === 'reset' && 'Réinitialisation'}
          </h2>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <form onSubmit={handleSubmit} className="auth-modal-form">
          {mode === 'register' && (
            <div className="form-group">
              <label>Nom complet</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jean Dupont"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
            />
          </div>

          {mode !== 'reset' && (
            <div className="form-group">
              <label>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength="6"
              />
            </div>
          )}

          {mode === 'register' && (
            <div className="form-group">
              <label>Confirmer le mot de passe</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="auth-button"
          >
            {loading ? 'Chargement...' : 
              mode === 'login' ? 'Se connecter' :
              mode === 'register' ? "S'inscrire" :
              'Envoyer'}
          </button>
        </form>

        <div className="auth-modal-footer">
          {mode === 'login' && (
            <>
              <button 
                onClick={() => setMode('reset')}
                className="auth-link-button"
              >
                Mot de passe oublié ?
              </button>
              <p>
                Pas encore de compte ?{' '}
                <button 
                  onClick={() => setMode('register')}
                  className="auth-link-button"
                >
                  S'inscrire
                </button>
              </p>
            </>
          )}

          {mode === 'register' && (
            <p>
              Déjà un compte ?{' '}
              <button 
                onClick={() => setMode('login')}
                className="auth-link-button"
              >
                Se connecter
              </button>
            </p>
          )}

          {mode === 'reset' && (
            <p>
              Retour à la{' '}
              <button 
                onClick={() => setMode('login')}
                className="auth-link-button"
              >
                connexion
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;