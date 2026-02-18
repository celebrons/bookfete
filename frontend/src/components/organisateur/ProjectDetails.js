// C:\Users\USER\bookfete\frontend\src\components\organisateur\ProjectDetails.js
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import ContributionControls from './ContributionControls';
import ContributionModerator from './moderation/ContributionModerator';
import ChapterManager from './moderation/ChapterManager';
import ChapterOrganizer from './moderation/ChapterOrganizer';
import PhotoGallery from './moderation/PhotoGallery';

const ProjectDetails = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [chapterContributions, setChapterContributions] = useState({});
  const [bookSettings, setBookSettings] = useState({
    tone: 'emotionnel',
    structure: 'classique',
    style: 'moderne',
    custom_title: '',
    custom_subtitle: '',
    introduction: '',
    conclusion: '',
    dedication: '',
    cover_quote: ''
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contributions');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  console.log('🟢 ProjectDetails rendu', { projectId, loading, project });

  const fetchProjectDetails = useCallback(async () => {
    console.log('📁 fetchProjectDetails appelé pour:', projectId);
    try {
      setLoading(true);
      setError(null);

      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      console.log('✅ Projet chargé:', projectData);
      setProject(projectData);

      const { data: contributionsData, error: contributionsError } = await supabase
        .from('contributions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (contributionsError) throw contributionsError;
      console.log('✅ Contributions chargées:', contributionsData?.length);
      setContributions(contributionsData || []);

    } catch (error) {
      console.error('❌ Erreur chargement:', error);
      setError(error.message);
      showToast('Erreur de chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchChapters = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setChapters(data || []);
      
      const chapterMap = {};
      data?.forEach(chapter => {
        chapterMap[chapter.id] = chapter.contribution_ids || [];
      });
      setChapterContributions(chapterMap);
      
    } catch (error) {
      console.error('❌ Erreur chapitres:', error);
      showToast('Erreur de chargement des chapitres', 'error');
    }
  }, [projectId]);

  const fetchBookSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('book_settings')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setBookSettings(data);
      }
    } catch (error) {
      console.error('❌ Erreur paramètres:', error);
      showToast('Erreur de chargement des paramètres', 'error');
    }
  }, [projectId]);

  useEffect(() => {
    console.log('useEffect déclenché');
    fetchProjectDetails();
    fetchChapters();
    fetchBookSettings();
  }, [fetchProjectDetails, fetchChapters, fetchBookSettings]);

  const updateBookSettings = async (updates) => {
    console.log('📝 Mise à jour settings:', updates);
    setSaving(true);
    try {
      const newSettings = { ...bookSettings, ...updates };
      
      const { error } = await supabase
        .from('book_settings')
        .upsert({
          project_id: projectId,
          ...newSettings,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      setBookSettings(newSettings);
      showToast('✅ Paramètres sauvegardés');
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveChapters = async (newChapters) => {
    setSaving(true);
    try {
      await supabase
        .from('chapters')
        .delete()
        .eq('project_id', projectId);

      if (newChapters.length > 0) {
        const chaptersToInsert = newChapters.map((chapter, index) => ({
          project_id: projectId,
          title: chapter.title,
          description: chapter.description || '',
          order_index: index,
          contribution_ids: chapterContributions[chapter.id] || []
        }));

        const { error } = await supabase
          .from('chapters')
          .insert(chaptersToInsert);

        if (error) throw error;
      }
      
      setChapters(newChapters);
      showToast('✅ Chapitres sauvegardés');
    } catch (error) {
      console.error('❌ Erreur sauvegarde chapitres:', error);
      showToast('Erreur lors de la sauvegarde des chapitres', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateChapterContributions = (chapterId, contributionIds) => {
    setChapterContributions(prev => ({
      ...prev,
      [chapterId]: contributionIds
    }));
  };

  const updateContributions = async (updatedContributions) => {
    setSaving(true);
    try {
      for (const contribution of updatedContributions) {
        const original = contributions.find(c => c.id === contribution.id);
        if (JSON.stringify(original) !== JSON.stringify(contribution)) {
          const { error } = await supabase
            .from('contributions')
            .update({
              status: contribution.status,
              edited_message: contribution.edited_message,
              photo_urls: contribution.photo_urls,
              photo_captions: contribution.photo_captions,
              main_photo_index: contribution.main_photo_index,
              moderation_notes: contribution.moderation_notes,
              order_index: contribution.order_index
            })
            .eq('id', contribution.id);

          if (error) throw error;
        }
      }
      
      setContributions(updatedContributions);
      showToast('✅ Contributions mises à jour');
    } catch (error) {
      console.error('❌ Erreur mise à jour contributions:', error);
      showToast('Erreur lors de la mise à jour', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateFullHTMLPreview = () => {
    const approvedContributions = contributions.filter(c => c.status === 'approved');
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${bookSettings.custom_title || project.name}</title>
        <style>
          body { font-family: 'Georgia', serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 2rem; }
          .cover { text-align: center; margin-bottom: 3rem; padding: 3rem; background: ${bookSettings.style === 'luxe' ? '#000' : bookSettings.style === 'moderne' ? '#764ba2' : '#f8f9fa'}; color: ${bookSettings.style === 'luxe' ? 'gold' : 'white'}; border-radius: 10px; }
          .cover h1 { font-size: 3rem; margin-bottom: 1rem; }
          .chapter { margin: 3rem 0; page-break-before: always; }
          .chapter h2 { color: #764ba2; border-bottom: 2px solid #764ba2; padding-bottom: 0.5rem; }
          .contribution { margin: 2rem 0; padding: 1.5rem; background: #f8f9fa; border-radius: 8px; }
          .contribution .email { color: #666; font-size: 0.9rem; margin-bottom: 0.5rem; }
          .contribution .message { font-size: 1.1rem; }
          .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem; }
          .photo-grid img { width: 100%; height: 150px; object-fit: cover; border-radius: 5px; }
          .intro, .conclusion { margin: 2rem 0; padding: 2rem; background: #f0f0f0; border-radius: 8px; font-style: italic; }
          .dedication { text-align: center; margin: 3rem 0; font-size: 1.2rem; color: #666; }
        </style>
      </head>
      <body>
    `;

    html += `
      <div class="cover">
        <h1>${bookSettings.custom_title || project.name}</h1>
        ${bookSettings.custom_subtitle ? `<h2>${bookSettings.custom_subtitle}</h2>` : ''}
        ${bookSettings.cover_quote ? `<p style="margin-top: 2rem; font-style: italic;">"${bookSettings.cover_quote}"</p>` : ''}
      </div>
    `;

    if (bookSettings.dedication) {
      html += `<div class="dedication">À ${bookSettings.dedication}</div>`;
    }

    if (bookSettings.introduction) {
      html += `<div class="intro"><h3>Introduction</h3><p>${bookSettings.introduction}</p></div>`;
    }

    if (chapters.length > 0) {
      chapters.forEach(chapter => {
        const chapterContributionIds = chapterContributions[chapter.id] || [];
        const chapterContribs = approvedContributions.filter(c => chapterContributionIds.includes(c.id));
        
        if (chapterContribs.length > 0) {
          html += `
            <div class="chapter">
              <h2>${chapter.title}</h2>
              ${chapter.description ? `<p style="color: #666;">${chapter.description}</p>` : ''}
          `;
          
          chapterContribs.forEach(contribution => {
            html += `
              <div class="contribution">
                <div class="email">${contribution.contributor_email}</div>
                <div class="message">${contribution.edited_message || contribution.message}</div>
            `;
            
            if (contribution.photo_urls?.length > 0) {
              html += `<div class="photo-grid">`;
              contribution.photo_urls.forEach((url, idx) => {
                const caption = contribution.photo_captions?.[idx] || '';
                html += `<figure style="margin:0; position:relative;">`;
                html += `<img src="${url}" alt="Photo">`;
                if (caption) {
                  html += `<figcaption style="font-size:0.8rem; color:#666; margin-top:0.3rem;">${caption}</figcaption>`;
                }
                if (idx === contribution.main_photo_index) {
                  html += `<div style="position:absolute; top:5px; left:5px; background:gold; color:black; padding:2px 5px; border-radius:3px; font-size:0.7rem;">⭐ Principale</div>`;
                }
                html += `</figure>`;
              });
              html += `</div>`;
            }
            
            html += `</div>`;
          });
          
          html += `</div>`;
        }
      });
    } else {
      approvedContributions.forEach(contribution => {
        html += `
          <div class="contribution">
            <div class="email">${contribution.contributor_email}</div>
            <div class="message">${contribution.edited_message || contribution.message}</div>
        `;
        
        if (contribution.photo_urls?.length > 0) {
          html += `<div class="photo-grid">`;
          contribution.photo_urls.forEach((url, idx) => {
            const caption = contribution.photo_captions?.[idx] || '';
            html += `<figure style="margin:0; position:relative;">`;
            html += `<img src="${url}" alt="Photo">`;
            if (caption) {
              html += `<figcaption style="font-size:0.8rem; color:#666; margin-top:0.3rem;">${caption}</figcaption>`;
            }
            if (idx === contribution.main_photo_index) {
              html += `<div style="position:absolute; top:5px; left:5px; background:gold; color:black; padding:2px 5px; border-radius:3px; font-size:0.7rem;">⭐ Principale</div>`;
            }
            html += `</figure>`;
          });
          html += `</div>`;
        }
        
        html += `</div>`;
      });
    }

    if (bookSettings.conclusion) {
      html += `<div class="conclusion"><h3>Conclusion</h3><p>${bookSettings.conclusion}</p></div>`;
    }

    html += `
      </body>
      </html>
    `;

    return html;
  };

  const generateDraft = async () => {
    setGeneratingDraft(true);
    try {
      console.log('📄 Génération du brouillon...');
      
      const html = generateFullHTMLPreview();
      
      const newWindow = window.open();
      newWindow.document.write(html);
      newWindow.document.close();
      
      showToast('✅ Brouillon généré avec succès');
    } catch (error) {
      console.error('❌ Erreur génération:', error);
      showToast('Erreur lors de la génération du brouillon', 'error');
    } finally {
      setGeneratingDraft(false);
    }
  };

  if (error) {
    return <div style={{ padding: '2rem', color: '#dc3545', textAlign: 'center' }}>❌ Erreur: {error}</div>;
  }

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;
  }

  if (!project) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Projet non trouvé</div>;
  }

  const statusMap = {
    collecting: { label: 'Collecte en cours', color: '#17a2b8' },
    reviewing: { label: 'En relecture', color: '#ffc107' },
    generating: { label: 'Génération en cours', color: '#007bff' },
    completed: { label: 'Terminé', color: '#28a745' }
  };
  const status = statusMap[project.status] || { label: project.status, color: '#6c757d' };

  const today = new Date();
  const deadline = new Date(project.contribution_deadline);
  const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  const deadlineStatus = daysLeft < 0 
    ? { text: 'Terminé', color: '#dc3545' }
    : daysLeft === 0 
    ? { text: 'Dernier jour !', color: '#ffc107' }
    : { text: `${daysLeft} jours restants`, color: '#28a745' };

  const tabs = [
    { id: 'contributions', label: '📝 Contributions', description: 'Voir toutes les contributions reçues' },
    { id: 'moderation', label: '⚖️ Modération', description: 'Approuver ou rejeter les contributions' },
    { id: 'photos', label: '📸 Photos', description: 'Gérer les photos et légendes' },
    { id: 'chapters', label: '📑 Chapitres', description: 'Créer et organiser les chapitres' },
    { id: 'organize', label: '📋 Organisation', description: 'Assigner les contributions aux chapitres' },
    { id: 'editorial', label: '🎨 Style', description: 'Choisir le ton, la structure et le style' },
    { id: 'preview', label: '👁️ Aperçu', description: 'Visualiser le livre final' }
  ];

  const handleTabChange = (newTab) => {
    if (saving) return;
    setSaving(true);
    setTimeout(() => {
      setActiveTab(newTab);
      setSaving(false);
    }, 500);
  };

  const getNextTab = () => {
    const currentIndex = tabs.findIndex(t => t.id === activeTab);
    return currentIndex < tabs.length - 1 ? tabs[currentIndex + 1] : null;
  };

  const getPrevTab = () => {
    const currentIndex = tabs.findIndex(t => t.id === activeTab);
    return currentIndex > 0 ? tabs[currentIndex - 1] : null;
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* En-tête avec retour au tableau de bord */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '0.5rem 1rem',
              background: '#f8f9fa',
              border: '1px solid #dee2e6',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              color: '#495057',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e9ecef';
              e.currentTarget.style.borderColor = '#adb5bd';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8f9fa';
              e.currentTarget.style.borderColor = '#dee2e6';
            }}
          >
            ← Retour
          </button>
          <div>
            <h1 style={{ margin: 0 }}>{project.name}</h1>
            <p style={{ margin: '0.5rem 0 0', color: '#666' }}>
              Créé le {new Date(project.created_at).toLocaleDateString('fr-FR')}
              {saving && <span style={{ marginLeft: '1rem', color: '#ffc107' }}>💾 Sauvegarde...</span>}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            onClick={() => navigate(`/project/${projectId}/invite`)}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            📧 Inviter
          </button>
          <button 
            onClick={() => navigate(`/project/${projectId}/edit`)}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ✏️ Modifier
          </button>
        </div>
      </div>

      {/* Carte d'informations */}
      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '1.5rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem'
        }}>
          <div>
            <label style={{ color: '#666', fontSize: '0.9rem' }}>Type d'événement</label>
            <p style={{ margin: '0.5rem 0 0', fontWeight: 'bold' }}>
              {project.type === 'pot_depart' ? 'Pot de départ' :
               project.type === 'fin_projet' ? 'Fin de projet' :
               project.type === 'mariage' ? 'Mariage' :
               project.type === 'vacances' ? 'Vacances' :
               project.type === 'anniversaire' ? 'Anniversaire' :
               project.type === 'retraite' ? 'Retraite' :
               project.type}
            </p>
          </div>
          <div>
            <label style={{ color: '#666', fontSize: '0.9rem' }}>Statut</label>
            <p style={{ margin: '0.5rem 0 0', fontWeight: 'bold', color: status.color }}>
              {status.label}
            </p>
          </div>
          <div>
            <label style={{ color: '#666', fontSize: '0.9rem' }}>Date limite</label>
            <p style={{ margin: '0.5rem 0 0', fontWeight: 'bold' }}>
              {new Date(project.contribution_deadline).toLocaleDateString('fr-FR')}
              {deadlineStatus && (
                <span style={{ color: deadlineStatus.color, marginLeft: '0.5rem' }}>
                  ({deadlineStatus.text})
                </span>
              )}
            </p>
          </div>
        </div>
        {project.description && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
            <label style={{ color: '#666', fontSize: '0.9rem' }}>Description</label>
            <p style={{ margin: '0.5rem 0 0' }}>{project.description}</p>
          </div>
        )}
      </div>

      {/* Contrôles des contributions */}
      <ContributionControls 
        project={project} 
        onStatusChange={(updatedProject) => {
          setProject(updatedProject);
          fetchProjectDetails();
        }}
      />

      {/* Barre de progression */}
      <div style={{
        background: 'white',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              height: '8px',
              background: '#e9ecef',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${((tabs.findIndex(t => t.id === activeTab) + 1) / tabs.length) * 100}%`,
                height: '100%',
                background: '#764ba2',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
          <span style={{ color: '#666', fontSize: '0.9rem' }}>
            Étape {tabs.findIndex(t => t.id === activeTab) + 1}/{tabs.length}
          </span>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '2rem',
        borderBottom: '2px solid #eee',
        paddingBottom: '0.5rem',
        overflowX: 'auto'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            style={{
              padding: '0.8rem 1.5rem',
              background: 'transparent',
              color: activeTab === tab.id ? '#764ba2' : '#666',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #764ba2' : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: activeTab === tab.id ? '600' : '400',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              whiteSpace: 'nowrap'
            }}
            title={tab.description}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Titre et description de l'onglet actuel */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: 0 }}>{tabs.find(t => t.id === activeTab)?.label}</h2>
        <p style={{ color: '#666', margin: '0.5rem 0 0' }}>
          {tabs.find(t => t.id === activeTab)?.description}
        </p>
      </div>

      {/* Contenu des onglets */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'contributions' && (
          <div>
            <h3>Contributions reçues</h3>
            {contributions.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                Aucune contribution pour le moment
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {contributions.map((contribution, index) => (
                  <div key={contribution.id} style={{
                    padding: '1rem',
                    background: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <strong>{contribution.contributor_email}</strong>
                      <small>{new Date(contribution.created_at).toLocaleDateString('fr-FR')}</small>
                    </div>
                    <p>{contribution.message}</p>
                    {contribution.photo_urls?.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        📸 {contribution.photo_urls.length} photo(s)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'moderation' && (
          <ContributionModerator
            contributions={contributions}
            onUpdate={updateContributions}
          />
        )}

        {activeTab === 'photos' && (
          <PhotoGallery
            contributions={contributions}
            onUpdatePhoto={(updatedContribution) => {
              const newContributions = contributions.map(c =>
                c.id === updatedContribution.id ? updatedContribution : c
              );
              updateContributions(newContributions);
            }}
          />
        )}

        {activeTab === 'chapters' && (
          <ChapterManager
            chapters={chapters}
            onUpdate={saveChapters}
          />
        )}

        {activeTab === 'organize' && (
          <ChapterOrganizer
            chapters={chapters}
            contributions={contributions.filter(c => c.status === 'approved')}
            chapterContributions={chapterContributions}
            onUpdateChapterContributions={updateChapterContributions}
          />
        )}

        {activeTab === 'editorial' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Ton du livre */}
            <div style={{ background: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
              <h3>Ton du livre</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                {[
                  { id: 'emotionnel', label: 'Émotionnel', icon: '❤️', color: '#e83e8c' },
                  { id: 'drole', label: 'Drôle', icon: '😂', color: '#ffc107' },
                  { id: 'solemnel', label: 'Solennel', icon: '🎗️', color: '#6c757d' },
                  { id: 'inspirant', label: 'Inspirant', icon: '✨', color: '#17a2b8' },
                  { id: 'professionnel', label: 'Professionnel', icon: '💼', color: '#007bff' },
                  { id: 'poetique', label: 'Poétique', icon: '📜', color: '#6610f2' },
                  { id: 'minimaliste', label: 'Minimaliste', icon: '◻️', color: '#343a40' }
                ].map(tone => (
                  <div
                    key={tone.id}
                    onClick={() => updateBookSettings({ tone: tone.id })}
                    style={{
                      padding: '1rem',
                      background: bookSettings.tone === tone.id ? tone.color : '#f8f9fa',
                      color: bookSettings.tone === tone.id ? 'white' : '#333',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                      border: bookSettings.tone === tone.id ? 'none' : '2px solid #eee'
                    }}
                  >
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{tone.icon}</div>
                    <div style={{ fontWeight: 'bold' }}>{tone.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Structure du livre */}
            <div style={{ background: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
              <h3>Structure du livre</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                {[
                  { id: 'classique', label: 'Classique', desc: 'Couverture, Introduction, Témoignages, Conclusion' },
                  { id: 'narrative', label: 'Narrative', desc: 'Chapitres thématiques, Histoire racontée' },
                  { id: 'album', label: 'Album Photo', desc: 'Images pleine page, Citations mises en avant' }
                ].map(struct => (
                  <div
                    key={struct.id}
                    onClick={() => updateBookSettings({ structure: struct.id })}
                    style={{
                      padding: '1.5rem',
                      background: bookSettings.structure === struct.id ? '#764ba2' : '#f8f9fa',
                      color: bookSettings.structure === struct.id ? 'white' : '#333',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{struct.label}</div>
                    <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{struct.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Style visuel */}
            <div style={{ background: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
              <h3>Style visuel</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                {[
                  { id: 'luxe', label: 'Luxe noir & or', color: '#000', bg: '#f8f9fa' },
                  { id: 'moderne', label: 'Moderne épuré', color: '#764ba2', bg: '#f3e8ff' },
                  { id: 'pastel', label: 'Pastel chaleureux', color: '#f8c291', bg: '#fff4e6' },
                  { id: 'corporate', label: 'Corporate élégant', color: '#2c3e50', bg: '#ecf0f1' }
                ].map(style => (
                  <div
                    key={style.id}
                    onClick={() => updateBookSettings({ style: style.id })}
                    style={{
                      padding: '1.5rem',
                      background: bookSettings.style === style.id ? style.color : style.bg,
                      color: bookSettings.style === style.id ? 'white' : '#333',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                      border: bookSettings.style === style.id ? 'none' : '1px solid #ddd'
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{style.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contenu personnel */}
            <div style={{ background: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
              <h3>Contenu personnel</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                <input
                  type="text"
                  placeholder="Titre du livre"
                  value={bookSettings.custom_title || ''}
                  onChange={(e) => updateBookSettings({ custom_title: e.target.value })}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '5px',
                    border: '1px solid #ddd',
                    fontSize: '1rem',
                    width: '100%'
                  }}
                />
                <input
                  type="text"
                  placeholder="Sous-titre"
                  value={bookSettings.custom_subtitle || ''}
                  onChange={(e) => updateBookSettings({ custom_subtitle: e.target.value })}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '5px',
                    border: '1px solid #ddd',
                    fontSize: '1rem',
                    width: '100%'
                  }}
                />
                <textarea
                  placeholder="Message d'introduction"
                  value={bookSettings.introduction || ''}
                  onChange={(e) => updateBookSettings({ introduction: e.target.value })}
                  rows="4"
                  style={{
                    padding: '0.8rem',
                    borderRadius: '5px',
                    border: '1px solid #ddd',
                    fontSize: '1rem',
                    width: '100%',
                    resize: 'vertical'
                  }}
                />
                <textarea
                  placeholder="Message de conclusion"
                  value={bookSettings.conclusion || ''}
                  onChange={(e) => updateBookSettings({ conclusion: e.target.value })}
                  rows="4"
                  style={{
                    padding: '0.8rem',
                    borderRadius: '5px',
                    border: '1px solid #ddd',
                    fontSize: '1rem',
                    width: '100%',
                    resize: 'vertical'
                  }}
                />
                <input
                  type="text"
                  placeholder="Dédicace"
                  value={bookSettings.dedication || ''}
                  onChange={(e) => updateBookSettings({ dedication: e.target.value })}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '5px',
                    border: '1px solid #ddd',
                    fontSize: '1rem',
                    width: '100%'
                  }}
                />
                <input
                  type="text"
                  placeholder="Citation en couverture"
                  value={bookSettings.cover_quote || ''}
                  onChange={(e) => updateBookSettings({ cover_quote: e.target.value })}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '5px',
                    border: '1px solid #ddd',
                    fontSize: '1rem',
                    width: '100%'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div style={{ 
            background: 'white', 
            padding: '3rem', 
            borderRadius: '10px', 
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            textAlign: 'center',
            minHeight: '400px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div>
              <h2 style={{ color: '#764ba2', marginBottom: '1rem' }}>Aperçu du livre</h2>
              <p style={{ color: '#666', marginBottom: '2rem' }}>
                {contributions.filter(c => c.status === 'approved').length} contributions approuvées · {chapters.length} chapitres
              </p>
              
              <div style={{
                background: '#f8f9fa',
                padding: '2rem',
                borderRadius: '8px',
                marginBottom: '2rem',
                textAlign: 'left',
                maxHeight: '300px',
                overflow: 'auto',
                border: '1px solid #dee2e6'
              }}>
                <h3 style={{ color: '#764ba2' }}>{bookSettings.custom_title || project.name}</h3>
                {bookSettings.custom_subtitle && <h4>{bookSettings.custom_subtitle}</h4>}
                
                {bookSettings.introduction && (
                  <div style={{ marginTop: '1rem', fontStyle: 'italic' }}>
                    <p>{bookSettings.introduction}</p>
                  </div>
                )}

                {chapters.length > 0 ? (
                  chapters.map((chapter, idx) => {
                    const chapterContribs = chapterContributions[chapter.id] || [];
                    const contribCount = chapterContribs.length;
                    
                    return (
                      <div key={idx} style={{ marginTop: '1rem' }}>
                        <h4 style={{ color: '#333' }}>📖 {chapter.title}</h4>
                        <p style={{ fontSize: '0.9rem', color: '#666' }}>
                          {contribCount} témoignage{contribCount > 1 ? 's' : ''}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ color: '#999', fontStyle: 'italic' }}>
                    {contributions.filter(c => c.status === 'approved').length} témoignages approuvés
                  </p>
                )}
              </div>

              <button
                onClick={generateDraft}
                disabled={generatingDraft}
                style={{
                  padding: '1rem 3rem',
                  background: generatingDraft ? '#ccc' : '#764ba2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '1.1rem',
                  cursor: generatingDraft ? 'not-allowed' : 'pointer'
                }}
              >
                {generatingDraft ? 'Génération en cours...' : 'Générer un brouillon complet'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Boutons de navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '3rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        {getPrevTab() ? (
          <button
            onClick={() => handleTabChange(getPrevTab().id)}
            style={{
              padding: '1rem 2rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ← {getPrevTab().label}
          </button>
        ) : <div />}

        {['moderation', 'photos', 'chapters', 'organize', 'editorial'].includes(activeTab) && (
          <button
            onClick={() => {
              if (activeTab === 'moderation') {
                updateContributions(contributions);
              } else if (activeTab === 'photos') {
                updateContributions(contributions);
              } else if (activeTab === 'chapters') {
                saveChapters(chapters);
              } else if (activeTab === 'organize') {
                saveChapters(chapters);
              } else if (activeTab === 'editorial') {
                updateBookSettings({});
              }
              showToast('✅ Modifications sauvegardées !');
            }}
            style={{
              padding: '1rem 2rem',
              background: '#28a745',
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
            💾 Enregistrer
          </button>
        )}

        {getNextTab() ? (
          <button
            onClick={() => handleTabChange(getNextTab().id)}
            style={{
              padding: '1rem 2rem',
              background: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {getNextTab().label} →
          </button>
        ) : (
          <button
            onClick={() => showToast('✅ Félicitations ! Votre livre est prêt à être généré !')}
            style={{
              padding: '1rem 2rem',
              background: '#ffc107',
              color: '#333',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            ✅ Terminer
          </button>
        )}
      </div>

      {/* Toast de notification */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: toast.type === 'success' ? '#28a745' : '#dc3545',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '5px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 9999,
          animation: 'slideIn 0.3s ease',
          fontSize: '1rem'
        }}>
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ProjectDetails;