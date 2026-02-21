// C:\Users\USER\bookfete\frontend\src\components\create-book\CreateBookWizard.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { getSuggestionsForBook } from '../../utils/chapterSuggestions';

const CreateBookWizard = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [bookData, setBookData] = useState({
    title: '',
    eventType: 'default',
    finition: 'classique',
    papier: 'mat',
    style: 'factuel'
  });

  const finitions = [
    { id: 'livret', label: 'Livret', icon: '📘', price: 69 },
    { id: 'classique', label: 'Classique', icon: '📕', price: 89 },
    { id: 'luxe', label: 'Luxe', icon: '📚', price: 129 }
  ];

  const papiers = [
    { id: 'satine', label: 'Satiné', icon: '✨', price: 0 },
    { id: 'mat', label: 'Mat', icon: '🎨', price: 0 },
    { id: 'verge', label: 'Vergé Ivoire', icon: '📜', price: 15 }
  ];

  const styles = [
    { id: 'poetique', label: 'Poétique', icon: '🌸' },
    { id: 'factuel', label: 'Factuel', icon: '📰' },
    { id: 'intime', label: 'Intime', icon: '💝' }
  ];

  const eventTypes = [
    { id: 'default', label: 'Générique' },
    { id: 'pot-depart', label: 'Pot de départ' },
    { id: 'mariage', label: 'Mariage' },
    { id: 'anniversaire', label: 'Anniversaire' },
    { id: 'vacances', label: 'Vacances' },
    { id: 'retraite', label: 'Retraite' },
    { id: 'fin-projet', label: 'Fin de projet' }
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

      // Récupérer les suggestions pour ce type d'événement
      const suggestions = getSuggestionsForBook(bookData.eventType);
      
      // Définir le nombre de chapitres en fonction des suggestions
      const chaptersCount = suggestions.chapters.length;

      // Créer le livre
      const { data: book, error } = await supabase
        .from('books')
        .insert([{
          owner_id: user.id,
          title: bookData.title,
          event_type: bookData.eventType,
          finition: bookData.finition,
          papier: bookData.papier,
          style_narratif: bookData.style,
          pages: chaptersCount * 4, // 4 pages par chapitre
          chapters: chaptersCount,
          statut: 'en_cours'
        }])
        .select()
        .single();

      if (error) throw error;

      // Créer les chapitres avec les suggestions
      const chaptersToInsert = suggestions.chapters.map((ch, index) => ({
        book_id: book.id,
        title: ch.title,
        description: ch.description,
        order_index: index,
        questions_ia: suggestions.questions, // Les questions par défaut
        is_default: true // Marquer comme suggestions par défaut
      }));

      await supabase.from('chapters').insert(chaptersToInsert);

      navigate(`/book/${book.id}`);
      
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
        {[1, 2, 3, 4].map(num => (
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
              {num === 1 ? 'Type' : num === 2 ? 'Finition' : num === 3 ? 'Papier' : 'Style'}
            </span>
          </div>
        ))}
      </div>

      {/* Étape 1 : Type d'événement */}
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

          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Type d'événement *
            </label>
            <select
              value={bookData.eventType}
              onChange={(e) => handleChange('eventType', e.target.value)}
              style={{
                width: '100%',
                padding: '1rem',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '1rem'
              }}
            >
              {eventTypes.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
            <p style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
              Les chapitres et questions seront adaptés à votre type d'événement
            </p>
          </div>

          {/* Aperçu des chapitres proposés */}
          <div style={{
            background: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '10px',
            border: '1px solid #dee2e6'
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>
              📖 Chapitres proposés pour {eventTypes.find(t => t.id === bookData.eventType)?.label}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {getSuggestionsForBook(bookData.eventType).chapters.map((ch, idx) => (
                <div key={idx} style={{
                  padding: '0.8rem',
                  background: 'white',
                  borderRadius: '5px',
                  border: '1px solid #e9ecef'
                }}>
                  <strong>{ch.title}</strong>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#666' }}>
                    {ch.description}
                  </p>
                </div>
              ))}
            </div>
            <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', color: '#666', fontStyle: 'italic' }}>
              Vous pourrez modifier ces chapitres et leurs questions après la création
            </p>
          </div>
        </div>
      )}

      {/* Étape 2 : Finition */}
      {step === 2 && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
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
                <p style={{ fontWeight: 'bold', color: '#764ba2' }}>{f.price}€</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Étape 3 : Papier */}
      {step === 3 && (
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
                <p style={{ fontWeight: 'bold', color: p.price > 0 ? '#764ba2' : '#28a745' }}>
                  {p.price > 0 ? `+${p.price}€` : 'Inclus'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Étape 4 : Style narratif */}
      {step === 4 && (
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
            <p>Titre : <strong>{bookData.title}</strong></p>
            <p>Type : {eventTypes.find(t => t.id === bookData.eventType)?.label}</p>
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
        
        {step < 4 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && (!bookData.title || !bookData.eventType)}
            style={{
              padding: '1rem 2rem',
              background: (step === 1 && (!bookData.title || !bookData.eventType)) ? '#ccc' : '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: (step === 1 && (!bookData.title || !bookData.eventType)) ? 'not-allowed' : 'pointer',
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