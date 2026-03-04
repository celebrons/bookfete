// C:\Users\USER\bookfete\frontend\src\components\book\contributors\ContributorsTabLuxe.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ContributorListLuxe from './ContributorListLuxe';
import AddContributorFormLuxe from './AddContributorFormLuxe';
import GuidedTooltip from '../../ui/GuidedTooltip';
import '../BookLuxe.css';

const ContributorsTabLuxe = ({ bookId, book, onUpdateBook }) => {
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [updatingSoloMode, setUpdatingSoloMode] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    invited: 0,
    pending: 0
  });

  const isSoloMode = Boolean(book?.cover_config?.soloMode);

  useEffect(() => {
    loadContributors();
    if (!localStorage.getItem('contributors_guide_seen')) {
      setShowWelcome(true);
    }
  }, [bookId]);

  const loadContributors = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('book_contributors')
        .select('*')
        .eq('book_id', bookId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setContributors(data || []);
      
      const total = data.length;
      const invited = data.filter(c => c.invited).length;
      setStats({ total, invited, pending: total - invited });

    } catch (error) {
      console.error('❌ Erreur chargement contributeurs:', error);
    } finally {
      setLoading(false);
    }
  };

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
          alert('Cet email est déjà dans la liste');
        } else {
          throw error;
        }
        return;
      }

      setContributors(prev => [data, ...prev]);
    } catch (error) {
      console.error('❌ Erreur ajout:', error);
      alert('Erreur lors de l\'ajout');
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

      setContributors(prev => prev.filter(c => c.id !== contributorId));
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
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
    <div className="card" style={{ position: 'relative', minHeight: '500px' }}>
      {/* Message de bienvenue / tutoriel - VERSION STYLISÉE */}
      {showWelcome && !isSoloMode && (
        <div className="guide-card">
          <button onClick={dismissWelcome} className="guide-close">✕</button>
          <div className="guide-title">🎯 Bienvenue dans la gestion des contributeurs !</div>
          
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <p style={{ fontWeight: '600', marginBottom: 'var(--space-sm)' }}>
              Voici comment ça marche :
            </p>
            <ul className="guide-steps">
              <li>
                <span className="guide-step-icon">📧</span>
                <span><strong>Ajoutez les emails</strong> de toutes les personnes que vous souhaitez inviter</span>
              </li>
              <li>
                <span className="guide-step-icon">📋</span>
                <span><strong>Retournez dans l'onglet "Chapitres"</strong></span>
              </li>
              <li>
                <span className="guide-step-icon">👥</span>
                <span><strong>Cliquez sur l'icône 👥</strong> à côté d'un chapitre pour choisir qui inviter</span>
              </li>
              <li>
                <span className="guide-step-icon">✉️</span>
                <span><strong>Les invitations sont envoyées automatiquement</strong> avec un lien unique</span>
              </li>
            </ul>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={dismissWelcome} className="btn btn-primary">
              J'ai compris !
            </button>
          </div>
        </div>
      )}

      <div
        className="card"
        style={{
          marginBottom: 'var(--space-xl)',
          background: isSoloMode ? '#eef6ee' : 'var(--white)',
          borderColor: isSoloMode ? '#d5e8d4' : 'var(--mist)'
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            cursor: updatingSoloMode ? 'wait' : 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={isSoloMode}
            onChange={handleSoloModeChange}
            disabled={updatingSoloMode}
          />
          <span style={{ fontWeight: '600', color: 'var(--ink)' }}>
            Je souhaite créer le livre seul
          </span>
        </label>
        <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-light)' }}>
          En mode solo, tout ce qui concerne les contributeurs et les invitations est masqué.
        </p>
      </div>

      {/* En-tête avec stats */}
      {!isSoloMode && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '600' }}>👥 Gestion des contributeurs</h2>
          <GuidedTooltip
            title="📋 Comment ça marche ?"
            description="Suivez ces étapes pour inviter vos proches :"
            steps={[
              "Ajoutez les emails ci-dessous",
              "Allez dans l'onglet Chapitres",
              "Cliquez sur 👥 pour choisir qui inviter par chapitre",
              "Les invitations sont envoyées automatiquement"
            ]}
          >
            <span style={{ color: 'var(--gold)', cursor: 'help' }}>ⓘ</span>
          </GuidedTooltip>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <span className="stat-detail-item" style={{ background: 'var(--silk)', padding: '4px 12px', borderRadius: 'var(--radius)' }}>
            Total: {stats.total}
          </span>
          <span className="stat-detail-item" style={{ background: 'var(--gold-light)', color: 'var(--gold)', padding: '4px 12px', borderRadius: 'var(--radius)' }}>
            Invités: {stats.invited}
          </span>
          <span className="stat-detail-item" style={{ background: '#fff3cd', color: '#856404', padding: '4px 12px', borderRadius: 'var(--radius)' }}>
            En attente: {stats.pending}
          </span>
        </div>
      </div>
      )}

      {/* Formulaire d'ajout */}
      {!isSoloMode && <AddContributorFormLuxe onAdd={handleAddContributor} />}

      {/* Liste des contributeurs */}
      {isSoloMode ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            background: '#fcfbf8',
            borderColor: 'var(--mist)'
          }}
        >
          <h3 style={{ marginTop: 0 }}>Mode solo activé</h3>
          <p style={{ margin: 0, color: 'var(--text-light)' }}>
            Les listes de contributeurs, les invitations et les relances sont masquées tant que cette option reste cochée.
          </p>
        </div>
      ) : loading ? (
        <div className="empty-state">
          <div className="spinner" style={{
            border: '2px solid var(--mist)',
            borderTop: '2px solid var(--gold)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto var(--space-md)'
          }} />
          <p>Chargement...</p>
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
