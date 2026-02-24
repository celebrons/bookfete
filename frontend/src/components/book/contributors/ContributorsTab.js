// C:\Users\USER\bookfete\frontend\src\components\book\contributors\ContributorsTab.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ContributorList from './ContributorList';
import AddContributorForm from './AddContributorForm';
import GuidedTooltip from '../../ui/GuidedTooltip';

const ContributorsTab = ({ bookId }) => {
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
    // Afficher le message de bienvenue si c'est la première fois
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
    <div style={{
      background: 'white',
      borderRadius: '10px',
      padding: '2rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      position: 'relative'
    }}>
      {/* Message de bienvenue / tutoriel */}
      {showWelcome && (
        <div style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          left: '1rem',
          background: '#f3e8ff',
          border: '2px solid #764ba2',
          borderRadius: '10px',
          padding: '1.5rem',
          marginBottom: '1rem',
          zIndex: 10,
          boxShadow: '0 10px 30px rgba(118,75,162,0.3)'
        }}>
          <button
            onClick={dismissWelcome}
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
              cursor: 'pointer',
              color: '#764ba2'
            }}
          >
            ✕
          </button>
          <h3 style={{ margin: '0 0 1rem', color: '#764ba2' }}>
            🎯 Bienvenue dans la gestion des contributeurs !
          </h3>
          <div style={{ marginBottom: '1rem' }}>
            <p><strong>Voici comment ça marche :</strong></p>
            <ol style={{ marginLeft: '1.5rem' }}>
              <li>📧 <strong>Ajoutez les emails</strong> de toutes les personnes que vous souhaitez inviter</li>
              <li>📋 <strong>Retournez dans l'onglet "Chapitres"</strong></li>
              <li>👥 <strong>Cliquez sur l'icône 👥</strong> à côté d'un chapitre pour choisir qui inviter</li>
              <li>✉️ <strong>Les invitations sont envoyées automatiquement</strong> avec un lien unique</li>
            </ol>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={dismissWelcome}
              style={{
                padding: '0.5rem 2rem',
                background: '#764ba2',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              J'ai compris !
            </button>
          </div>
        </div>
      )}

      {/* En-tête avec stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, color: '#333' }}>👥 Gestion des contributeurs</h2>
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
            <span style={{ color: '#764ba2', cursor: 'help', fontSize: '1.2rem' }}>ⓘ</span>
          </GuidedTooltip>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{
            padding: '0.5rem 1rem',
            background: '#e8f4fd',
            borderRadius: '5px',
            color: '#0c5460'
          }}>
            Total: {stats.total}
          </div>
          <div style={{
            padding: '0.5rem 1rem',
            background: '#d4edda',
            borderRadius: '5px',
            color: '#155724'
          }}>
            Invités: {stats.invited}
          </div>
          <div style={{
            padding: '0.5rem 1rem',
            background: '#fff3cd',
            borderRadius: '5px',
            color: '#856404'
          }}>
            En attente: {stats.pending}
          </div>
        </div>
      </div>

      {/* Formulaire d'ajout avec tooltip */}
      <div style={{ position: 'relative' }}>
        <AddContributorForm onAdd={handleAddContributor} />
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <GuidedTooltip
            title="📧 Ajout d'email"
            description="Ajoutez tous les emails des personnes que vous souhaiteriez inviter. Vous pourrez ensuite décider qui contribue à quel chapitre."
          >
            <span style={{ color: '#666', cursor: 'help' }}>ⓘ</span>
          </GuidedTooltip>
        </div>
      </div>

      {/* Liste des contributeurs */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="spinner" style={{
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #764ba2',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p>Chargement...</p>
        </div>
      ) : (
        <ContributorList
          contributors={contributors}
          onDelete={handleDeleteContributor}
        />
      )}

      {/* Message si la liste est vide */}
      {!loading && contributors.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: '#f8f9fa',
          borderRadius: '10px',
          border: '2px dashed #764ba2',
          marginTop: '2rem'
        }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>👥</span>
          <h3 style={{ color: '#764ba2' }}>Commencez par ajouter des emails !</h3>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Ajoutez les emails de vos proches ci-dessus. Ensuite, rendez-vous dans l'onglet "Chapitres" pour les inviter.
          </p>
          <div style={{
            background: '#f3e8ff',
            padding: '1rem',
            borderRadius: '5px',
            display: 'inline-block'
          }}>
            <strong>🎯 Étape suivante :</strong> Allez dans "Chapitres" et cliquez sur 👥
          </div>
        </div>
      )}
    </div>
  );
};

export default ContributorsTab;