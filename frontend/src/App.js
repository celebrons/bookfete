// C:\Users\USER\bookfete\frontend\src\App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabaseClient';

// Layout
import Layout from './components/layout/Layout';

// Pages publiques
import HomePage from './components/home/HomePage';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import EventPages from './components/home/EventPages';
import PublicContributePage from './components/contributeur/PublicContributePage';
import TokenContributePage from './components/contributeur/TokenContributePage';

// Pages organisateur
import DashboardGeneral from './components/dashboard/DashboardGeneral';
import CreateBookWizard from './components/create-book/CreateBookWizard';
import BookPage from './components/book/BookPage';
import ChapterPage from './components/book/ChapterPage';

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

  if (loading) return <div className="loading">Chargement...</div>;
  
  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* ============================================
            PAGES PUBLIQUES
        ============================================ */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/evenement/:eventType" element={<EventPages />} />
        <Route path="/contribute/:bookId/:chapterId" element={<PublicContributePage />} />
        <Route path="/invite/:token" element={<TokenContributePage />} />

        {/* ============================================
            PAGES PROTÉGÉES (Nouvelle structure Livres)
        ============================================ */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardGeneral />
          </ProtectedRoute>
        } />
        
        <Route path="/create-book" element={
          <ProtectedRoute>
            <CreateBookWizard />
          </ProtectedRoute>
        } />
        
        <Route path="/book/:bookId" element={
          <ProtectedRoute>
            <BookPage />
          </ProtectedRoute>
        } />
        
        <Route path="/book/:bookId/chapter/:chapterId" element={
          <ProtectedRoute>
            <ChapterPage />
          </ProtectedRoute>
        } />

        {/* ============================================
            PAGES PROTÉGÉES (Ancienne structure - conservée pour migration)
        ============================================ */}
        {/* 
        <Route path="/project/:projectId" element={<ProjectDetails />} />
        <Route path="/project/:projectId/edit" element={<EditProject />} />
        <Route path="/project/:projectId/invite" element={<InviteContributors />} />
        <Route path="/project/:projectId/review" element={<ReviewContributions />} />
        <Route path="/project/:projectId/choose-maquette" element={<ChooseMaquette />} />
        <Route path="/project/:projectId/payment" element={<OrderPayment />} />
        <Route path="/order-confirmation/:orderId" element={<OrderConfirmation />} />
        */}

        {/* Route par défaut - redirection */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;