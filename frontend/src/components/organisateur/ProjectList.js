// C:\Users\USER\bookfete\frontend\src\components\organisateur\ProjectList.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const ProjectList = ({ projects, onRefresh }) => {
  const navigate = useNavigate();
  const [projectStats, setProjectStats] = useState({});

  useEffect(() => {
    if (projects && projects.length > 0) {
      fetchAllStats();
    }
  }, [projects]);

  const fetchAllStats = async () => {
    const stats = {};
    
    for (const project of projects) {
      try {
        // Récupérer les contributions pour ce projet
        const { data: contributions, error: contribError } = await supabase
          .from('contributions')
          .select('*')
          .eq('project_id', project.id);

        if (contribError) {
          console.error('Erreur récupération contributions:', contribError);
          continue;
        }

        // Calculer les stats
        const contributionsCount = contributions?.length || 0;
        const photosCount = contributions?.reduce((acc, c) => 
          acc + (c.photo_urls?.length || 0), 0) || 0;

        stats[project.id] = {
          contributions: contributionsCount,
          photos: photosCount
        };

      } catch (error) {
        console.error('Erreur:', error);
      }
    }

    setProjectStats(stats);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      collecting: { label: 'Collecte en cours', class: 'badge-info' },
      reviewing: { label: 'En relecture', class: 'badge-warning' },
      generating: { label: 'Génération en cours', class: 'badge-info' },
      completed: { label: 'Terminé', class: 'badge-success' }
    };
    const config = statusConfig[status] || { label: status, class: 'badge-default' };
    return <span className={`badge ${config.class}`}>{config.label}</span>;
  };

  const getDeadlineStatus = (deadline) => {
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const daysLeft = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return 'Terminé';
    if (daysLeft === 0) return 'Dernier jour !';
    if (daysLeft === 1) return 'Demain';
    return `${daysLeft} jours restants`;
  };

  if (!projects || projects.length === 0) {
    return (
      <div className="empty-state">
        <p>Vous n'avez pas encore créé de projet</p>
        <button onClick={() => navigate('/create-project')} className="btn-primary">
          Créer mon premier projet
        </button>
      </div>
    );
  }

  return (
    <div className="project-list">
      {projects.map(project => {
        const stats = projectStats[project.id] || { contributions: 0, photos: 0 };
        
        return (
          <div key={project.id} className="project-card">
            {project.cover_image_url && (
              <img 
                src={project.cover_image_url} 
                alt={project.name} 
                className="project-cover"
                style={{ width: '200px', height: '200px', objectFit: 'cover' }}
              />
            )}
            <div className="project-info" style={{ padding: '1.5rem', flex: 1 }}>
              <h3 style={{ margin: '0 0 0.5rem' }}>{project.name}</h3>
              <p className="project-type" style={{ color: '#764ba2', fontWeight: '600', marginBottom: '0.5rem' }}>
                {project.type}
              </p>
              <p className="project-description" style={{ color: '#666', marginBottom: '1rem' }}>
                {project.description || 'Aucune description'}
              </p>
              
              <div className="project-meta" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div className="project-status">
                  {getStatusBadge(project.status)}
                </div>
                <div className="project-deadline">
                  ⏰ {getDeadlineStatus(project.contribution_deadline)}
                </div>
              </div>

              {/* ✅ STATISTIQUES CORRIGÉES */}
              <div className="project-stats" style={{ 
                display: 'flex', 
                gap: '2rem', 
                marginBottom: '1rem',
                padding: '0.5rem 0',
                borderTop: '1px solid #eee',
                borderBottom: '1px solid #eee'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#764ba2' }}>
                    {stats.contributions}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.9rem', color: '#666' }}>
                    contribution{stats.contributions !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#764ba2' }}>
                    {stats.photos}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.9rem', color: '#666' }}>
                    photo{stats.photos !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#764ba2' }}>
                    {project.invites_count || 0}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.9rem', color: '#666' }}>
                    invité{project.invites_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="project-actions" style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="btn-secondary"
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#f0f0f0',
                    border: '1px solid #ddd',
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                >
                  Voir détails
                </button>
                
                {project.status === 'collecting' && (
                  <button 
                    onClick={() => navigate(`/project/${project.id}/invite`)}
                    className="btn-primary"
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#764ba2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    Inviter
                  </button>
                )}
                
                {project.status === 'reviewing' && (
                  <button 
                    onClick={() => navigate(`/project/${project.id}/review`)}
                    className="btn-primary"
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#ffc107',
                      color: '#333',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    Réviser
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProjectList;