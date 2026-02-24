// C:\Users\USER\bookfete\frontend\src\components\create-book\CreateBookWizard.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Step1Config from './Step1Config';
import Step2Recap from './Step2Recap';

const CreateBookWizard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generatedChapters, setGeneratedChapters] = useState([]);
  
  const queryParams = new URLSearchParams(location.search);
  const eventParam = queryParams.get('event');

  const eventMap = {
    'pot-depart': 'depart',
    'fin-projet': 'projet',
    'mariage': 'mariage',
    'vacances': 'vacances',
    'anniversaire': 'anniversaire',
    'retraite': 'retraite'
  };

  const [bookData, setBookData] = useState({
    title: '',
    event_type: eventParam && eventMap[eventParam] ? eventMap[eventParam] : 'generique',
    finition: 'classique',
    papier: 'mat',
    style_narratif: 'factuel',
    pages: 64,
  });

  useEffect(() => {
    if (eventParam && eventMap[eventParam]) {
      setBookData(prev => ({
        ...prev,
        event_type: eventMap[eventParam]
      }));
    }
  }, [eventParam]);

  // Fonction pour générer les chapitres avec l'IA
  const generateChaptersWithIA = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const chaptersCount = Math.floor(bookData.pages / 8);
      
      const response = await fetch(`${process.env.REACT_APP_API_URL}/ai/generate-chapters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          eventType: bookData.event_type,
          style: bookData.style_narratif,
          count: chaptersCount,
          bookTitle: bookData.title
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur génération IA');
      }

      return data.chapters;
    } catch (error) {
      console.error('❌ Erreur IA, utilisation du fallback:', error);
      // Fallback : génération basique
      return generateFallbackChapters();
    }
  };

  // Fallback si l'IA ne répond pas
  const generateFallbackChapters = () => {
    const baseTitles = {
      generique: [
        'Introduction',
        'Souvenirs marquants',
        'Anecdotes', 
        'Photos',
        'Messages',
        'Conclusion'
      ],
      anniversaire: [
        'Souvenirs d\'enfance',
        'Moments complices',
        'Ce que j\'aime chez toi',
        'Nos meilleurs souvenirs',
        'Messages d\'anniversaire',
        'Vœux pour l\'avenir'
      ],
      mariage: [
        'Leur rencontre',
        'La demande',
        'Les préparatifs',
        'La cérémonie',
        'La fête',
        'Messages aux mariés'
      ],
      naissance: [
        'L\'annonce',
        'L\'attente',
        'L\'arrivée',
        'Premiers moments',
        'Messages de bienvenue',
        'Rêves pour l\'avenir'
      ],
      depart: [
        'Souvenirs partagés',
        'Ce qu\'on retient',
        'Anecdotes',
        'Messages d\'au revoir',
        'Nouveau départ',
        'On n\'oublie pas'
      ],
      projet: [
        'Le début du projet',
        'Les étapes clés',
        'Les défis relevés',
        'Les réussites',
        'L\'équipe',
        'La suite'
      ]
    };

    const titles = baseTitles[bookData.event_type] || baseTitles.generique;
    const chaptersCount = Math.floor(bookData.pages / 8);
    const chapters = [];

    for (let i = 0; i < chaptersCount; i++) {
      const baseIndex = i % titles.length;
      let title = titles[baseIndex];
      
      if (i >= titles.length) {
        const suffix = Math.floor(i / titles.length) + 1;
        title = `${title} ${suffix}`;
      }
      
      chapters.push({
        title: title,
        description: `Chapitre ${i + 1} - À personnaliser`,
        order_index: i
      });
    }
    
    return chapters;
  };

  const handleNext = async () => {
    setLoading(true);
    // Générer les chapitres avec l'IA avant d'afficher l'étape 2
    const chapters = await generateChaptersWithIA();
    setGeneratedChapters(chapters);
    setLoading(false);
    setCurrentStep(2);
    window.scrollTo(0, 0);
  };

  const handlePrevious = () => {
    setCurrentStep(1);
    window.scrollTo(0, 0);
  };

  const handleCreateBook = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        alert('Vous devez être connecté');
        navigate('/login');
        return;
      }

      // 1. Créer le livre SANS les colonnes qui posent problème
      const { data: book, error: bookError } = await supabase
        .from('books')
        .insert([{
          owner_id: user.id,
          title: bookData.title,
          event_type: bookData.event_type,
          finition: bookData.finition,
          papier: bookData.papier,
          style_narratif: bookData.style_narratif,
          pages: bookData.pages,
          statut: 'en_cours'
        }])
        .select()
        .single();

      if (bookError) {
        console.error('❌ Erreur création livre:', bookError);
        throw bookError;
      }

      // 2. Créer les chapitres générés par l'IA
      const { error: chaptersError } = await supabase
        .from('chapters')
        .insert(generatedChapters.map((ch, index) => ({
          book_id: book.id,
          title: ch.title,
          description: ch.description || `Chapitre ${index + 1}`,
          order_index: index,
          questions_ia: [
            `Quel est votre plus beau souvenir lié à "${ch.title}" ?`,
            `Que retenez-vous de ce moment ?`,
            `Quelle émotion cela évoque-t-il ?`,
            `Un détail qui vous a marqué ?`
          ]
        })));

      if (chaptersError) {
        console.error('❌ Erreur création chapitres:', chaptersError);
        throw chaptersError;
      }

      // 3. Mettre à jour avec les configs (optionnel, après création)
      await supabase
        .from('books')
        .update({
          cover_config: {
            title: bookData.title,
            template: 'classic',
            color: '#8B4513',
            font: 'Playfair Display'
          },
          back_cover_config: {
            template: 'classic',
            show_contributors: true,
            color: '#f5f5f5'
          }
        })
        .eq('id', book.id);

      navigate(`/book/${book.id}`);

    } catch (error) {
      console.error('❌ Erreur création:', error);
      alert(`Erreur lors de la création du livre: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = () => {
    const prices = {
      livret: 69,
      classique: 89,
      luxe: 129
    };
    const basePrice = prices[bookData.finition] || 89;
    const extraPages = Math.max(0, bookData.pages - 64);
    const extraCost = extraPages * 0.25;
    return basePrice + extraCost;
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '1000px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden'
      }}>
        {/* En-tête avec progression */}
        <div style={{
          background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
          padding: '2rem',
          color: 'white'
        }}>
          <h1 style={{ margin: '0 0 1rem', fontSize: '2rem' }}>✨ Créez votre livre unique</h1>
          
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '1rem'
          }}>
            {[1, 2].map(step => (
              <div key={step} style={{ flex: 1 }}>
                <div style={{
                  height: '4px',
                  background: currentStep >= step ? 'white' : 'rgba(255,255,255,0.3)',
                  borderRadius: '2px',
                  transition: '0.3s'
                }} />
                <div style={{
                  marginTop: '0.5rem',
                  fontSize: '0.9rem',
                  opacity: currentStep >= step ? 1 : 0.7
                }}>
                  Étape {step}/2
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div style={{ padding: '2rem' }}>
          {currentStep === 1 && (
            <Step1Config
              bookData={bookData}
              setBookData={setBookData}
              onNext={handleNext}
              loading={loading}
            />
          )}

          {currentStep === 2 && (
            <Step2Recap
              bookData={bookData}
              price={getPrice()}
              loading={loading}
              onCreate={handleCreateBook}
              onPrevious={handlePrevious}
              chapters={generatedChapters}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateBookWizard;