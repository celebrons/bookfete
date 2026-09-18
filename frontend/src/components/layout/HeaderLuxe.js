// C:\Users\USER\bookfete\frontend\src\components\layout\HeaderLuxe.js
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { checkIsAdmin } from '../../services/adminApi';
import '../../styles/luxe-theme.css';
import './HeaderLuxe.css';

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

const IconBurger = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    {open ? (
      <>
        <path d="M5 5 L15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M3 6 H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M3 10 H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M3 14 H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    )}
  </svg>
);

// Sur un ecran etroit, la navigation se replie derriere un bouton (voir
// HeaderLuxe.css). Elle etait auparavant entierement en styles inline, donc
// impossible a adapter : elle debordait de 189 px sur un telephone, ce qui
// poussait "Deconnexion" hors de l'ecran et creait un defilement lateral sur
// TOUTES les pages du site (mesure le 2026-09-14).
const HeaderLuxe = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = React.useState(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Largeur au-dela de laquelle la navigation tient sur une ligne — meme
  // seuil que la regle @media, a garder synchronise. En dessous, le menu est
  // masque tant qu'on ne l'ouvre pas ; au-dessus il doit rester visible en
  // permanence, sans dependre de l'etat d'ouverture.
  const [compact, setCompact] = React.useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches
  ));

  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const apply = (event) => {
      setCompact(event.matches);
      if (!event.matches) setMenuOpen(false); // repasse en large : plus de menu ouvert qui traine
    };
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Le serveur seul sait qui est administrateur (ADMIN_EMAILS n'existe pas
  // cote client, et c'est voulu). Recalcule a chaque changement de session :
  // se deconnecter doit faire disparaitre le lien immediatement.
  React.useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let cancelled = false;
    checkIsAdmin().then((value) => { if (!cancelled) setIsAdmin(value); });
    return () => { cancelled = true; };
  }, [user]);

  // Naviguer referme le menu : sinon il resterait ouvert par-dessus la page
  // qu'on vient de demander.
  React.useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <header className="site-header">
      <div className="container-luxe site-header-inner">
        <Link to="/" className="site-header-logo">
          Célébrons<span className="site-header-logo-dot">.</span>
        </Link>

        <button
          type="button"
          className="site-header-burger"
          onClick={() => setMenuOpen((previous) => !previous)}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          <IconBurger open={menuOpen} />
        </button>

        {/* `hidden` seulement en mode compact : en large, la navigation est
            toujours la, quel que soit l'etat du menu. */}
        <nav id="site-nav" className="site-nav" hidden={compact && !menuOpen}>
          <Link to="/how-it-works" className="site-nav-link">
            Comment ça marche
          </Link>

          {user ? (
            <>
              <Link to="/dashboard" className="site-nav-link">
                Tableau de bord
              </Link>
              {/* Lien vers l'espace d'administration, affiche UNIQUEMENT aux
                  administrateurs (le serveur repond oui/non, voir
                  adminApi.checkIsAdmin). Ce n'est pas une protection — chaque
                  route admin est gardee independamment cote serveur — juste
                  de quoi ne pas avoir a retenir l'URL. */}
              {isAdmin && (
                <Link to="/admin" className="site-nav-link is-admin" title="Espace d'administration">
                  Administration
                </Link>
              )}
              <Link to="/account" className="site-nav-icon" title="Espace client" aria-label="Espace client">
                <IconGear />
                <span className="site-nav-icon-label">Espace client</span>
              </Link>
              {/* QUI est connecte. Sans cette indication, rien ne
                  distinguait deux comptes a l'ecran — genant des qu'on
                  teste avec plusieurs adresses, et inquietant pour un
                  client qui ne sait pas sous quelle identite il commande.

                  Une session ANONYME n'a pas d'email : l'application
                  autorise a composer un livre avant de creer un compte
                  (voir services/anonymousSession.js). On le dit alors
                  franchement plutot que de laisser un vide, parce que
                  c'est justement l'etat ou il faut penser a s'inscrire. */}
              <span
                className={`site-nav-user${user.is_anonymous ? ' is-anonyme' : ''}`}
                title={user.email || 'Vous composez sans compte : creez-en un pour retrouver votre livre'}
              >
                {user.email || 'Sans compte'}
              </span>
              <button onClick={handleLogout} className="btn btn-outline">
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline">
                Connexion
              </Link>
              <Link to="/register" className="btn btn-primary">
                Créer un livre
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default HeaderLuxe;
