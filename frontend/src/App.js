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

// Pages organisateur
import Dashboard from './components/organisateur/Dashboard';
import CreateProject from './components/organisateur/CreateProject';
import ProjectDetails from './components/organisateur/ProjectDetails';
import EditProject from './components/organisateur/EditProject';
import InviteContributors from './components/organisateur/InviteContributors';
import ReviewContributions from './components/organisateur/ReviewContributions';
import ChooseMaquette from './components/organisateur/ChooseMaquette';
import OrderPayment from './components/organisateur/OrderPayment';
import OrderConfirmation from './components/organisateur/OrderConfirmation';

// Pages contributeur
import ContributePage from './components/contributeur/ContributePage';

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
        {/* Pages publiques */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/contribute/:token" element={<ContributePage />} />

        {/* Pages protégées */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/create-project" element={
          <ProtectedRoute>
            <CreateProject />
          </ProtectedRoute>
        } />
        
        {/* Routes des projets */}
        <Route path="/project/:projectId" element={
          <ProtectedRoute>
            <ProjectDetails />
          </ProtectedRoute>
        } />
        
        <Route path="/project/:projectId/edit" element={
          <ProtectedRoute>
            <EditProject />
          </ProtectedRoute>
        } />
        
        <Route path="/project/:projectId/invite" element={
          <ProtectedRoute>
            <InviteContributors />
          </ProtectedRoute>
        } />
        
        <Route path="/project/:projectId/review" element={
          <ProtectedRoute>
            <ReviewContributions />
          </ProtectedRoute>
        } />
        
        <Route path="/project/:projectId/choose-maquette" element={
          <ProtectedRoute>
            <ChooseMaquette />
          </ProtectedRoute>
        } />
        
        <Route path="/project/:projectId/payment" element={
          <ProtectedRoute>
            <OrderPayment />
          </ProtectedRoute>
        } />
        
        <Route path="/order-confirmation/:orderId" element={
          <ProtectedRoute>
            <OrderConfirmation />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;