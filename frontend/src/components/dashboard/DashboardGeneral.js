// C:\Users\USER\bookfete\frontend\src\components\dashboard\DashboardGeneral.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import BookList from './BookList';
import StatsCards from './StatsCards';
import RecentActivity from './RecentActivity';
import Loading from '../common/Loading';

const DashboardGeneral = () => {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    totalBooks: 0,
    enCours: 0,
    termines: 0,
    totalChapitres: 0,
    totalContributions: 0,
    totalInvites: 0,
    totalPhotos: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        navigate('/login');
        return;
      }

      setUser(session.user);
      fetchData(session.user.id);
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      navigate('/login');
    }
  };

  const fetchData = async (userId) => {
    try {
      setLoading(true);
      
      // Récupérer les livres avec leurs stats
      const { data: booksData, error: booksError } = await supabase
        .from('books')
        .select(`
          *,
          chapters:chapters(
            id,
            contributions:contributions(count)
          )
        `)
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (booksError) throw booksError;
      setBooks(booksData || []);

      // Calculer les statistiques globales
      let totalChapitres = 0;
      let totalContributions = 0;
      let totalPhotos = 0;

      booksData?.forEach(book => {
        totalChapitres += book.chapters?.length || 0;
        
        book.chapters?.forEach(chapter => {
          totalContributions += chapter.contributions?.[0]?.count || 0;
        });
      });

      setStats({
        totalBooks: booksData?.length || 0,
        enCours: booksData?.filter(b => b.statut === 'en_cours').length || 0,
        termines: booksData?.filter(b => b.statut === 'termine').length || 0,
        totalChapitres,
        totalContributions,
        totalInvites: 0, // À calculer avec les invitations
        totalPhotos
      });

      // Récupérer les activités récentes
      const { data: recent } = await supabase
        .from('contributions')
        .select(`
          *,
          chapter:chapters(
            title,
            book:books(title)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      setRecentActivity(recent || []);

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) return <Loading message="Chargement de votre bibliothèque..." />;

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem' 
      }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem' }}>📚 Ma Bibliothèque</h1>
          <p style={{ margin: 0, color: '#666' }}>
            Bonjour {user?.user_metadata?.full_name || user?.email} 👋
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => navigate('/create-book')} 
            style={{
              padding: '0.8rem 2rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            + Nouveau livre
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.8rem 2rem',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Déconnexion
          </button>
        </div>
      </div>

      {/* Cartes de statistiques */}
      <StatsCards stats={stats} />

      {/* Section Livres en cours */}
      {stats.enCours > 0 && (
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ marginBottom: '1.5rem' }}>📖 En cours d'écriture</h2>
          <BookList books={books.filter(b => b.statut === 'en_cours')} type="en_cours" />
        </div>
      )}

      {/* Section Livres terminés */}
      {stats.termines > 0 && (
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ marginBottom: '1.5rem' }}>✅ Livres terminés</h2>
          <BookList books={books.filter(b => b.statut === 'termine')} type="termine" />
        </div>
      )}

      {/* Activité récente */}
      <RecentActivity activities={recentActivity} />

      {books.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '4rem',
          background: 'white',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>📚</span>
          <h2 style={{ marginBottom: '1rem' }}>Bienvenue dans Mémoire Collective !</h2>
          <p style={{ color: '#666', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem' }}>
            Créez votre premier livre pour commencer à collecter les souvenirs et témoignages de vos proches.
          </p>
          <button
            onClick={() => navigate('/create-book')}
            style={{
              padding: '1rem 3rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold'
            }}
          >
            Créer mon premier livre
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardGeneral;