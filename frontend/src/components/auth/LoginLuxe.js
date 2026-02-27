// C:\Users\USER\bookfete\frontend\src\components\auth\LoginLuxe.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';
import './AuthLuxe.css';

const LoginLuxe = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Vérifier s'il y a des données en attente (logique conservée)
      const pendingData = localStorage.getItem('pendingBookData');
      const pendingChapters = localStorage.getItem('pendingChapters');
      
      if (pendingData) {
        // Récupérer les données
        const bookData = JSON.parse(pendingData);
        const chapters = pendingChapters ? JSON.parse(pendingChapters) : [];
        
        // Lancer directement la création
        await createBookAfterLogin(bookData, chapters);
      } else {
        // Sinon, aller au dashboard
        navigate('/dashboard');
      }
      
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const createBookAfterLogin = async (bookData, chapters) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Utilisateur non connecté');

      console.log('📦 Création du livre avec les données:', bookData);
      console.log('📦 Chapitres à créer:', chapters);

      // 1. Créer le livre
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

      console.log('✅ Livre créé avec ID:', book.id);

      // 2. Créer les chapitres
      if (chapters && chapters.length > 0) {
        const chaptersToInsert = chapters.map((ch, index) => ({
          book_id: book.id,
          title: ch.title,
          description: ch.description || `Chapitre ${index + 1}`,
          order_index: index,
          questions_ia: [
            `Quel est votre plus beau souvenir lié à "${ch.title}" ?`,
            `Que retenez-vous de ce moment ?`,
            `Quelle émotion cela évoque-t-il ?`,
            `Un détail qui vous a marqué ?`
          ]
        }));

        const { error: chaptersError } = await supabase
          .from('chapters')
          .insert(chaptersToInsert);

        if (chaptersError) throw chaptersError;
      }

      console.log(`✅ ${chapters.length} chapitres créés`);

      // 3. Mettre à jour avec les configs
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

      // Nettoyer le localStorage
      localStorage.removeItem('pendingBookData');
      localStorage.removeItem('pendingChapters');
      localStorage.removeItem('returnTo');

      console.log('🎉 Livre créé avec succès, redirection vers:', `/book/${book.id}`);
      
      // Rediriger vers le livre créé
      navigate(`/book/${book.id}`);

    } catch (error) {
      console.error('❌ Erreur création:', error);
      alert(`Erreur lors de la création du livre: ${error.message}`);
      navigate('/dashboard'); // En cas d'erreur, aller au dashboard
    }
  };

  const handleTestLogin = (testEmail) => {
    setEmail(testEmail);
    setPassword('password123');
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="label-gold">BIENVENUE</span>
          <h2>Connexion</h2>
          <p>Accédez à votre espace personnel</p>
        </div>

        {error && (
          <div className="auth-error">
            {error === 'Invalid login credentials' 
              ? 'Email ou mot de passe incorrect' 
              : error}
          </div>
        )}

        <form onSubmit={handleLogin} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="auth-options">
            <label className="remember-me">
              <input type="checkbox" />
              <span>Se souvenir de moi</span>
            </label>
            <Link to="/forgot-password" className="forgot-link">
              Mot de passe oublié ?
            </Link>
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-button"
            disabled={loading}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div className="auth-divider">
          <span>OU</span>
        </div>

        <div className="auth-footer">
          Pas encore de compte ?
          <Link to="/register">
            Créer un compte
          </Link>
        </div>

        {/* Section de test - conservée mais stylisée */}
        <div style={{
          marginTop: 'var(--space-xl)',
          paddingTop: 'var(--space-lg)',
          borderTop: 'var(--border-fine)'
        }}>
          <p style={{
            textAlign: 'center',
            color: 'var(--text-light)',
            fontSize: '12px',
            marginBottom: 'var(--space-md)'
          }}>
            🔧 Comptes de test
          </p>
          <div style={{
            display: 'grid',
            gap: 'var(--space-sm)'
          }}>
            <button
              onClick={() => handleTestLogin('test1@test.com')}
              className="btn btn-outline"
              style={{ 
                width: '100%',
                justifyContent: 'space-between',
                padding: '12px 16px'
              }}
            >
              <span>test1@test.com</span>
              <span style={{ opacity: 0.7 }}>Organisateur →</span>
            </button>
            <button
              onClick={() => handleTestLogin('test2@test.com')}
              className="btn btn-outline"
              style={{ 
                width: '100%',
                justifyContent: 'space-between',
                padding: '12px 16px'
              }}
            >
              <span>test2@test.com</span>
              <span style={{ opacity: 0.7 }}>Contributeur →</span>
            </button>
          </div>
          <p style={{
            textAlign: 'center',
            fontSize: '11px',
            color: 'var(--text-light)',
            marginTop: 'var(--space-sm)'
          }}>
            Mot de passe : <strong>password123</strong>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginLuxe;