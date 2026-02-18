// C:\Users\USER\bookfete\frontend\src\components\organisateur\ReviewContributions.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const ReviewContributions = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedContributions, setSelectedContributions] = useState({});
  const [expandedPhotos, setExpandedPhotos] = useState({});

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      // Récupérer le projet
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Récupérer les contributions
      const { data: contributionsData, error: contributionsError } = await supabase
        .from('contributions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (contributionsError) throw contributionsError;
      
      console.log('📸 Contributions avec photos:', contributionsData?.filter(c => c.photo_urls?.length > 0));
      
      setContributions(contributionsData || []);
      
      // Initialiser la sélection (toutes cochées par défaut)
      const initialSelection = {};
      const initialExpanded = {};
      contributionsData?.forEach(c => {
        initialSelection[c.id] = true;
        initialExpanded[c.id] = false;
      });
      setSelectedContributions(initialSelection);
      setExpandedPhotos(initialExpanded);

    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleHideContribution = (contributionId) => {
    setSelectedContributions(prev => ({
      ...prev,
      [contributionId]: !prev[contributionId]
    }));
  };

  const togglePhotos = (contributionId) => {
    setExpandedPhotos(prev => ({
      ...prev,
      [contributionId]: !prev[contributionId]
    }));
  };

  const handleReorder = (index, direction) => {
    const newContributions = [...contributions];
    if (direction === 'up' && index > 0) {
      [newContributions[index - 1], newContributions[index]] = 
      [newContributions[index], newContributions[index - 1]];
    } else if (direction === 'down' && index < contributions.length - 1) {
      [newContributions[index], newContributions[index + 1]] = 
      [newContributions[index + 1], newContributions[index]];
    }
    setContributions(newContributions);
  };

  const handleGeneratePDF = async () => {
    setGenerating(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      
      const response = await fetch(`${process.env.REACT_APP_API_URL}/orders/generate/${projectId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Erreur génération PDF');

      const data = await response.json();
      
      await supabase
        .from('projects')
        .update({ status: 'generating' })
        .eq('id', projectId);

      navigate(`/project/${projectId}/choose-maquette`, { 
        state: { pdfPreviewUrl: data.pdfPreviewUrl, orderId: data.orderId }
      });
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Chargement...</div>;

  const stats = {
    total: contributions.length,
    selected: Object.values(selectedContributions).filter(Boolean).length,
    withPhotos: contributions.filter(c => c.photo_urls && c.photo_urls.length > 0).length,
    totalPhotos: contributions.reduce((acc, c) => acc + (c.photo_urls?.length || 0), 0)
  };

  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem'
  };

  const statsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1.5rem',
    marginBottom: '2rem'
  };

  const statCardStyle = {
    background: 'white',
    padding: '1.5rem',
    borderRadius: '10px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    textAlign: 'center'
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: '2rem' }}>
        <h1>Réviser les contributions</h1>
        <h2 style={{ color: '#666', fontSize: '1.2rem' }}>{project?.name}</h2>
      </div>

      {/* Statistiques */}
      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#764ba2' }}>{stats.total}</div>
          <div style={{ color: '#666' }}>Total contributions</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#28a745' }}>{stats.selected}</div>
          <div style={{ color: '#666' }}>Sélectionnées</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#17a2b8' }}>{stats.withPhotos}</div>
          <div style={{ color: '#666' }}>Avec photos</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffc107' }}>{stats.totalPhotos}</div>
          <div style={{ color: '#666' }}>Total photos</div>
        </div>
      </div>

      {/* Liste des contributions */}
      <div style={{
        background: 'white',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        padding: '2rem',
        marginBottom: '2rem'
      }}>
        <h3 style={{ marginBottom: '1.5rem' }}>Contributions reçues</h3>
        
        {contributions.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
            Aucune contribution pour le moment
          </p>
        ) : (
          contributions.map((contribution, index) => {
            const isSelected = selectedContributions[contribution.id];
            const hasPhotos = contribution.photo_urls && contribution.photo_urls.length > 0;
            const isExpanded = expandedPhotos[contribution.id];
            
            return (
              <div 
                key={contribution.id}
                style={{
                  border: isSelected ? '2px solid #764ba2' : '1px solid #eee',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                  background: isSelected ? '#f3e8ff' : 'white',
                  opacity: isSelected ? 1 : 0.8
                }}
              >
                {/* En-tête */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ 
                      background: '#764ba2',
                      color: 'white',
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold'
                    }}>
                      {index + 1}
                    </span>
                    <span style={{ fontWeight: 'bold', color: '#333' }}>
                      {contribution.contributor_email}
                    </span>
                    {hasPhotos && (
                      <span style={{
                        background: '#17a2b8',
                        color: 'white',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '3px',
                        fontSize: '0.8rem'
                      }}>
                        📸 {contribution.photo_urls.length}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleReorder(index, 'up')}
                      disabled={index === 0}
                      style={{
                        padding: '0.3rem 0.8rem',
                        background: '#f0f0f0',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: index === 0 ? 'not-allowed' : 'pointer',
                        opacity: index === 0 ? 0.5 : 1
                      }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleReorder(index, 'down')}
                      disabled={index === contributions.length - 1}
                      style={{
                        padding: '0.3rem 0.8rem',
                        background: '#f0f0f0',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: index === contributions.length - 1 ? 'not-allowed' : 'pointer',
                        opacity: index === contributions.length - 1 ? 0.5 : 1
                      }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => handleHideContribution(contribution.id)}
                      style={{
                        padding: '0.3rem 0.8rem',
                        background: isSelected ? '#dc3545' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {isSelected ? 'Masquer' : 'Afficher'}
                    </button>
                  </div>
                </div>

                {/* Message */}
                <div style={{ 
                  background: '#f8f9fa',
                  padding: '1rem',
                  borderRadius: '5px',
                  marginBottom: '1rem'
                }}>
                  <p style={{ margin: 0, lineHeight: '1.6' }}>
                    {contribution.message || 'Aucun message'}
                  </p>
                </div>

                {/* Photos */}
                {hasPhotos && (
                  <div>
                    <button
                      onClick={() => togglePhotos(contribution.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#764ba2',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      {isExpanded ? '▼' : '▶'} Voir les photos ({contribution.photo_urls.length})
                    </button>

                    {isExpanded && (
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: '1rem',
                        marginTop: '0.5rem'
                      }}>
                        {contribution.photo_urls.map((url, idx) => (
                          <div key={idx} style={{
                            position: 'relative',
                            paddingTop: '100%',
                            background: '#f0f0f0',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            cursor: 'pointer'
                          }}>
                            <img 
                              src={url} 
                              alt={`Photo ${idx + 1}`}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                              }}
                              onClick={() => window.open(url, '_blank')}
                              onError={(e) => {
                                console.error('Erreur chargement image:', url);
                                e.target.src = 'https://via.placeholder.com/150?text=Erreur';
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Date */}
                <div style={{ 
                  marginTop: '1rem',
                  fontSize: '0.85rem',
                  color: '#999',
                  textAlign: 'right'
                }}>
                  {new Date(contribution.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '1rem',
        marginTop: '2rem'
      }}>
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          style={{
            padding: '0.8rem 2rem',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          Retour
        </button>
        <button
          onClick={handleGeneratePDF}
          disabled={generating || stats.selected === 0}
          style={{
            padding: '0.8rem 2rem',
            background: stats.selected === 0 ? '#ccc' : '#764ba2',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: stats.selected === 0 ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold'
          }}
        >
          {generating ? 'Génération...' : `Générer le PDF (${stats.selected} contributions)`}
        </button>
      </div>
    </div>
  );
};

export default ReviewContributions;