// C:\Users\USER\bookfete\frontend\src\App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabaseClient';
import ScrollToTop from './components/common/ScrollToTop'; // ← AJOUTER

// Layout
import Layout from './components/layout/Layout';

// Pages
import HomePageLuxe from './components/home/HomePageLuxe';
import HowItWorksLuxe from './components/home/HowItWorksLuxe';
import LoginLuxe from './components/auth/LoginLuxe';
import RegisterLuxe from './components/auth/RegisterLuxe';
import InvitationPage from './components/contributeur/InvitationPage';
import CreateBookWizardLuxe from './components/create-book/CreateBookWizardLuxe';
import DashboardGeneral from './components/dashboard/DashboardGeneral';
import BookPage from './components/book/BookPage';

// Composant de route protégée
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

function App() {
  console.log('🚀 App démarrée - Version Luxe');
  
  return (
    <Router>
      <ScrollToTop /> {/* ← AJOUTER ICI, avant Layout */}
      <Layout>
        <Routes>
          {/* ============================================
              PAGES PUBLIQUES
          ============================================ */}
          <Route path="/" element={<HomePageLuxe />} />
          <Route path="/how-it-works" element={<HowItWorksLuxe />} />
          <Route path="/login" element={<LoginLuxe />} />
          <Route path="/register" element={<RegisterLuxe />} />
          <Route path="/invite/:token" element={<InvitationPage />} />
          <Route path="/create-book" element={<CreateBookWizardLuxe />} />


          {/* ============================================
              PAGES PROTÉGÉES
          ============================================ */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardGeneral />
            </ProtectedRoute>
          } />
          
          <Route path="/book/:bookId" element={
            <ProtectedRoute>
              <BookPage />
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