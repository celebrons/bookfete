// C:\Users\USER\bookfete\frontend\src\components\book\contributors\ContributorsTabLuxe.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ContributorListLuxe from './ContributorListLuxe';
import AddContributorFormLuxe from './AddContributorFormLuxe';
import GuidedTooltip from '../../ui/GuidedTooltip';
import '../BookLuxe.css';

const ContributorsTabLuxe = ({ bookId }) => {
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    invited: 0,
    pending: 0
  });

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

  return (
    <div className="card" style={{ position: 'relative', minHeight: '500px' }}>
      {/* Message de bienvenue / tutoriel */}
      {showWelcome && (
        <div className="guide-card" style={{ top: 'var(--space-lg)', left: 'var(--space-lg)', right: 'var(--space-lg)' }}>
          <button onClick={dismissWelcome} className="guide-close">✕</button>
          <div className="guide-title">🎯 Bienvenue dans la gestion des contributeurs !</div>
          <p><strong>Voici comment ça marche :</strong></p>
          <ul className="guide-steps">
            <li>📧 <strong>Ajoutez les emails</strong> de toutes les personnes que vous souhaitez inviter</li>
            <li>📋 <strong>Retournez dans l'onglet "Chapitres"</strong></li>
            <li>👥 <strong>Cliquez sur l'icône 👥</strong> à côté d'un chapitre pour choisir qui inviter</li>
            <li>✉️ <strong>Les invitations sont envoyées automatiquement</strong> avec un lien unique</li>
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={dismissWelcome} className="btn btn-primary">
              J'ai compris !
            </button>
          </div>
        </div>
      )}

      {/* En-tête avec stats */}
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

      {/* Formulaire d'ajout */}
      <AddContributorFormLuxe onAdd={handleAddContributor} />

      {/* Liste des contributeurs */}
      {loading ? (
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