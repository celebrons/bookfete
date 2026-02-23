// C:\Users\USER\bookfete\frontend\src\components\book\contributors\ContributorsTab.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import ContributorList from './ContributorList';
import AddContributorForm from './AddContributorForm';

const ContributorsTab = ({ bookId }) => {
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    invited: 0,
    pending: 0
  });

  useEffect(() => {
    loadContributors();
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

  return (
    <div style={{
      background: 'white',
      borderRadius: '10px',
      padding: '2rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      {/* En-tête avec stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <h2 style={{ margin: 0, color: '#333' }}>👥 Gestion des contributeurs</h2>
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

      {/* Formulaire d'ajout */}
      <AddContributorForm onAdd={handleAddContributor} />

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
    </div>
  );
};

export default ContributorsTab;