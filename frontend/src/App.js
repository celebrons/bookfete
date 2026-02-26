// C:\Users\USER\bookfete\frontend\src\App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabaseClient';

// Layout
import Layout from './components/layout/Layout';

// Pages
import HomePageLuxe from './components/home/HomePageLuxe';
import HowItWorksPage from './components/home/HowItWorksPage';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import InvitationPage from './components/contributeur/InvitationPage';
import CreateBookWizard from './components/create-book/CreateBookWizard';
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
      <Layout>
        <Routes>
          {/* ============================================
              PAGES PUBLIQUES
          ============================================ */}
          <Route path="/" element={<HomePageLuxe />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/invite/:token" element={<InvitationPage />} />
          <Route path="/create-book" element={<CreateBookWizard />} />

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