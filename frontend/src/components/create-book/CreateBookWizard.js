// C:\Users\USER\bookfete\frontend\src\components\create-book\CreateBookWizard.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Step1Type from './Step1Type';
import Step2Finition from './Step2Finition';
import Step3Recap from './Step3Recap';

const CreateBookWizard = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Données du livre
  const [bookData, setBookData] = useState({
    title: '',
    event_type: 'generique',
    finition: 'classique',
    papier: 'mat',
    style_narratif: 'factuel',
    pages: 96,
    chapters: 24
  });

  // Templates de chapitres par type d'événement
  const chapterTemplates = {
    generique: [
      { title: 'Introduction', description: 'Présentation et premiers souvenirs' },
      { title: 'Souvenirs marquants', description: 'Les moments inoubliables' },
      { title: 'Anecdotes', description: 'Les petites histoires qui font sourire' },
      { title: 'Photos', description: 'Les images qui parlent' },
      { title: 'Messages', description: 'Les mots du cœur' },
      { title: 'Conclusion', description: 'Pour finir en beauté' }
    ],
    anniversaire: [
      { title: 'Souvenirs d\'enfance', description: 'Les premières années' },
      { title: 'Moments complices', description: 'Les fêtes partagées' },
      { title: 'Ce que j\'aime chez toi', description: 'Les qualités qui comptent' },
      { title: 'Nos meilleurs souvenirs', description: 'Les moments gravés' },
      { title: 'Messages d\'anniversaire', description: 'Les mots doux' },
      { title: 'Vœux pour l\'avenir', description: 'Ce qu\'on te souhaite' }
    ],
    mariage: [
      { title: 'Leur rencontre', description: 'Comment ils se sont connus' },
      { title: 'La demande', description: 'Le moment magique' },
      { title: 'Les préparatifs', description: 'L\'avant-grand jour' },
      { title: 'La cérémonie', description: 'Le jour J' },
      { title: 'La fête', description: 'Les moments de joie' },
      { title: 'Messages aux mariés', description: 'Vœux de bonheur' }
    ],
    naissance: [
      { title: 'L\'annonce', description: 'Quand on a su' },
      { title: 'L\'attente', description: 'Les mois avant' },
      { title: 'L\'arrivée', description: 'Le grand jour' },
      { title: 'Premiers moments', description: 'Les premières fois' },
      { title: 'Messages de bienvenue', description: 'Ce qu\'on vous souhaite' },
      { title: 'Rêves pour l\'avenir', description: 'Pour bébé' }
    ],
    depart: [
      { title: 'Souvenirs partagés', description: 'Les meilleurs moments' },
      { title: 'Ce qu\'on retient', description: 'Les qualités' },
      { title: 'Anecdotes', description: 'Les histoires drôles' },
      { title: 'Messages d\'au revoir', description: 'Les mots du cœur' },
      { title: 'Nouveau départ', description: 'Vœux pour la suite' },
      { title: 'On n\'oublie pas', description: 'Pour garder le lien' }
    ]
  };

  const handleNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
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

      // 1. Créer le livre
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
          chapters: bookData.chapters,
          statut: 'en_cours',
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
        }])
        .select()
        .single();

      if (bookError) throw bookError;

      // 2. Créer les chapitres à partir du template
      const templates = chapterTemplates[bookData.event_type] || chapterTemplates.generique;
      const chaptersToCreate = templates.map((ch, index) => ({
        book_id: book.id,
        title: ch.title,
        description: ch.description,
        order_index: index,
        questions_ia: [
          `Quel est votre plus beau souvenir lié à "${ch.title}" ?`,
          `Que retenez-vous de ce moment ?`,
          `Quelle émotion cela évoque-t-il ?`,
          `Un détail qui vous a marqué ?`
        ]
      }));

      const { error: chaptersError } = await supabase
        .from('chapters')
        .insert(chaptersToCreate);

      if (chaptersError) throw chaptersError;

      // 3. Rediriger vers le livre
      navigate(`/book/${book.id}`);

    } catch (error) {
      console.error('❌ Erreur création:', error);
      alert('Erreur lors de la création du livre');
    } finally {
      setLoading(false);
    }
  };

  // Prix selon finition
  const getPrice = () => {
    const prices = {
      livret: 69,
      classique: 89,
      luxe: 129
    };
    return prices[bookData.finition] || 89;
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
          
          {/* Barre de progression */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '1rem'
          }}>
            {[1, 2, 3].map(step => (
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
                  Étape {step}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div style={{ padding: '2rem' }}>
          {currentStep === 1 && (
            <Step1Type
              bookData={bookData}
              setBookData={setBookData}
              chapterTemplates={chapterTemplates}
              onNext={handleNext}
            />
          )}

          {currentStep === 2 && (
            <Step2Finition
              bookData={bookData}
              setBookData={setBookData}
              price={getPrice()}
              onNext={handleNext}
              onPrevious={handlePrevious}
            />
          )}

          {currentStep === 3 && (
            <Step3Recap
              bookData={bookData}
              price={getPrice()}
              loading={loading}
              onCreate={handleCreateBook}
              onPrevious={handlePrevious}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateBookWizard;