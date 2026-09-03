// C:\Users\USER\bookfete\frontend\src\components\layout\HeaderLuxe.js
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/luxe-theme.css';

const IconGear = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.757.426 1.757 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.757-2.924 1.757-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.757-.426-1.757-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

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
              <Link
                to="/account"
                title="Espace client"
                style={{
                  width: '34px',
                  height: '34px',
                  border: '1px solid var(--mist)',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all var(--transition-fast)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--gold)';
                  e.currentTarget.style.borderColor = 'rgba(184,146,74,0.45)';
                  e.currentTarget.style.backgroundColor = 'rgba(184,146,74,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--ink)';
                  e.currentTarget.style.borderColor = 'var(--mist)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                aria-label="Espace client"
              >
                <IconGear />
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
