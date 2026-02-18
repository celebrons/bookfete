// C:\Users\USER\bookfete\frontend\src\components\auth\Login.js
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import './Auth.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, design, style } = location.state || {};

  // 📋 COMPTES DE TEST
  const testAccounts = [
    { email: 'test1@test.com', password: 'password123', name: 'Test 1' },
    { email: 'test2@test.com', password: 'password123', name: 'Test 2' },
    { email: 'demo@test.com', password: 'password123', name: 'Demo User' },
    { email: 'jean.dupont@test.com', password: 'password123', name: 'Jean Dupont' },
    { email: 'marie.martin@test.com', password: 'password123', name: 'Marie Martin' }
  ];

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log('🔐 Tentative de connexion pour:', email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      
      console.log('✅ Connexion réussie:', data.user?.email);
      
      // Rediriger vers create-project avec les données de la thématique
      navigate('/create-project', { 
        state: { theme, design, style }
      });
      
    } catch (error) {
      console.error('❌ Erreur connexion:', error);
      
      if (error.message.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect. Utilisez les comptes de test ci-dessous.');
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const fillTestAccount = (account) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Connexion</h2>
        
        {/* Résumé des choix (si disponibles) */}
        {theme && (
          <div style={{
            background: '#f3e8ff',
            padding: '0.8rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            border: '1px solid #764ba2',
            fontSize: '0.9rem',
            textAlign: 'center'
          }}>
            <p style={{ margin: 0 }}>
              <strong>{theme.icon} {theme.title}</strong> · Design: {design?.name} · Style: {style?.name}
            </p>
          </div>
        )}
        
        {error && (
          <div className="auth-error">
            <p>❌ {error}</p>
          </div>
        )}

        {/* Message d'information sur les comptes de test */}
        <div style={{
          background: '#e8f4fd',
          color: '#0c5460',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #bee5eb',
          fontSize: '0.95rem'
        }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>
            🔧 Utilisez un compte de test
          </p>
          <p style={{ margin: 0 }}>
            Cliquez sur un compte ci-dessous pour remplir automatiquement les champs.
          </p>
        </div>

        {/* Liste des comptes de test */}
        <div style={{
          background: '#f8f9fa',
          borderRadius: '10px',
          padding: '1.5rem',
          marginBottom: '2rem',
          border: '1px solid #dee2e6'
        }}>
          <p style={{ 
            margin: '0 0 1rem 0', 
            fontWeight: 'bold',
            color: '#333',
            fontSize: '1rem'
          }}>
            🧪 Comptes de test disponibles :
          </p>
          <div style={{
            display: 'grid',
            gap: '0.75rem'
          }}>
            {testAccounts.map((account, index) => (
              <button
                key={index}
                onClick={() => fillTestAccount(account)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.8rem 1rem',
                  background: 'white',
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  width: '100%',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3e8ff';
                  e.currentTarget.style.borderColor = '#764ba2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#dee2e6';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>
                    {account.email === 'test1@test.com' && '👤'}
                    {account.email === 'test2@test.com' && '👥'}
                    {account.email === 'demo@test.com' && '👨‍💼'}
                    {account.email === 'jean.dupont@test.com' && '👨'}
                    {account.email === 'marie.martin@test.com' && '👩'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#333' }}>
                      {account.name}
                    </div>
                    <div style={{
                      fontSize: '0.8rem',
                      color: '#666'
                    }}>
                      {account.email}
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize: '0.8rem',
                  color: '#764ba2',
                  background: '#f0f0f0',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px'
                }}>
                  Remplir
                </span>
              </button>
            ))}
          </div>
          <p style={{
            margin: '1rem 0 0 0',
            fontSize: '0.85rem',
            color: '#666',
            fontStyle: 'italic',
            textAlign: 'center'
          }}>
            🔑 Mot de passe : <strong>password123</strong> pour tous les comptes
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test1@test.com"
              required
              disabled={loading}
            />
          </div>
          
          <div className="form-group password-field">
            <label>Mot de passe</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password123"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </div>

          <div className="form-options">
            <label className="checkbox-label">
              <input type="checkbox" /> Se souvenir de moi
            </label>
            <a href="/forgot-password" className="forgot-link">
              Mot de passe oublié ?
            </a>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="auth-button"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="auth-link">
          Pas encore de compte ? 
          <a href="/register"> S'inscrire</a>
        </p>
      </div>
    </div>
  );
};

export default Login;