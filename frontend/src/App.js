// C:\Users\USER\bookfete\frontend\src\App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabaseClient';
import { wakeUpBackend } from './services/httpClient';
import { linkAnonymousBooksAfterLogin } from './services/anonymousSession';


import './styles/luxe-theme.css';
import './styles/wizard.css';

// Layout
import Layout from './components/layout/Layout';

// Pages - VERSIONS LUXE
import HomePageLuxe from './components/home/HomePageLuxe';
import HowItWorksLuxe from './components/home/HowItWorksLuxe';
import LoginLuxe from './components/auth/LoginLuxe';
import RegisterLuxe from './components/auth/RegisterLuxe';
import CreateBookSansIA from './components/create-book/CreateBookSansIA';
import DashboardGeneralLuxe from './components/dashboard/DashboardGeneralLuxe';
import BookPageLuxe  from './components/book/BookPageLuxe';
import BookComposeLuxe from './components/book/BookComposeLuxe';
import BookAtelierLuxe from './components/book/atelier/BookAtelierLuxe';
import BookPreviewFinalLuxe from './components/book/BookPreviewFinalLuxe';
import InvitationPageLuxe from './components/contributeur/InvitationPageLuxe';
import TokenContributePageLuxe from './components/contributeur/TokenContributePageLuxe';
import BookShareJoinLuxe from './components/contributeur/BookShareJoinLuxe';
import CollectiveParticipateLuxe from './components/contributeur/CollectiveParticipateLuxe';
import BookCollectiveLuxe from './components/book/collective/BookCollectiveLuxe';
import AccountSpaceLuxe from './components/account/AccountSpaceLuxe';
import BookCheckoutLuxe from './components/orders/BookCheckoutLuxe';
import OrdersLuxe from './components/orders/OrdersLuxe';





import ScrollToTop from './components/common/ScrollToTop';

// ============================================
// COMPOSANT DE ROUTE PROTÉGÉE
// ============================================
const ProtectedRoute = ({ children }) => {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontFamily: 'var(--font-primary)',
      color: 'var(--ink)'
    }}>
      Chargement...
    </div>
  );
  
  return user ? children : <Navigate to="/login" />;
};

// ============================================
// COMPOSANT PRINCIPAL
// ============================================
function App() {
  // Reveil opportuniste du backend des le chargement de l'application :
  // sur Render, une instance gratuite s'endort apres quelques minutes et
  // met 30 a 60s a repartir — sans ce ping, c'est la premiere vraie
  // requete de l'utilisateur qui paie ce reveil (retour utilisateur :
  // "Le serveur met trop de temps a repondre"). Non bloquant, erreurs
  // ignorees (voir services/httpClient.js).
  React.useEffect(() => {
    wakeUpBackend();
    // Retour d'une connexion OAuth : le composant de connexion n'est plus
    // monte, c'est donc ici qu'on rattache les livres commences en session
    // anonyme au compte qui vient de se connecter. Sans jeton anonyme en
    // attente, l'appel ne fait rien (voir services/anonymousSession.js).
    linkAnonymousBooksAfterLogin();
  }, []);

  return (
    <Router>
      <ScrollToTop />
      <Layout>
        <Routes>
  
          {/* ============================================
              PAGES PUBLIQUES
          ============================================ */}
          <Route path="/" element={<HomePageLuxe />} />
          <Route path="/how-it-works" element={<HowItWorksLuxe />} />
          <Route path="/login" element={<LoginLuxe />} />
          <Route path="/register" element={<RegisterLuxe />} />
          <Route path="/create-book" element={<CreateBookSansIA />} />
		  <Route path="/invite/:token" element={<InvitationPageLuxe />} />
		  <Route path="/contribute/:token" element={<TokenContributePageLuxe />} />
		  <Route path="/participer/:token" element={<BookShareJoinLuxe />} />
		  <Route path="/collectif/:token" element={<CollectiveParticipateLuxe />} />



          {/* ============================================
              PAGES PROTÉGÉES
          ============================================ */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardGeneralLuxe />
            </ProtectedRoute>
          } />
          
          <Route path="/book/:bookId" element={
            <ProtectedRoute>
              <BookPageLuxe  />
            </ProtectedRoute>
          } />

          <Route path="/book/:bookId/composer" element={
            <ProtectedRoute>
              <BookComposeLuxe />
            </ProtectedRoute>
          } />

          <Route path="/book/:bookId/atelier" element={
            <ProtectedRoute>
              <BookAtelierLuxe />
            </ProtectedRoute>
          } />

          <Route path="/book/:bookId/apercu" element={
            <ProtectedRoute>
              <BookPreviewFinalLuxe />
            </ProtectedRoute>
          } />

          <Route path="/book/:bookId/collectif" element={
            <ProtectedRoute>
              <BookCollectiveLuxe />
            </ProtectedRoute>
          } />

          <Route path="/book/:bookId/checkout" element={
            <ProtectedRoute>
              <BookCheckoutLuxe />
            </ProtectedRoute>
          } />

          <Route path="/orders" element={
            <ProtectedRoute>
              <OrdersLuxe />
            </ProtectedRoute>
          } />

          <Route path="/account" element={
            <ProtectedRoute>
              <AccountSpaceLuxe />
            </ProtectedRoute>
          } />

          {/* ============================================
              REDIRECTION 404
          ============================================ */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
