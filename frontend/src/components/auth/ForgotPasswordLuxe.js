import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('auth');
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
          <span className="label-gold">{t('forgotPassword.sentEyebrow')}</span>
          <h2 style={{ marginBottom: 'var(--space-md)' }}>{t('forgotPassword.sentTitle')}</h2>
          <p className="body-text" style={{ color: 'var(--text-light)', marginBottom: 'var(--space-xl)' }}>
            {t('forgotPassword.sentBody', { email })}
          </p>
          <Link to="/login" className="btn btn-primary" style={{ padding: '14px 40px' }}>
            {t('forgotPassword.sentButton')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="label-gold">{t('forgotPassword.eyebrow')}</span>
          <h2>{t('forgotPassword.title')}</h2>
          <p>{t('forgotPassword.subtitle')}</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">{t('forgotPassword.emailLabel')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('login.emailPlaceholder')}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <button type="submit" className="btn btn-primary auth-button" disabled={loading}>
            {loading ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login">{t('forgotPassword.backToLogin')}</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordLuxe;
