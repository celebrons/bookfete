// C:\Users\USER\bookfete\frontend\src\components\auth\Login.js
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
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

      // Vérifier s'il y a des données en attente
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
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem'
    }}>
      <div style={{
        background: 'white',
        padding: '3rem',
        borderRadius: '10px',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '2rem', color: '#333' }}>
          Connexion
        </h1>

        {error && (
          <div style={{
            background: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '5px',
            padding: '0.8rem',
            marginBottom: '1rem',
            color: '#721c24'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 'bold' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 'bold' }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.8rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '1rem',
              background: loading ? '#ccc' : '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '1rem'
            }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
          <Link to="/register" style={{ color: '#764ba2', textDecoration: 'none' }}>
            Pas encore de compte ? S'inscrire
          </Link>
        </div>

        <div style={{
          borderTop: '1px solid #eee',
          paddingTop: '1.5rem',
          marginTop: '1rem'
        }}>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '1rem' }}>
            🔧 Utilisez un compte de test
          </p>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <button
              onClick={() => handleTestLogin('test1@test.com')}
              style={{
                padding: '0.8rem',
                background: '#f8f9fa',
                border: '1px solid #ddd',
                borderRadius: '5px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <strong>test1@test.com</strong> (Organisateur)
            </button>
            <button
              onClick={() => handleTestLogin('test2@test.com')}
              style={{
                padding: '0.8rem',
                background: '#f8f9fa',
                border: '1px solid #ddd',
                borderRadius: '5px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <strong>test2@test.com</strong> (Contributeur)
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#999', marginTop: '1rem' }}>
            Mot de passe : <strong>password123</strong> pour tous
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;