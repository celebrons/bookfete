// C:\Users\USER\bookfete\frontend\src\components\layout\HeaderLuxe.js
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';

const HeaderLuxe = () => {
  const navigate = useNavigate();
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <header style={{
      backgroundColor: 'var(--white)',
      borderBottom: 'var(--border-fine)',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <div className="container-luxe" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 'var(--space-md) var(--space-xl)'
      }}>
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{
            fontFamily: 'var(--font-primary)',
            fontSize: '24px',
            fontWeight: '700',
            color: 'var(--ink)',
            letterSpacing: '-0.02em'
          }}>
            Célébrons<span style={{ color: 'var(--gold)' }}>.</span>
          </span>
        </Link>

        {/* Navigation - liens sans soulignement */}
        <nav style={{
          display: 'flex',
          gap: 'var(--space-xl)',
          alignItems: 'center'
        }}>
          <Link 
            to="/how-it-works" 
            style={{ 
              textDecoration: 'none',
              color: 'var(--ink)',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'color var(--transition-fast)'
            }}
            onMouseEnter={(e) => e.target.style.color = 'var(--gold)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--ink)'}
          >
            Comment ça marche
          </Link>
          
          {user ? (
            <>
              <Link 
                to="/dashboard" 
                style={{ 
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'color var(--transition-fast)'
                }}
                onMouseEnter={(e) => e.target.style.color = 'var(--gold)'}
                onMouseLeave={(e) => e.target.style.color = 'var(--ink)'}
              >
                Tableau de bord
              </Link>
              <button
                onClick={handleLogout}
                className="btn btn-outline"
                style={{ padding: '8px 24px', cursor: 'pointer' }}
              >
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <button className="btn btn-outline" style={{ padding: '8px 24px', cursor: 'pointer' }}>
                  Connexion
                </button>
              </Link>
              <Link to="/register" style={{ textDecoration: 'none' }}>
                <button className="btn btn-primary" style={{ padding: '8px 24px', cursor: 'pointer' }}>
                  Créer un livre
                </button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default HeaderLuxe;