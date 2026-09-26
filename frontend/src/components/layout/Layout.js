// C:\Users\USER\bookfete\frontend\src\components\layout\Layout.js
import React from 'react';
import { useLocation } from 'react-router-dom';
import HeaderLuxe from './HeaderLuxe';
import FooterLuxe from './FooterLuxe';
import './Layout.css';
import '../../styles/luxe-theme.css';

// L'ATELIER EST UN ESPACE DE CREATION DEDIE, PAS UNE PAGE DU SITE
// (refonte visuelle 2026-09-25, demande utilisateur : "supprimer la
// navigation classique du site... l'utilisateur doit avoir la sensation
// d'etre dans un espace de creation dedie, pas dans le dashboard du site").
//
// L'en-tete global (logo, "Comment ca marche", tableau de bord,
// administration, email, deconnexion) et le pied de page disparaissent sur
// cette seule route : l'atelier a deja sa propre barre, tres discrete
// (voir BookAtelierLuxe.js, .atelier-header), qui la remplace.
//
// Un test de ROUTE, pas un etat React remonte depuis l'atelier : c'est plus
// simple et ca ne risque jamais de rater un demontage (contrairement au
// precedent deja etabli dans ce projet, body.has-fullscreen-viewer, pose et
// retire imperativement par le composant — voir Layout.css — qui convient a
// un calque temporaire mais pas a un changement permanent de mise en page).
// Volontairement etroit : seul /book/:bookId/atelier bascule, pas l'ecran de
// choix du format ni le reste du parcours de creation, qui gardent
// l'orientation du site classique.
const ATELIER_ROUTE = /^\/book\/[^/]+\/atelier(\/|$)/;

const Layout = ({ children }) => {
  const location = useLocation();
  const isAtelier = ATELIER_ROUTE.test(location.pathname);

  if (isAtelier) {
    return (
      <div className="layout layout-immersive">
        <main className="main-content">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="layout">
      <HeaderLuxe />
      <main className="main-content">
        {children}
      </main>
      <FooterLuxe />
    </div>
  );
};

export default Layout;
