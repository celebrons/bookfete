// C:\Users\USER\bookfete\frontend\src\components\organisateur\CreateProject.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import './Organisateur.css';

const CreateProject = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, design, style } = location.state || {};
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: theme?.title?.toLowerCase() || 'anniversaire',
    name: '',
    description: '',
    deadline: '',
    coverImage: null,
    design: design?.id || 'heritage',
    narrativeStyle: style?.id || 'humour'
  });
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (theme) {
      setFormData(prev => ({
        ...prev,
        type: theme.title?.toLowerCase() || 'anniversaire',
        name: `${theme.title} de ...`
      }));
    }
    if (design) {
      setFormData(prev => ({ ...prev, design: design.id }));
    }
    if (style) {
      setFormData(prev => ({ ...prev, narrativeStyle: style.id }));
    }
  }, [theme, design, style]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, coverImage: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Non authentifié');
      }

      let coverImageUrl = null;
      if (formData.coverImage) {
        const fileExt = formData.coverImage.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('project-covers')
          .upload(fileName, formData.coverImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('project-covers')
          .getPublicUrl(fileName);

        coverImageUrl = publicUrl;
      }

      const projectData = {
        owner_id: user.id,
        type: formData.type,
        name: formData.name,
        description: formData.description || '',
        contribution_deadline: formData.deadline,
        cover_image_url: coverImageUrl,
        design: formData.design,
        narrative_style: formData.narrativeStyle,
        status: 'collecting'
      };

      const { data, error } = await supabase
        .from('projects')
        .insert([projectData])
        .select()
        .single();

      if (error) throw error;

      // Rediriger vers le tableau de bord
      navigate('/dashboard');
      
    } catch (error) {
      console.error('❌ Erreur création projet:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 2);
  const minDateString = minDate.toISOString().split('T')[0];

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '2rem', color: '#333', textAlign: 'center' }}>
        Création de votre livre personnalisé
      </h1>
      
      {/* Carte des choix pré-sélectionnés - MISE EN AVANT */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '2rem',
        borderRadius: '15px',
        marginBottom: '2rem',
        color: 'white',
        boxShadow: '0 10px 30px rgba(118, 75, 162, 0.3)'
      }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.3rem', textAlign: 'center' }}>
          ✨ Vos choix personnalisés ✨
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1.5rem',
          textAlign: 'center'
        }}>
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{theme?.icon || '🎂'}</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Thématique</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
              {theme?.title || 'Anniversaire'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📚</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Design</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
              {design?.name || 'Héritage'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{style?.icon || '😄'}</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Style narratif</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
              {style?.name || 'Humour'}
            </div>
          </div>
        </div>
        <p style={{
          margin: '1.5rem 0 0',
          fontSize: '0.95rem',
          opacity: 0.9,
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          Ces choix seront disponibles dans l'onglet "Style" de votre projet
        </p>
      </div>

      {/* Formulaire principal */}
      <form onSubmit={handleSubmit} style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ marginBottom: '1.5rem', color: '#333' }}>Informations générales</h2>
        
        {/* Nom du projet */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>
            Nom du projet *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Ex: 60 ans de maman, Notre mariage..."
            required
            style={{
              width: '100%',
              padding: '0.8rem',
              border: '1px solid #ddd',
              borderRadius: '5px',
              fontSize: '1rem'
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>
            Description (optionnelle)
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Décrivez votre projet pour vos invités..."
            rows="4"
            style={{
              width: '100%',
              padding: '0.8rem',
              border: '1px solid #ddd',
              borderRadius: '5px',
              fontSize: '1rem',
              resize: 'vertical'
            }}
          />
        </div>

        {/* Photo de couverture */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>
            Photo de couverture
          </label>
          <div style={{ textAlign: 'center' }}>
            {previewUrl ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={previewUrl}
                  alt="Aperçu"
                  style={{ maxWidth: '300px', maxHeight: '200px', borderRadius: '5px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    setFormData(prev => ({ ...prev, coverImage: null }));
                  }}
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '-10px',
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px'
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div style={{ padding: '2rem', border: '2px dashed #ccc', borderRadius: '5px' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  id="cover-upload"
                  style={{ display: 'none' }}
                />
                <label
                  htmlFor="cover-upload"
                  style={{
                    display: 'inline-block',
                    padding: '0.8rem 2rem',
                    background: '#f8f9fa',
                    border: '1px solid #ddd',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#e9ecef'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#f8f9fa'}
                >
                  📷 Choisir une image
                </label>
                <p style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                  Format recommandé : 1200x800px
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Date limite */}
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>
            Date limite de collecte *
          </label>
          <input
            type="date"
            name="deadline"
            value={formData.deadline}
            onChange={handleInputChange}
            min={minDateString}
            required
            style={{
              width: '100%',
              padding: '0.8rem',
              border: '1px solid #ddd',
              borderRadius: '5px',
              fontSize: '1rem'
            }}
          />
          <p style={{ marginTop: '0.3rem', color: '#666', fontSize: '0.85rem' }}>
            Les contributeurs recevront un rappel 2 jours avant cette date
          </p>
        </div>

        {/* Bouton de création */}
        <button
          type="submit"
          disabled={loading || !formData.name || !formData.deadline}
          style={{
            width: '100%',
            padding: '1.2rem',
            background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            cursor: loading || !formData.name || !formData.deadline ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            boxShadow: '0 5px 15px rgba(118, 75, 162, 0.3)'
          }}
          onMouseEnter={(e) => {
            if (!loading && formData.name && formData.deadline) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(118, 75, 162, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading && formData.name && formData.deadline) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 5px 15px rgba(118, 75, 162, 0.3)';
            }
          }}
        >
          {loading ? 'Création en cours...' : '🚀 Créer mon livre'}
        </button>
      </form>
    </div>
  );
};

export default CreateProject;