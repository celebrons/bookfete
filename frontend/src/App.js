// C:\Users\USER\bookfete\frontend\src\App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabaseClient';


import './styles/luxe-theme.css';

// Layout
import Layout from './components/layout/Layout';

// Pages - VERSIONS LUXE
import HomePageLuxe from './components/home/HomePageLuxe';
import HowItWorksLuxe from './components/home/HowItWorksLuxe';
import LoginLuxe from './components/auth/LoginLuxe';
import RegisterLuxe from './components/auth/RegisterLuxe';
import CreateBookWizardLuxe from './components/create-book/CreateBookWizardLuxe';
import DashboardGeneralLuxe from './components/dashboard/DashboardGeneralLuxe';
import BookPageLuxe  from './components/book/BookPageLuxe';
import PromptJourneyLabLuxe from './components/admin/PromptJourneyLabLuxe';
import InvitationPageLuxe from './components/contributeur/InvitationPageLuxe';
import TokenContributePageLuxe from './components/contributeur/TokenContributePageLuxe';
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
  console.log('🚀 App démarrée - Version Luxe');
  
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
          <Route path="/create-book" element={<CreateBookWizardLuxe />} />
		  <Route path="/invite/:token" element={<InvitationPageLuxe />} />
		  <Route path="/contribute/:token" element={<TokenContributePageLuxe />} />



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

          <Route path="/admin/prompts" element={
            <ProtectedRoute>
              <PromptJourneyLabLuxe />
            </ProtectedRoute>
          } />

          <Route path="/admin/prompts/journey" element={
            <ProtectedRoute>
              <Navigate to="/admin/prompts" replace />
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
