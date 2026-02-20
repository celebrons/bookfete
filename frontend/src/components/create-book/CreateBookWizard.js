// C:\Users\USER\bookfete\frontend\src\components\create-book\CreateBookWizard.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const CreateBookWizard = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [bookData, setBookData] = useState({
    title: '',
    finition: 'classique',
    papier: 'mat',
    style: 'factuel'
  });

  // Options disponibles
  const finitions = [
    { id: 'livret', label: 'Livret', description: 'Couverture souple, léger', icon: '📘', price: 69 },
    { id: 'classique', label: 'Classique', description: 'Couverture rigide, élégante', icon: '📕', price: 89 },
    { id: 'luxe', label: 'Luxe', description: 'Toile, finition premium', icon: '📚', price: 129 }
  ];

  const papiers = [
    { id: 'satine', label: 'Satiné', description: 'Brillant, couleurs éclatantes', icon: '✨', price: 0 },
    { id: 'mat', label: 'Mat', description: 'Sans reflet, aspect naturel', icon: '🎨', price: 0 },
    { id: 'verge', label: 'Vergé Ivoire', description: 'Papier texturé, aspect ancien', icon: '📜', price: 15 }
  ];

  const styles = [
    { id: 'poetique', label: 'Poétique', description: 'Lyrique, émouvant, imagé', icon: '🌸' },
    { id: 'factuel', label: 'Factuel', description: 'Précis, direct, journalistique', icon: '📰' },
    { id: 'intime', label: 'Intime', description: 'Personnel, chaleureux, confidentiel', icon: '💝' }
  ];

  const handleChange = (field, value) => {
    setBookData(prev => ({ ...prev, [field]: value }));
  };

  const calculatePrice = () => {
    const finition = finitions.find(f => f.id === bookData.finition)?.price || 89;
    const papier = papiers.find(p => p.id === bookData.papier)?.price || 0;
    return finition + papier;
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Non authentifié');

      const { data, error } = await supabase
        .from('books')
        .insert([{
          owner_id: user.id,
          title: bookData.title,
          finition: bookData.finition,
          papier: bookData.papier,
          style_narratif: bookData.style,
          statut: 'en_cours'
        }])
        .select()
        .single();

      if (error) throw error;

      // Créer automatiquement quelques chapitres par défaut
      const chapitresParDefaut = [
        { title: 'Introduction', order_index: 0 },
        { title: 'Souvenirs', order_index: 1 },
        { title: 'Messages', order_index: 2 },
        { title: 'Photos', order_index: 3 },
        { title: 'Conclusion', order_index: 4 }
      ];

      const chaptersToInsert = chapitresParDefaut.map(ch => ({
        book_id: data.id,
        title: ch.title,
        description: '',
        order_index: ch.order_index,
        questions_ia: []
      }));

      await supabase.from('chapters').insert(chaptersToInsert);

      navigate(`/book/${data.id}`);
      
    } catch (error) {
      console.error('❌ Erreur création livre:', error);
      alert('Erreur lors de la création du livre');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Créez votre livre unique</h1>

      {/* Indicateur d'étape */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '2rem',
        marginBottom: '3rem'
      }}>
        {[1, 2, 3].map(num => (
          <div key={num} style={{ textAlign: 'center' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: step >= num ? '#764ba2' : '#e9ecef',
              color: step >= num ? 'white' : '#333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              marginBottom: '0.5rem'
            }}>
              {num}
            </div>
            <span style={{ fontSize: '0.9rem', color: step >= num ? '#764ba2' : '#666' }}>
              {num === 1 ? 'Finition' : num === 2 ? 'Papier' : 'Style'}
            </span>
          </div>
        ))}
      </div>

      {/* Étape 1 : Titre + Finition */}
      {step === 1 && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Titre de votre livre *
            </label>
            <input
              type="text"
              value={bookData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Ex: Les 60 ans de Maman, Notre Mariage..."
              style={{
                width: '100%',
                padding: '1rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem'
              }}
              required
            />
          </div>

          <h3 style={{ marginBottom: '1.5rem' }}>Choisissez la finition</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            {finitions.map(f => (
              <div
                key={f.id}
                onClick={() => handleChange('finition', f.id)}
                style={{
                  padding: '1.5rem',
                  background: bookData.finition === f.id ? '#f3e8ff' : 'white',
                  border: bookData.finition === f.id ? '2px solid #764ba2' : '1px solid #ddd',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{f.icon}</div>
                <h4 style={{ margin: '0 0 0.5rem' }}>{f.label}</h4>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>{f.description}</p>
                <p style={{ fontWeight: 'bold', color: '#764ba2' }}>{f.price}€</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Étape 2 : Papier */}
      {step === 2 && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Choisissez votre papier</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            {papiers.map(p => (
              <div
                key={p.id}
                onClick={() => handleChange('papier', p.id)}
                style={{
                  padding: '1.5rem',
                  background: bookData.papier === p.id ? '#f3e8ff' : 'white',
                  border: bookData.papier === p.id ? '2px solid #764ba2' : '1px solid #ddd',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{p.icon}</div>
                <h4 style={{ margin: '0 0 0.5rem' }}>{p.label}</h4>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>{p.description}</p>
                <p style={{ fontWeight: 'bold', color: p.price > 0 ? '#764ba2' : '#28a745' }}>
                  {p.price > 0 ? `+${p.price}€` : 'Inclus'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Étape 3 : Style narratif */}
      {step === 3 && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Choisissez le style narratif</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            {styles.map(s => (
              <div
                key={s.id}
                onClick={() => handleChange('style', s.id)}
                style={{
                  padding: '1.5rem',
                  background: bookData.style === s.id ? '#f3e8ff' : 'white',
                  border: bookData.style === s.id ? '2px solid #764ba2' : '1px solid #ddd',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{s.icon}</div>
                <h4 style={{ margin: '0 0 0.5rem' }}>{s.label}</h4>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>{s.description}</p>
              </div>
            ))}
          </div>

          {/* Résumé et prix */}
          <div style={{
            background: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '10px',
            marginTop: '2rem'
          }}>
            <h4>Récapitulatif</h4>
            <p>Titre : <strong>{bookData.title || 'À définir'}</strong></p>
            <p>Finition : {finitions.find(f => f.id === bookData.finition)?.label}</p>
            <p>Papier : {papiers.find(p => p.id === bookData.papier)?.label}</p>
            <p>Style : {styles.find(s => s.id === bookData.style)?.label}</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '1rem' }}>
              Prix total : {calculatePrice()}€
            </p>
          </div>
        </div>
      )}

      {/* Boutons de navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '2rem'
      }}>
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              padding: '1rem 2rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            ← Précédent
          </button>
        )}
        
        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && !bookData.title}
            style={{
              padding: '1rem 2rem',
              background: step === 1 && !bookData.title ? '#ccc' : '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: step === 1 && !bookData.title ? 'not-allowed' : 'pointer',
              marginLeft: 'auto'
            }}
          >
            Suivant →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '1rem 2rem',
              background: loading ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              marginLeft: 'auto'
            }}
          >
            {loading ? 'Création...' : 'Créer mon livre'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default CreateBookWizard;