import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import './Layout.css';

const Header = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
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
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          📚 Mémoire Collective
        </Link>
        
        <nav className="nav-menu">
          <Link to="/" className="nav-link">Accueil</Link>
          <Link to="/how-it-works" className="nav-link">Comment ça marche</Link>
          <Link to="/pricing" className="nav-link">Tarifs</Link>
          
          {user ? (
            <div className="user-menu">
              <Link to="/dashboard" className="nav-link">Tableau de bord</Link>
              <button onClick={handleLogout} className="btn-logout">
                Déconnexion
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <Link to="/login" className="btn-login">Connexion</Link>
              <Link to="/register" className="btn-register">Inscription</Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;