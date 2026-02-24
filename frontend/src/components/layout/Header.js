// C:\Users\USER\bookfete\frontend\src\components\layout\Header.js
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import './Header.css';  // ← L'import est maintenant correct

const Header = () => {
  const navigate = useNavigate();
  const [user, setUser] = React.useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    // Vérifier si l'utilisateur est connecté
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Écouter les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="header">
      <div className="header-container">
        {/* Logo */}
        <Link to="/" className="logo" onClick={() => setMobileMenuOpen(false)}>
          📚 Mémoire Collective
        </Link>

        {/* Navigation principale */}
        <nav className={`nav-menu ${mobileMenuOpen ? 'active' : ''}`}>
          <Link to="/" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Accueil</Link>
          
          {/* Lien vers Comment ça marche */}
          <a href="/how-it-works.html" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Comment ça marche</a>
          
          <Link to="/tarifs" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Tarifs</Link>
          
          {user ? (
            <>
              <Link to="/dashboard" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Tableau de bord</Link>
              <button onClick={handleLogout} className="nav-link logout-btn">
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Connexion</Link>
              <Link to="/register" className="nav-link btn-primary" onClick={() => setMobileMenuOpen(false)}>Inscription</Link>
            </>
          )}
        </nav>

        {/* Menu mobile (hamburger) */}
        <button className="mobile-menu-btn" onClick={toggleMobileMenu}>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>
  );
};

export default Header;