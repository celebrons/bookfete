// C:\Users\USER\bookfete\frontend\src\components\create-book\CreateBookWizardLuxe.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Step1ConfigLuxe from './Step1ConfigLuxe';
import Step2RecapLuxe from './Step2RecapLuxe';
import '../../styles/luxe-theme.css';
import './CreateBookLuxe.css';

const CreateBookWizardLuxe = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generatedChapters, setGeneratedChapters] = useState([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // Récupérer les paramètres de l'URL
  const queryParams = new URLSearchParams(location.search);
  const eventParam = queryParams.get('event');
  const nameParam = queryParams.get('name');
  const ageParam = queryParams.get('age');
  const genderParam = queryParams.get('gender');
  const titleParam = queryParams.get('title');

  const eventMap = {
    'pot-depart': 'depart',
    'fin-projet': 'projet',
    'mariage': 'mariage',
    'vacances': 'vacances',
    'anniversaire': 'anniversaire',
    'retraite': 'retraite'
  };

  const eventLabels = {
    'pot-depart': 'Pot de départ',
    'fin-projet': 'Fin de projet',
    'mariage': 'Mariage',
    'vacances': 'Vacances',
    'anniversaire': 'Anniversaire',
    'retraite': 'Départ en retraite',
    'generique': 'Événement',
    'depart': 'Départ',
    'projet': 'Fin de projet'
  };

  const [bookData, setBookData] = useState({
    title: titleParam || '',
    event_type: eventParam && eventMap[eventParam] ? eventMap[eventParam] : 'generique',
    event_param: eventParam || '',
    recipient_name: nameParam || '',
    recipient_age: ageParam || '',
    recipient_gender: genderParam || '',
    finition: 'classique',
    papier: 'mat',
    style_narratif: 'factuel',
    pages: 64,
  });

  // ============================================
  // GESTION DE LA REPRISE APRÈS CONNEXION
  // ============================================
  
  useEffect(() => {
    if (location.state?.fromLogin && location.state?.bookData) {
      console.log('📦 Données reçues après connexion:', location.state.bookData);
      setBookData(location.state.bookData);
      if (location.state.chapters?.length > 0) {
        setGeneratedChapters(location.state.chapters);
        setCurrentStep(2);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    const savedData = localStorage.getItem('pendingBookData');
    const savedChapters = localStorage.getItem('pendingChapters');
    
    if (savedData && !location.state?.fromLogin) {
      console.log('📦 Chargement des données sauvegardées');
      setBookData(JSON.parse(savedData));
    }
    if (savedChapters && !location.state?.fromLogin) {
      setGeneratedChapters(JSON.parse(savedChapters));
      if (JSON.parse(savedChapters).length > 0) {
        setCurrentStep(2);
      }
    }
  }, []);

  useEffect(() => {
    if (bookData.recipient_name || bookData.title) {
      localStorage.setItem('pendingBookData', JSON.stringify(bookData));
    }
  }, [bookData]);

  useEffect(() => {
    if (generatedChapters.length > 0) {
      localStorage.setItem('pendingChapters', JSON.stringify(generatedChapters));
    }
  }, [generatedChapters]);

  // ============================================
  // FONCTIONS DE GÉNÉRATION IA
  // ============================================

  const generateChaptersWithIA = async () => {
    try {
      const chaptersCount = Math.floor(bookData.pages / 8);
      
      const prompt = `Génère ${chaptersCount} titres de chapitres pour un livre souvenir personnalisé.

Contexte détaillé :
- Type d'événement : ${eventLabels[bookData.event_type] || 'Événement'}
- Titre du livre : ${bookData.title || `Livre pour ${bookData.recipient_name}`}
- Personne célébrée : ${bookData.recipient_name || 'la personne'}
- Âge : ${bookData.recipient_age || 'non spécifié'} ans
- Sexe : ${bookData.recipient_gender || 'non spécifié'}
- Style narratif : ${bookData.style_narratif || 'intime'}

IMPORTANT : Les titres doivent être adaptés à :
- L'âge de ${bookData.recipient_name || 'la personne'} (${bookData.recipient_age || '?'} ans)
- Son genre (${bookData.recipient_gender || 'non spécifié'})
- Le type d'événement (${eventLabels[bookData.event_type]})

Exemples adaptés :
- Pour une femme de 30 ans : "Souvenirs de jeunesse de [Prénom]", "Ce que j'admire chez elle"
- Pour un homme de 60 ans : "Les souvenirs d'une vie", "Ce qu'il nous a appris"
- Pour un enfant : "Ses premiers pas", "Nos fêtes avec lui/elle"

Les titres doivent être :
- Créatifs et originaux
- Variés (souvenirs, anecdotes, messages, photos, émotions)
- Rédigés en français
- Longueur : entre 3 et 8 mots maximum
- Évocateurs et donnant envie d'écrire

Réponds UNIQUEMENT avec un tableau JSON de ${chaptersCount} chaînes de caractères.
Format exact : ["Titre 1", "Titre 2", "Titre 3", ...]`;

      console.log('📤 Envoi à l\'IA sans authentification');

      const response = await fetch(`${process.env.REACT_APP_API_URL}/ai/generate-chapters-public`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventType: bookData.event_type,
          style: bookData.style_narratif,
          count: chaptersCount,
          bookTitle: bookData.title,
          recipientName: bookData.recipient_name,
          recipientAge: bookData.recipient_age,
          recipientGender: bookData.recipient_gender,
          prompt: prompt
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur génération IA');
      }

      console.log('✅ Chapitres générés par l\'IA:', data.chapters);
      return data.chapters;
    } catch (error) {
      console.error('❌ Erreur IA, utilisation du fallback:', error);
      return generateFallbackChapters();
    }
  };

  const generateFallbackChapters = () => {
    const name = bookData.recipient_name || 'la personne';
    const age = bookData.recipient_age ? parseInt(bookData.recipient_age) : null;
    const gender = bookData.recipient_gender;
    const chaptersCount = Math.floor(bookData.pages / 8);
    const chapters = [];

    let agePrefix = '';
    if (age) {
      if (age < 18) agePrefix = "d'enfance";
      else if (age < 30) agePrefix = "de jeunesse";
      else if (age < 50) agePrefix = "de vie";
      else agePrefix = "d'une vie";
    }

    const possessive = gender === 'femme' ? 'sa' : gender === 'homme' ? 'son' : 'sa';

    const baseTitles = {
      generique: [
        `Souvenirs avec ${name}`,
        `Moments avec ${name}`,
        `Ce que j'aime chez ${name}`,
        `Messages pour ${name}`,
        `Photos de ${name}`,
        `Vœux pour ${name}`
      ],
      anniversaire: [
        `Souvenirs ${agePrefix} de ${name}`,
        `Nos moments avec ${name}`,
        `Ce que j'aime chez ${name}`,
        `Nos meilleurs souvenirs avec ${name}`,
        `Messages pour ${name}`,
        `Vœux pour ${name}`
      ],
      mariage: [
        `Leur rencontre`,
        `La demande`,
        `Les préparatifs`,
        `La cérémonie`,
        `La fête`,
        `Messages pour ${name}`
      ],
      naissance: [
        `L'annonce de ${name}`,
        `L'attente de ${name}`,
        `L'arrivée de ${name}`,
        `Premiers moments avec ${name}`,
        `Messages pour ${name}`,
        `Rêves pour ${name}`
      ],
      depart: [
        `Souvenirs avec ${name}`,
        `Ce qu'on retient de ${name}`,
        `Anecdotes avec ${name}`,
        `Messages pour ${name}`,
        `Nouveau départ pour ${name}`,
        `On n'oublie pas ${name}`
      ],
      projet: [
        'Le début du projet',
        'Les étapes clés',
        'Les défis relevés',
        'Les réussites',
        `Messages pour ${name}`,
        'La suite'
      ]
    };

    const titles = baseTitles[bookData.event_type] || baseTitles.generique;

    for (let i = 0; i < chaptersCount; i++) {
      const baseIndex = i % titles.length;
      let title = titles[baseIndex];
      
      if (i >= titles.length) {
        const suffix = Math.floor(i / titles.length) + 1;
        title = `${title} ${suffix}`;
      }
      
      chapters.push({
        title: title,
        description: `Chapitre ${i + 1} - Partagez vos souvenirs`,
        order_index: i
      });
    }
    
    return chapters;
  };

  // ============================================
  // FONCTIONS DE NAVIGATION
  // ============================================

  const handleNextFromDestinataire = () => {
    setCurrentStep(1);
    window.scrollTo(0, 0);
  };

  const handleNextToRecap = async () => {
    setLoading(true);
    const chapters = await generateChaptersWithIA();
    setGeneratedChapters(chapters);
    setLoading(false);
    setCurrentStep(2);
    window.scrollTo(0, 0);
  };

  const handlePreviousFromRecap = () => {
    setCurrentStep(1);
    window.scrollTo(0, 0);
  };

  const handlePreviousFromConfig = () => {
    setCurrentStep(0);
    window.scrollTo(0, 0);
  };

  // ============================================
  // CRÉATION DU LIVRE
  // ============================================

  const handleCreateBook = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      localStorage.setItem('returnTo', '/create-book' + location.search);
      setShowLoginModal(true);
      return;
    }
    
    proceedWithCreation(user);
  };

  const proceedWithCreation = async (user) => {
    setLoading(true);
    try {
      console.log('📦 Création du livre avec les données:', bookData);
      console.log('📦 Chapitres à créer:', generatedChapters);

      const { data: book, error: bookError } = await supabase
        .from('books')
        .insert([{
          owner_id: user.id,
          title: bookData.title,
          event_type: bookData.event_type,
          recipient_name: bookData.recipient_name,
          recipient_age: bookData.recipient_age,
          recipient_gender: bookData.recipient_gender,
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

      console.log('✅ Livre créé avec ID:', book.id);

      const chaptersToInsert = generatedChapters.map((ch, index) => ({
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
      }));

      const { error: chaptersError } = await supabase
        .from('chapters')
        .insert(chaptersToInsert);

      if (chaptersError) {
        console.error('❌ Erreur création chapitres:', chaptersError);
        throw chaptersError;
      }

      console.log(`✅ ${generatedChapters.length} chapitres créés`);

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

      localStorage.removeItem('pendingBookData');
      localStorage.removeItem('pendingChapters');
      localStorage.removeItem('returnTo');

      console.log('🎉 Livre créé avec succès, redirection vers:', `/book/${book.id}`);
      
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

  // ============================================
  // ÉTAPE 0 : FORMULAIRE DESTINATAIRE
  // ============================================
  
  if (currentStep === 0) {
    return (
      <div className="wizard-container">
        <div className="wizard-card">
          <div className="wizard-header">
            {eventParam && (
              <span className="event-badge">
                {eventLabels[eventParam] || 'Événement'}
              </span>
            )}
            <h1>Créez votre livre unique</h1>
            <div className="progress-steps">
              {[1, 2].map(step => (
                <div key={step} className="progress-step">
                  <div className={`progress-bar ${currentStep >= step - 1 ? 'active' : ''}`} />
                  <div className={`progress-label ${currentStep >= step - 1 ? 'active' : ''}`}>
                    Étape {step}/2
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="wizard-content">
            <h2 className="form-title">Qui est le destinataire ?</h2>
            
            <form onSubmit={(e) => { e.preventDefault(); handleNextFromDestinataire(); }}>
              <div className="form-group">
                <label>Prénom / Nom <span style={{ color: 'var(--gold)' }}>*</span></label>
                <input
                  type="text"
                  value={bookData.recipient_name}
                  onChange={(e) => setBookData({ ...bookData, recipient_name: e.target.value })}
                  placeholder="Ex: Yani, Gégé, Marie..."
                  required
                />
              </div>

              <div className="form-group">
                <label>Âge</label>
                <input
                  type="number"
                  value={bookData.recipient_age}
                  onChange={(e) => setBookData({ ...bookData, recipient_age: e.target.value })}
                  placeholder="Ex: 30, 45, 60..."
                  min="0"
                  max="120"
                />
              </div>

              <div className="form-group">
                <label>Sexe</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="gender"
                      value="homme"
                      checked={bookData.recipient_gender === 'homme'}
                      onChange={(e) => setBookData({ ...bookData, recipient_gender: e.target.value })}
                    />
                    <span>Homme</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="gender"
                      value="femme"
                      checked={bookData.recipient_gender === 'femme'}
                      onChange={(e) => setBookData({ ...bookData, recipient_gender: e.target.value })}
                    />
                    <span>Femme</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="gender"
                      value="autre"
                      checked={bookData.recipient_gender === 'autre'}
                      onChange={(e) => setBookData({ ...bookData, recipient_gender: e.target.value })}
                    />
                    <span>Autre</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary button-primary"
                disabled={!bookData.recipient_name}
              >
                Continuer la configuration →
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // ÉTAPES 1 ET 2
  // ============================================
  
  return (
    <div className="wizard-container">
      <div className="wizard-card">
        <div className="wizard-header">
          <h1>Créez votre livre unique</h1>
          <div className="progress-steps">
            {[1, 2].map(step => (
              <div key={step} className="progress-step">
                <div className={`progress-bar ${currentStep >= step ? 'active' : ''}`} />
                <div className={`progress-label ${currentStep >= step ? 'active' : ''}`}>
                  Étape {step}/2
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="wizard-content">
          {currentStep === 1 && (
            <>
				<Step1ConfigLuxe
				  bookData={bookData}
				  setBookData={setBookData}
				  onNext={handleNextToRecap}
				  loading={loading}
				/>
						  <div className="button-back">
                <button
                  onClick={handlePreviousFromConfig}
                  className="button-secondary"
                >
                  ← Retour
                </button>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <Step2RecapLuxe
				bookData={bookData}
				price={getPrice()}
				loading={loading}
				onCreate={handleCreateBook}
				onPrevious={handlePreviousFromRecap}
				chapters={generatedChapters}
			  />
          )}
        </div>
      </div>

      {/* Modal de connexion */}
      {showLoginModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-icon">🔐</div>
            
            <h2 className="modal-title">Connexion requise</h2>
            
            <p className="modal-text">
              Pour créer votre livre, vous devez d'abord vous connecter ou créer un compte.
              Vos données ont été sauvegardées.
            </p>
            
            <div className="modal-actions">
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  navigate('/login', { state: { from: '/create-book' + location.search } });
                }}
                className="btn btn-primary modal-button"
              >
                Se connecter
              </button>
              
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  navigate('/register', { state: { from: '/create-book' + location.search } });
                }}
                className="btn btn-secondary modal-button"
                style={{ background: 'var(--gold) !important' }}
              >
                Créer un compte
              </button>
              
              <button
                onClick={() => setShowLoginModal(false)}
                className="modal-link"
              >
                Continuer sans compte (plus tard)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateBookWizardLuxe;