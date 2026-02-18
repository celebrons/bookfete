// frontend/src/components/contributeur/ContributePage.js
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ContributionForm from './ContributionForm';
import EditContributionForm from './EditContributionForm';
import './Contributeur.css';

const ContributePage = () => {
  const { token } = useParams();
  const [project, setProject] = useState(null);
  const [invite, setInvite] = useState(null);
  const [contribution, setContribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('create');
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    checkContribution();
  }, [token]);

  const checkContribution = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${process.env.REACT_APP_API_URL}/contribute/${token}/edit`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          fetchContributionPage();
          return;
        }
        throw new Error(data.error || 'Erreur');
      }

      const today = new Date();
      const deadline = new Date(data.project?.contribution_deadline || data.invite?.project?.contribution_deadline);
      if (deadline < today) {
        setDeadlinePassed(true);
      }

      if (data.exists) {
        setMode('edit');
        setProject(data.project);
        setInvite(data.invite);
        setContribution(data.contribution);
      } else {
        setMode('create');
        setProject(data.project);
        setInvite(data.invite);
      }
      
    } catch (err) {
      console.error('Erreur:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchContributionPage = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/contribute/${token}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Lien invalide ou expiré');
      }

      const today = new Date();
      const deadline = new Date(data.project?.contribution_deadline);
      if (deadline < today) {
        setDeadlinePassed(true);
      }

      if (data.message === 'Vous avez déjà contribué') {
        setMode('edit');
        setInvite(data.invite);
        setProject(data.invite.project);
      } else {
        setMode('create');
        setInvite(data);
        setProject(data.project);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleContributionSuccess = (data) => {
    if (mode === 'create') {
      setMode('edit');
      if (data.contribution) {
        setContribution(data.contribution);
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) return <div className="loading">Chargement...</div>;
  if (error) return (
    <div className="error-container">
      <h2>😕 Oups !</h2>
      <p>{error}</p>
      <p>Vérifiez votre lien d'invitation ou contactez l'organisateur.</p>
    </div>
  );

  if (!project) return <div className="loading">Chargement...</div>;

  const daysLeft = Math.ceil(
    (new Date(project.contribution_deadline) - new Date()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="contribute-container">
      <div className="project-info">
        {project.cover_image_url && (
          <img src={project.cover_image_url} alt={project.name} className="project-cover" />
        )}
        <h1>{project.name}</h1>
        <p className="project-description">{project.description}</p>
        <div className="project-meta">
          <span className="deadline">
            ⏰ Date limite : {formatDate(project.contribution_deadline)}
            {daysLeft > 0 && !deadlinePassed && (
              <span className="days-left"> ({daysLeft} jours restants)</span>
            )}
            {deadlinePassed && (
              <span className="days-left" style={{ color: '#dc3545' }}> (Date dépassée)</span>
            )}
          </span>
        </div>
      </div>

      {deadlinePassed ? (
        <div className="deadline-passed-message">
          <h3>⏰ Date limite dépassée</h3>
          <p>La date limite de contribution est dépassée. Vous ne pouvez plus ajouter ou modifier votre contribution.</p>
        </div>
      ) : (
        mode === 'create' ? (
          <ContributionForm 
            token={token} 
            onSuccess={handleContributionSuccess}
            maxPhotos={5}
            deadline={project.contribution_deadline}
          />
        ) : (
          <EditContributionForm 
            token={token}
            initialContribution={contribution}
            onSuccess={() => {}}
            maxPhotos={5}
            deadline={project.contribution_deadline}
          />
        )
      )}
    </div>
  );
};

export default ContributePage;