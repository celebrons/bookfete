import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Loading from '../common/Loading';

const EditProject = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: '',
    deadline: '',
    status: 'collecting'
  });

  const projectTypes = [
    { value: 'pot_depart', label: 'Pot de départ' },
    { value: 'fin_projet', label: 'Fin de projet' },
    { value: 'mariage', label: 'Mariage' },
    { value: 'vacances', label: 'Souvenirs de vacances' },
    { value: 'anniversaire', label: 'Anniversaire' },
    { value: 'retraite', label: 'Départ en retraite' },
    { value: 'autre', label: 'Autre événement' }
  ];

  const statusOptions = [
    { value: 'collecting', label: 'Collecte en cours' },
    { value: 'reviewing', label: 'En relecture' },
    { value: 'generating', label: 'Génération en cours' },
    { value: 'completed', label: 'Terminé' }
  ];

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      
      setFormData({
        name: data.name,
        type: data.type,
        description: data.description || '',
        deadline: data.contribution_deadline,
        status: data.status
      });
    } catch (error) {
      console.error('Erreur chargement projet:', error);
      setError('Impossible de charger le projet');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // Validation
      if (!formData.name.trim()) {
        throw new Error('Le nom du projet est requis');
      }
      if (!formData.type) {
        throw new Error('Le type de projet est requis');
      }
      if (!formData.deadline) {
        throw new Error('La date limite est requise');
      }

      const { error } = await supabase
        .from('projects')
        .update({
          name: formData.name.trim(),
          type: formData.type,
          description: formData.description.trim(),
          contribution_deadline: formData.deadline,
          status: formData.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);

      if (error) throw error;
      
      // Rediriger vers la page de détails du projet
      navigate(`/project/${projectId}`, { 
        state: { message: 'Projet modifié avec succès' } 
      });
    } catch (error) {
      console.error('Erreur modification:', error);
      setError(error.message || 'Erreur lors de la modification');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible.')) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;
      
      navigate('/dashboard', { 
        state: { message: 'Projet supprimé avec succès' } 
      });
    } catch (error) {
      console.error('Erreur suppression:', error);
      setError('Erreur lors de la suppression');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading message="Chargement du projet..." />;
  }

  return (
    <div className="edit-project">
      <div className="edit-project-header">
        <h1>Modifier le projet</h1>
        <button 
          onClick={() => navigate(`/project/${projectId}`)}
          className="btn-secondary"
        >
          Annuler
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="edit-project-form">
        <div className="form-section">
          <h2>Informations générales</h2>
          
          <div className="form-group">
            <label htmlFor="name">Nom du projet *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ex: Départ de Marie"
              required
              maxLength="100"
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="type">Type d'événement *</label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
              disabled={saving}
            >
              <option value="">Sélectionnez un type</option>
              {projectTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Description du projet..."
              rows="4"
              maxLength="500"
              disabled={saving}
            />
            <small className="help-text">
              {formData.description.length}/500 caractères
            </small>
          </div>
        </div>

        <div className="form-section">
          <h2>Dates et statut</h2>

          <div className="form-group">
            <label htmlFor="deadline">Date limite de collecte *</label>
            <input
              type="date"
              id="deadline"
              name="deadline"
              value={formData.deadline}
              onChange={handleChange}
              required
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="status">Statut du projet</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              disabled={saving}
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <div>
            <button 
              type="button"
              onClick={handleDelete}
              className="btn-danger"
              disabled={saving}
            >
              Supprimer le projet
            </button>
          </div>
          <div className="form-actions-right">
            <button 
              type="button"
              onClick={() => navigate(`/project/${projectId}`)}
              className="btn-secondary"
              disabled={saving}
            >
              Annuler
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={saving}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </div>
      </form>

      <style jsx>{`
        .edit-project {
          max-width: 800px;
          margin: 2rem auto;
          padding: 0 2rem;
        }

        .edit-project-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .edit-project-form {
          background: white;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .form-section {
          padding: 2rem;
          border-bottom: 1px solid #dee2e6;
        }

        .form-section:last-child {
          border-bottom: none;
        }

        .form-section h2 {
          font-size: 1.2rem;
          margin-bottom: 1.5rem;
          color: #333;
        }

        .form-actions {
          padding: 1.5rem 2rem;
          background: #f8f9fa;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .form-actions-right {
          display: flex;
          gap: 1rem;
        }

        .btn-danger {
          padding: 0.8rem 1.5rem;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-danger:hover:not(:disabled) {
          background: #c82333;
        }

        .btn-danger:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .alert {
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  );
};

export default EditProject;