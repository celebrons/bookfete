// C:\Users\USER\bookfete\frontend\src\components\organisateur\Dashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import ProjectList from './ProjectList';
import Loading from '../common/Loading';
import './Organisateur.css';

const Dashboard = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    totalContributions: 0,
    totalPhotos: 0,
    totalInvites: 0
  });

  const navigate = useNavigate();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        console.log('❌ Pas de session active, redirection vers login');
        navigate('/login');
        return;
      }

      console.log('✅ Session trouvée pour:', session.user.email);
      setUser(session.user);
      fetchProjects(session.user.id);
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      navigate('/login');
    }
  };

  const fetchProjects = async (userId) => {
    try {
      setLoading(true);
      
      // Récupérer les projets avec les comptages associés
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`
          *,
          contributions:contributions(count),
          invites:invites(count)
        `)
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;

      // Calculer les statistiques globales
      let totalContributions = 0;
      let totalPhotos = 0;
      let totalInvites = 0;

      // Pour chaque projet, enrichir avec les vraies données
      const enrichedProjects = await Promise.all((projectsData || []).map(async (project) => {
        // Récupérer les vraies contributions pour compter les photos
        const { data: contributions, error: contribError } = await supabase
          .from('contributions')
          .select('photo_urls')
          .eq('project_id', project.id);

        if (!contribError && contributions) {
          const photosCount = contributions.reduce((acc, c) => 
            acc + (c.photo_urls?.length || 0), 0);
          
          // Ajouter les photos count au projet
          project.photos_count = photosCount;
          
          // Mettre à jour les totaux
          totalPhotos += photosCount;
          totalContributions += contributions.length;
        }

        // Compter les invitations
        const { count: invitesCount, error: invitesError } = await supabase
          .from('invites')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project.id);

        if (!invitesError) {
          project.invites_count = invitesCount || 0;
          totalInvites += invitesCount || 0;
        }

        return project;
      }));

      setProjects(enrichedProjects);
      setStats({
        totalProjects: enrichedProjects.length,
        activeProjects: enrichedProjects.filter(p => p.status === 'collecting').length,
        completedProjects: enrichedProjects.filter(p => p.status === 'completed').length,
        totalContributions,
        totalPhotos,
        totalInvites
      });

    } catch (error) {
      console.error('❌ Erreur chargement projets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) {
    return <Loading message="Chargement de votre tableau de bord..." />;
  }

  return (
    <div className="dashboard" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem' 
      }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem' }}>Tableau de bord</h1>
          <p style={{ margin: 0, color: '#666' }}>
            Bonjour {user?.user_metadata?.full_name || user?.email} 👋
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => navigate('/create-project')} 
            style={{
              padding: '0.8rem 2rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            + Nouveau projet
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

      {/* Stats cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '1rem',
        marginBottom: '3rem'
      }}>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#666', fontSize: '0.9rem' }}>Projets actifs</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#764ba2' }}>
            {stats.activeProjects}
          </p>
        </div>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#666', fontSize: '0.9rem' }}>Projets terminés</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#28a745' }}>
            {stats.completedProjects}
          </p>
        </div>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#666', fontSize: '0.9rem' }}>Invitations</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#17a2b8' }}>
            {stats.totalInvites}
          </p>
        </div>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#666', fontSize: '0.9rem' }}>Contributions</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#ffc107' }}>
            {stats.totalContributions}
          </p>
        </div>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#666', fontSize: '0.9rem' }}>Photos</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#6f42c1' }}>
            {stats.totalPhotos}
          </p>
        </div>
      </div>

      {/* Liste des projets */}
      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ margin: '0 0 1.5rem' }}>Mes projets</h2>
        <ProjectList 
          projects={projects} 
          onRefresh={() => fetchProjects(user.id)} 
        />
      </div>
    </div>
  );
};

export default Dashboard;