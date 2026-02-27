// C:\Users\USER\bookfete\frontend\src\components\create-book\CreateBookWizard.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Step1Config from './Step1Config';
import Step2Recap from './Step2Recap';

const CreateBookWizard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(0); // 0 = destinataire, 1 = config, 2 = recap
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

  // Labels pour affichage
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
    event_param: eventParam || '', // Garder le paramètre original pour l'affichage
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
  
  // Traiter les données reçues de la connexion
  useEffect(() => {
    if (location.state?.fromLogin && location.state?.bookData) {
      console.log('📦 Données reçues après connexion:', location.state.bookData);
      setBookData(location.state.bookData);
      if (location.state.chapters?.length > 0) {
        setGeneratedChapters(location.state.chapters);
        setCurrentStep(2);
      }
      // Nettoyer le state pour éviter les boucles
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Charger les données sauvegardées au démarrage
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

  // Sauvegarder les données à chaque modification
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
  // FONCTIONS DE GÉNÉRATION IA AMÉLIORÉES
  // ============================================

// Dans CreateBookWizard.js, remplace la fonction generateChaptersWithIA par celle-ci :

const generateChaptersWithIA = async () => {
  try {
    // NE PAS vérifier l'authentification ici !
    const chaptersCount = Math.floor(bookData.pages / 8);
    
    // Construire un prompt enrichi avec toutes les informations
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

      // Appel SANS en-tête Authorization
      const response = await fetch(`${process.env.REACT_APP_API_URL}/ai/generate-chapters-public`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // PAS DE Authorization
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
  // Fallback intelligent avec toutes les infos
  const generateFallbackChapters = () => {
    const name = bookData.recipient_name || 'la personne';
    const age = bookData.recipient_age ? parseInt(bookData.recipient_age) : null;
    const gender = bookData.recipient_gender;
    const chaptersCount = Math.floor(bookData.pages / 8);
    const chapters = [];

    // Adapter les titres selon l'âge
    let agePrefix = '';
    if (age) {
      if (age < 18) agePrefix = "d'enfance";
      else if (age < 30) agePrefix = "de jeunesse";
      else if (age < 50) agePrefix = "de vie";
      else agePrefix = "d'une vie";
    }

    // Adapter les pronoms selon le genre
    const pronoun = gender === 'femme' ? 'elle' : gender === 'homme' ? 'lui' : 'la personne';
    const possessive = gender === 'femme' ? 'sa' : gender === 'homme' ? 'son' : 'sa';

    // Titres de base selon le type d'événement
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
    // Vérifier si l'utilisateur est connecté
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      // Sauvegarder l'URL de retour
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

      // 1. Créer le livre
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

      // 2. Créer les chapitres
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

      // 3. Mettre à jour avec les configs
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

      // Nettoyer le localStorage
      localStorage.removeItem('pendingBookData');
      localStorage.removeItem('pendingChapters');
      localStorage.removeItem('returnTo');

      console.log('🎉 Livre créé avec succès, redirection vers:', `/book/${book.id}`);
      
      // Rediriger vers le livre créé
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
      <div style={{
        minHeight: 'calc(100vh - 80px)',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '2rem'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          background: 'white',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          padding: '2rem'
        }}>
          <h1 style={{ textAlign: 'center', marginBottom: '2rem', color: '#333' }}>
            {eventLabels[bookData.event_type] || 'Créer votre livre'}
          </h1>
          
          <h2 style={{ marginBottom: '2rem', color: '#333' }}>
            Qui est le destinataire ?
          </h2>
          
          <form onSubmit={(e) => { e.preventDefault(); handleNextFromDestinataire(); }}>
            {/* Nom */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                Prénom / Nom <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <input
                type="text"
                value={bookData.recipient_name}
                onChange={(e) => setBookData({ ...bookData, recipient_name: e.target.value })}
                placeholder="Ex: Yani, Gégé, Marie..."
                required
                style={{
                  width: '100%',
                  padding: '1rem',
                  border: '2px solid #e9ecef',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Âge */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                Âge
              </label>
              <input
                type="number"
                value={bookData.recipient_age}
                onChange={(e) => setBookData({ ...bookData, recipient_age: e.target.value })}
                placeholder="Ex: 30, 45, 60..."
                min="0"
                max="120"
                style={{
                  width: '100%',
                  padding: '1rem',
                  border: '2px solid #e9ecef',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Sexe */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                Sexe
              </label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="radio"
                    name="gender"
                    value="homme"
                    checked={bookData.recipient_gender === 'homme'}
                    onChange={(e) => setBookData({ ...bookData, recipient_gender: e.target.value })}
                  /> Homme
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="radio"
                    name="gender"
                    value="femme"
                    checked={bookData.recipient_gender === 'femme'}
                    onChange={(e) => setBookData({ ...bookData, recipient_gender: e.target.value })}
                  /> Femme
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="radio"
                    name="gender"
                    value="autre"
                    checked={bookData.recipient_gender === 'autre'}
                    onChange={(e) => setBookData({ ...bookData, recipient_gender: e.target.value })}
                  /> Autre
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={!bookData.recipient_name}
              style={{
                width: '100%',
                padding: '1rem',
                background: bookData.recipient_name ? '#28a745' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: bookData.recipient_name ? 'pointer' : 'not-allowed'
              }}
            >
              Continuer la configuration →
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================
  // ÉTAPES 1 ET 2
  // ============================================
  
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
            <>
              <Step1Config
                bookData={bookData}
                setBookData={setBookData}
                onNext={handleNextToRecap}
                loading={loading}
              />
              {/* Bouton Retour */}
              <div style={{ marginTop: '1rem', textAlign: 'left' }}>
                <button
                  onClick={handlePreviousFromConfig}
                  style={{
                    padding: '0.8rem 2rem',
                    background: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    cursor: 'pointer'
                  }}
                >
                  ← Retour
                </button>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <Step2Recap
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '16px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              background: '#764ba2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              fontSize: '2rem',
              color: 'white'
            }}>
              🔐
            </div>
            
            <h2 style={{ marginBottom: '1rem', color: '#333' }}>
              Connexion requise
            </h2>
            
            <p style={{ marginBottom: '2rem', color: '#666' }}>
              Pour créer votre livre, vous devez d'abord vous connecter ou créer un compte.
              Vos données ont été sauvegardées.
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  navigate('/login', { state: { from: '/create-book' + location.search } });
                }}
                style={{
                  padding: '1rem',
                  background: '#764ba2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Se connecter
              </button>
              
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  navigate('/register', { state: { from: '/create-book' + location.search } });
                }}
                style={{
                  padding: '1rem',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Créer un compte
              </button>
              
              <button
                onClick={() => setShowLoginModal(false)}
                style={{
                  padding: '0.5rem',
                  background: 'none',
                  color: '#666',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '0.5rem'
                }}
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

export default CreateBookWizard;