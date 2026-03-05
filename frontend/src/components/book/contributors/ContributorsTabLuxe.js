// C:\Users\USER\bookfete\frontend\src\components\book\contributors\ContributorsTabLuxe.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ContributorListLuxe from './ContributorListLuxe';
import AddContributorFormLuxe from './AddContributorFormLuxe';
import '../BookLuxe.css';

const ContributorsTabLuxe = ({ bookId, book, onUpdateBook }) => {
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [updatingSoloMode, setUpdatingSoloMode] = useState(false);

  const isSoloMode = Boolean(book?.cover_config?.soloMode);
  const stats = useMemo(() => {
    const total = contributors.length;
    const invited = contributors.filter((contributor) => contributor.invited).length;
    return {
      total,
      invited,
      pending: Math.max(0, total - invited)
    };
  }, [contributors]);

  const loadContributors = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('book_contributors')
        .select('*')
        .eq('book_id', bookId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContributors(data || []);
    } catch (error) {
      console.error('Erreur chargement contributeurs:', error);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    loadContributors();
    if (!localStorage.getItem('contributors_guide_seen')) {
      setShowWelcome(true);
    }
  }, [loadContributors]);

  const handleAddContributor = async (email, name) => {
    try {
      const { data, error } = await supabase
        .from('book_contributors')
        .insert([{
          book_id: bookId,
          email,
          name: name || email.split('@')[0]
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          alert('Cet email est deja dans la liste');
        } else {
          throw error;
        }
        return;
      }

      setContributors((prev) => [data, ...prev]);
    } catch (error) {
      console.error('Erreur ajout contributeur:', error);
      alert('Erreur lors de l ajout');
    }
  };

  const handleDeleteContributor = async (contributorId) => {
    if (!window.confirm('Supprimer ce contributeur ?')) return;

    try {
      const { error } = await supabase
        .from('book_contributors')
        .delete()
        .eq('id', contributorId);

      if (error) throw error;
      setContributors((prev) => prev.filter((contributor) => contributor.id !== contributorId));
    } catch (error) {
      console.error('Erreur suppression contributeur:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem('contributors_guide_seen', 'true');
  };

  const handleSoloModeChange = async (event) => {
    if (typeof onUpdateBook !== 'function') {
      return;
    }

    const checked = event.target.checked;
    const nextCoverConfig = {
      ...(book?.cover_config || {}),
      soloMode: checked
    };

    setUpdatingSoloMode(true);
    try {
      await onUpdateBook({ cover_config: nextCoverConfig });
    } finally {
      setUpdatingSoloMode(false);
    }
  };

  return (
    <div className="contributors-live">
      {showWelcome && !isSoloMode && (
        <div className="guide-card contributors-guide-card">
          <button onClick={dismissWelcome} className="guide-close" aria-label="Fermer le guide">
            x
          </button>
          <div className="guide-title">Guide contributeurs</div>
          <p className="contributors-guide-intro">
            Ajoutez vos proches ici, puis invitez-les chapitre par chapitre depuis l onglet Chapitres.
          </p>
          <ul className="guide-steps">
            <li>
              <span className="guide-step-icon">1</span>
              <span><strong>Ajoutez les emails</strong> des personnes a inviter.</span>
            </li>
            <li>
              <span className="guide-step-icon">2</span>
              <span><strong>Ouvrez l onglet Chapitres</strong> pour choisir les invites par chapitre.</span>
            </li>
            <li>
              <span className="guide-step-icon">3</span>
              <span><strong>Envoyez les invitations</strong> avec les liens uniques automatiques.</span>
            </li>
            <li>
              <span className="guide-step-icon">4</span>
              <span><strong>Suivez les retours</strong> en moderant les contributions dans le workflow.</span>
            </li>
          </ul>
          <div className="contributors-guide-actions">
            <button onClick={dismissWelcome} className="btn btn-primary">
              Fermer le guide
            </button>
          </div>
        </div>
      )}

      <div className="contributors-live-head">
        <div className="contributors-live-main">
          <div className="label-gold">Espace collaborateurs</div>
          <h2 className="contributors-live-title">Gestion des contributeurs</h2>
          <p className="contributors-live-subtitle">
            Centralisez votre liste d invites puis activez les invitations depuis les chapitres.
          </p>
          {!isSoloMode && (
            <div className="contributors-top-note">
              Ajoutez vos contacts ici, puis selectionnez-les dans chaque chapitre (etape Invitations).
            </div>
          )}
        </div>

        {!isSoloMode && (
          <div className="contributors-live-stats">
            <div className="contributors-stat-pill">
              <span>Total</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="contributors-stat-pill is-invited">
              <span>Invites</span>
              <strong>{stats.invited}</strong>
            </div>
            <div className="contributors-stat-pill is-pending">
              <span>En attente</span>
              <strong>{stats.pending}</strong>
            </div>
          </div>
        )}
      </div>

      <div className={`contributors-solo-card ${isSoloMode ? 'is-enabled' : ''}`}>
        <label className="contributors-solo-toggle">
          <input
            type="checkbox"
            checked={isSoloMode}
            onChange={handleSoloModeChange}
            disabled={updatingSoloMode}
          />
          <span className="contributors-solo-toggle-title">Je souhaite creer le livre seul</span>
        </label>
        <p className="contributors-solo-note">
          En mode solo, les invitations et la liste des contributeurs sont masques.
        </p>
      </div>

      {!isSoloMode && <AddContributorFormLuxe onAdd={handleAddContributor} />}

      {isSoloMode ? (
        <div className="contributors-solo-empty card">
          <h3>Mode solo active</h3>
          <p>
            Les listes de contributeurs, les invitations et les relances sont masquees tant que cette option reste active.
          </p>
        </div>
      ) : loading ? (
        <div className="contributors-loading card">
          <div className="spinner contributors-spinner" />
          <p>Chargement des contributeurs...</p>
        </div>
      ) : (
        <ContributorListLuxe
          contributors={contributors}
          onDelete={handleDeleteContributor}
        />
      )}
    </div>
  );
};

export default ContributorsTabLuxe;
