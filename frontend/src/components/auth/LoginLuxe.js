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

      const pendingData = localStorage.getItem('pendingBookData');
      const pendingChapters = localStorage.getItem('pendingChapters');

      if (pendingData) {
        const bookData = JSON.parse(pendingData);
        const chapters = pendingChapters ? JSON.parse(pendingChapters) : [];
        await createBookAfterLogin(bookData, chapters);
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

  const createBookAfterLogin = async (bookData, chapters) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecte');

      const { data: book, error: bookError } = await supabase
        .from('books')
        .insert([{
          owner_id: user.id,
          title: bookData.title,
          event_type: bookData.event_type,
          recipient_name: bookData.recipient_name,
          recipient_age: bookData.recipient_age,
          recipient_gender: bookData.recipient_gender,
          finition: bookData.finition,
          papier: bookData.papier,
          style_narratif: bookData.style_narratif,
          pages: bookData.pages,
          statut: 'en_cours'
        }])
        .select()
        .single();

      if (bookError) throw bookError;

      if (chapters && chapters.length > 0) {
        const chaptersToInsert = chapters.map((chapter, index) => ({
          book_id: book.id,
          title: chapter.title,
          description: chapter.description || `Chapitre ${index + 1}`,
          order_index: index,
          questions_ia: [
            `Quel est votre plus beau souvenir lie a "${chapter.title}" ?`,
            'Que retenez-vous de ce moment ?',
            'Quelle emotion cela evoque-t-il ?',
            'Un detail qui vous a marque ?'
          ]
        }));

        const { error: chaptersError } = await supabase
          .from('chapters')
          .insert(chaptersToInsert);

        if (chaptersError) throw chaptersError;
      }

      await supabase
        .from('books')
        .update({
          cover_config: {
            title: bookData.title,
            template: 'classic',
            color: '#8B4513',
            font: 'Playfair Display'
          },
          back_cover_config: {
            template: 'classic',
            show_contributors: true,
            color: '#f5f5f5'
          }
        })
        .eq('id', book.id);

      localStorage.removeItem('pendingBookData');
      localStorage.removeItem('pendingChapters');
      localStorage.removeItem('returnTo');

      navigate(`/book/${book.id}`);
    } catch (createError) {
      alert(`Erreur lors de la creation du livre: ${createError.message}`);
      navigate('/dashboard');
    }
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
