// C:\Users\USER\bookfete\frontend\src\components\create-book\CreateBookWizardLuxe.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import Step1ConfigLuxe from './Step1ConfigLuxe';
import Step2RecapLuxe from './Step2RecapLuxe';
import '../../styles/luxe-theme.css';
import './CreateBookLuxe.css';

const EVENT_SOUL_FORM_COPY = {
  anniversaire: {
    title: 'Donnons une ame a votre livre.',
    intro:
      "Avant d'inviter vos proches, aidez notre IA a comprendre qui est la personne fetee pour generer des chapitres qui lui ressemblent vraiment.",
    nameLabel: 'Nom et/ou prenom',
    namePlaceholder: 'Ex: Julie Martin',
    ageLabel: 'Age',
    agePlaceholder: 'Ex: 40',
    nicknameLabel: 'Un petit nom ou un surnom ?',
    nicknamePlaceholder: 'Ex: Julie, Ju, La tornade...',
    traitLabel: 'Son trait de caractere marquant',
    traitHelper: "Ce qui fait qu'on l'aime (ou qu'on en rit).",
    traitPlaceholder: "Ex: Elle est d'une generosite sans limite mais oublie toujours ses cles partout...",
    anecdoteLabel: "L'anecdote que tout le monde raconte en soiree ?",
    anecdoteHelper: 'C est la base de son chapitre "Legende".',
    anecdotePlaceholder:
      "Ex: La fois ou elle a confondu le sel et le sucre dans son gateau d'anniversaire...",
    extraLabel: 'Autre chose a rajouter ?',
    extraHelper:
      "Ici, c est ta fenetre : aidez-nous a vous aider. Tout autre ajout qui peut nous aider a proposer une structure de chapitre peut etre rajoute ici - des anecdotes, des choses a prendre absolument en compte, etc.",
    extraPlaceholder:
      'Ex: Elle adore les surprises, garder un ton drole et eviter les references au travail.'
  },
  mariage: {
    title: 'Donnons une ame a votre livre.',
    intro:
      "Avant d'inviter vos proches, aidez notre IA a comprendre le couple celebre pour generer des chapitres justes.",
    nameLabel: 'Noms et/ou prenoms',
    namePlaceholder: 'Ex: Lea et Thomas',
    ageLabel: 'Age (optionnel)',
    agePlaceholder: 'Ex: 32',
    nicknameLabel: 'Un petit nom ou un surnom ?',
    nicknamePlaceholder: 'Ex: Les amoureux, Team LT...',
    traitLabel: 'Leur trait de caractere marquant',
    traitHelper: 'Ce qui les rend uniques ensemble.',
    traitPlaceholder: "Ex: Ils sont tres differents mais se completent toujours avec humour...",
    anecdoteLabel: "L'anecdote que tout le monde raconte en soiree ?",
    anecdoteHelper: 'Un moment emblematique du couple.',
    anecdotePlaceholder: "Ex: Leur premier rendez-vous sous l'orage sans parapluie...",
    extraLabel: 'Autre chose a rajouter ?',
    extraHelper:
      "Tout ajout utile pour orienter la structure des chapitres peut etre note ici : ambiance, sensibilites, moments clefs, personnes importantes.",
    extraPlaceholder: "Ex: Mettre en avant la famille et les voyages plus que l'organisation du mariage."
  },
  naissance: {
    title: 'Donnons une ame a votre livre.',
    intro:
      "Avant d'inviter vos proches, aidez notre IA a comprendre l'histoire autour de cette naissance.",
    nameLabel: 'Nom et/ou prenom',
    namePlaceholder: 'Ex: Noah',
    ageLabel: 'Age',
    agePlaceholder: 'Ex: 1',
    nicknameLabel: 'Un petit nom ou un surnom ?',
    nicknamePlaceholder: 'Ex: Nono, Petit soleil...',
    traitLabel: 'Son trait de caractere marquant',
    traitHelper: 'Ce qui fait deja son charme.',
    traitPlaceholder: 'Ex: Toujours souriant, tres curieux et deja tres expressif...',
    anecdoteLabel: "L'anecdote que tout le monde raconte en soiree ?",
    anecdoteHelper: 'Un souvenir marquant des premiers mois.',
    anecdotePlaceholder: "Ex: Sa premiere nuit complete, celebree comme un evenement national...",
    extraLabel: 'Autre chose a rajouter ?',
    extraHelper:
      "Ajoutez ici les details utiles pour orienter la structure des chapitres : contexte familial, moments fondateurs, style souhaite.",
    extraPlaceholder: 'Ex: Ton tendre et poetique, inclure les grands-parents et les premieres vacances.'
  },
  depart: {
    title: 'Donnons une ame a votre livre.',
    intro:
      "Avant d'inviter vos proches, aidez notre IA a comprendre la personne celebree et le contexte du depart.",
    nameLabel: 'Nom et/ou prenom',
    namePlaceholder: 'Ex: Marc Dupont',
    ageLabel: 'Age (optionnel)',
    agePlaceholder: 'Ex: 58',
    nicknameLabel: 'Un petit nom ou un surnom ?',
    nicknamePlaceholder: 'Ex: Le boss, MacGyver...',
    traitLabel: 'Son trait de caractere marquant',
    traitHelper: 'Ce qui le/la rend inoubliable pour le groupe.',
    traitPlaceholder: 'Ex: Toujours calme en crise, avec une blague au bon moment...',
    anecdoteLabel: "L'anecdote que tout le monde raconte en soiree ?",
    anecdoteHelper: 'Le souvenir collectif qui revient toujours.',
    anecdotePlaceholder: 'Ex: Le jour ou il a sauve la presentation 5 minutes avant la reunion...',
    extraLabel: 'Autre chose a rajouter ?',
    extraHelper:
      "Ajoutez ici tout element utile pour la structure des chapitres : ton attendu, moments forts, sujets a eviter, clins d'oeil.",
    extraPlaceholder: 'Ex: Valoriser ses transmissions et son humour, rester elegant sans ton trop solennel.'
  },
  projet: {
    title: 'Donnons une ame a votre livre.',
    intro:
      "Avant d'inviter vos proches, aidez notre IA a comprendre le contexte du projet et les moments forts a raconter.",
    nameLabel: 'Nom du projet et/ou personne cle',
    namePlaceholder: 'Ex: Projet Atlas - equipe Produit',
    ageLabel: 'Anciennete (en annees)',
    agePlaceholder: 'Ex: 18',
    nicknameLabel: 'Un petit nom ou un surnom ?',
    nicknamePlaceholder: 'Ex: Mission impossible, Team Rocket...',
    traitLabel: 'Le trait marquant de cette aventure',
    traitHelper: 'Ce qui a defini votre dynamique collective.',
    traitPlaceholder: 'Ex: Une equipe ultra solidaire sous pression...',
    anecdoteLabel: "L'anecdote que tout le monde raconte en soiree ?",
    anecdoteHelper: 'Le moment legendaire qui resume le projet.',
    anecdotePlaceholder: 'Ex: Le lancement final valide a 2h du matin apres une nuit blanche...',
    extraLabel: 'Autre chose a rajouter ?',
    extraHelper:
      "Tout autre ajout utile pour la structure peut etre note ici : jalons, personnes clefs, enjeux, style narratif souhaite.",
    extraPlaceholder: 'Ex: Mettre en avant les declics, les echecs utiles et la victoire finale.'
  },
  retraite: {
    title: 'Donnons une ame a votre livre.',
    intro:
      "Avant d'inviter vos proches, aidez notre IA a comprendre la personne celebree et son parcours.",
    nameLabel: 'Nom et/ou prenom',
    namePlaceholder: 'Ex: Claire Martin',
    ageLabel: 'Age',
    agePlaceholder: 'Ex: 64',
    nicknameLabel: 'Un petit nom ou un surnom ?',
    nicknamePlaceholder: 'Ex: Capitaine, La memoire de l equipe...',
    traitLabel: 'Son trait de caractere marquant',
    traitHelper: 'Ce qui a marque son entourage au fil des annees.',
    traitPlaceholder: 'Ex: Toujours disponible, juste et inspiree...',
    anecdoteLabel: "L'anecdote que tout le monde raconte en soiree ?",
    anecdoteHelper: 'Le souvenir incontournable de sa carriere.',
    anecdotePlaceholder: 'Ex: Le client impossible transforme en ambassadeur en 24h...',
    extraLabel: 'Autre chose a rajouter ?',
    extraHelper:
      "Ajoutez ici tout ce qui peut aider a construire une structure de chapitres coherente : themes, sujets sensibles, moments a valoriser.",
    extraPlaceholder: 'Ex: Garder un ton chaleureux et transmettre un sentiment de gratitude.'
  },
  vacances: {
    title: 'Donnons une ame a votre livre.',
    intro:
      "Avant d'inviter vos proches, aidez notre IA a comprendre ce voyage et l'ambiance que vous voulez raconter.",
    nameLabel: 'Nom et/ou prenom',
    namePlaceholder: 'Ex: Famille Martin',
    ageLabel: 'Age (optionnel)',
    agePlaceholder: 'Ex: 36',
    nicknameLabel: 'Un petit nom ou un surnom ?',
    nicknamePlaceholder: 'Ex: Team soleil, Les aventuriers...',
    traitLabel: 'Le trait marquant de ce voyage',
    traitHelper: "Ce qui a rendu ces vacances uniques.",
    traitPlaceholder: 'Ex: Un melange d improvisation, de rires et de moments tres simples...',
    anecdoteLabel: "L'anecdote que tout le monde raconte en soiree ?",
    anecdoteHelper: 'Le souvenir marquant qui revient toujours.',
    anecdotePlaceholder: 'Ex: Le GPS nous a envoye sur un chemin impossible, mais vue incroyable a la cle...',
    extraLabel: 'Autre chose a rajouter ?',
    extraHelper:
      "Ajoutez ici tout ce qui peut aider a proposer une structure de chapitres : lieux, temps forts, ton souhaite, moments a valoriser.",
    extraPlaceholder: 'Ex: Mettre en avant les rencontres, les paysages et les repas partages.'
  },
  generique: {
    title: 'Donnons une ame a votre livre.',
    intro:
      "Avant d'inviter vos proches, aidez notre IA a comprendre la personne celebree pour generer des chapitres pertinents.",
    nameLabel: 'Nom et/ou prenom',
    namePlaceholder: 'Ex: Camille',
    ageLabel: 'Age',
    agePlaceholder: 'Ex: 35',
    nicknameLabel: 'Un petit nom ou un surnom ?',
    nicknamePlaceholder: 'Ex: Cam, Cams, Le phenix...',
    traitLabel: 'Son trait de caractere marquant',
    traitHelper: "Ce qui fait qu'on le/la reconnait tout de suite.",
    traitPlaceholder: "Ex: Une energie communicative et une bienveillance rare...",
    anecdoteLabel: "L'anecdote que tout le monde raconte en soiree ?",
    anecdoteHelper: 'Le souvenir qui revient toujours dans les discussions.',
    anecdotePlaceholder: 'Ex: Le voyage improvise decide en 10 minutes...',
    extraLabel: 'Autre chose a rajouter ?',
    extraHelper:
      "Ici, c est ta fenetre : aidez-nous a vous aider. Tout autre ajout qui peut nous aider a proposer une structure de chapitre peut etre rajoute ici.",
    extraPlaceholder: 'Ex: Inclure davantage de moments de famille et un ton intime.'
  }
};

const getSoulFormCopy = (eventType) => EVENT_SOUL_FORM_COPY[eventType] || EVENT_SOUL_FORM_COPY.generique;

const buildProjectBrief = (bookData) => {
  const lines = [];

  if (bookData.recipient_nickname) {
    lines.push(`Surnom: ${bookData.recipient_nickname}`);
  }
  if (bookData.recipient_trait) {
    lines.push(`Trait marquant: ${bookData.recipient_trait}`);
  }
  if (bookData.recipient_anecdote) {
    lines.push(`Anecdote phare: ${bookData.recipient_anecdote}`);
  }
  if (bookData.ai_project_brief) {
    lines.push(`Informations complementaires: ${bookData.ai_project_brief}`);
  }

  return lines.join('\n').trim();
};

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
    'fin-de-projet': 'projet',
    'mariage': 'mariage',
    'vacances': 'vacances',
    'anniversaire': 'anniversaire',
    'anniverssaire': 'anniversaire',
    'retraite': 'retraite'
  };

  const eventLabels = {
    'pot-depart': 'Pot de départ',
    'fin-projet': 'Fin de projet',
    'fin-de-projet': 'Fin de projet',
    'mariage': 'Mariage',
    'vacances': 'Vacances',
    'anniversaire': 'Anniversaire',
    'anniverssaire': 'Anniversaire',
    'retraite': 'Départ en retraite',
    'generique': 'Événement',
    'depart': 'Départ',
    'projet': 'Fin de projet',
    'naissance': 'Naissance'
  };

  const resolvedEventType = eventParam && eventMap[eventParam] ? eventMap[eventParam] : '';
  const hasEntryParams = Boolean(eventParam || nameParam || ageParam || genderParam || titleParam);
  const applyUrlOverrides = useCallback(
    (data) => ({
      ...data,
      ...(resolvedEventType ? { event_type: resolvedEventType, event_param: eventParam || '' } : {}),
      ...(nameParam ? { recipient_name: nameParam } : {}),
      ...(ageParam ? { recipient_age: ageParam } : {}),
      ...(genderParam ? { recipient_gender: genderParam } : {}),
      ...(titleParam ? { title: titleParam } : {})
    }),
    [resolvedEventType, eventParam, nameParam, ageParam, genderParam, titleParam]
  );

  const [bookData, setBookData] = useState(() => applyUrlOverrides({
    title: '',
    event_type: 'generique',
    event_param: '',
    recipient_name: '',
    recipient_age: '',
    recipient_gender: '',
    recipient_nickname: '',
    recipient_trait: '',
    recipient_anecdote: '',
    finition: 'classique',
    papier: 'mat',
    style_narratif: 'factuel',
    pages: 64,
    ai_project_brief: ''
  }));
  const soulFormCopy = getSoulFormCopy(bookData.event_type);
  const isBirthdayEvent = bookData.event_type === 'anniversaire';

  // ============================================
  // GESTION DE LA REPRISE APRÈS CONNEXION
  // ============================================
  
  useEffect(() => {
    if (location.state?.fromLogin && location.state?.bookData) {
      console.log('📦 Données reçues après connexion:', location.state.bookData);
      const loadedBookData = location.state.bookData;
      setBookData((previous) => ({
        ...applyUrlOverrides({
          ...previous,
          ...loadedBookData,
          recipient_nickname: loadedBookData.recipient_nickname || '',
          recipient_trait: loadedBookData.recipient_trait || '',
          recipient_anecdote: loadedBookData.recipient_anecdote || '',
          ai_project_brief: loadedBookData.ai_project_brief || ''
        })
      }));
      if (location.state.chapters?.length > 0) {
        setGeneratedChapters(location.state.chapters);
        setCurrentStep(2);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state, applyUrlOverrides]);

  useEffect(() => {
    const savedData = localStorage.getItem('pendingBookData');
    const savedChapters = localStorage.getItem('pendingChapters');
    
    if (savedData && !location.state?.fromLogin) {
      console.log('📦 Chargement des données sauvegardées');
      const parsedSavedData = JSON.parse(savedData);
      setBookData((previous) => ({
        ...applyUrlOverrides({
          ...previous,
          ...parsedSavedData,
          recipient_nickname: parsedSavedData.recipient_nickname || '',
          recipient_trait: parsedSavedData.recipient_trait || '',
          recipient_anecdote: parsedSavedData.recipient_anecdote || '',
          ai_project_brief: parsedSavedData.ai_project_brief || ''
        })
      }));
    }
    if (savedChapters && !location.state?.fromLogin && !hasEntryParams) {
      setGeneratedChapters(JSON.parse(savedChapters));
      if (JSON.parse(savedChapters).length > 0) {
        setCurrentStep(2);
      }
    }
  }, [location.state?.fromLogin, hasEntryParams, applyUrlOverrides]);

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
          recipientNickname: bookData.recipient_nickname || '',
          recipientTrait: bookData.recipient_trait || '',
          recipientAnecdote: bookData.recipient_anecdote || '',
          additionalContext: bookData.ai_project_brief || ''
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
    const chaptersCount = Math.floor(bookData.pages / 8);
    const chapters = [];

    let agePrefix = '';
    if (age) {
      if (age < 18) agePrefix = "d'enfance";
      else if (age < 30) agePrefix = "de jeunesse";
      else if (age < 50) agePrefix = "de vie";
      else agePrefix = "d'une vie";
    }

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
            font: 'Playfair Display',
            aiProjectBrief: buildProjectBrief(bookData)
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
            <h2 className="form-title">{soulFormCopy.title}</h2>
            <p className="form-intro">{soulFormCopy.intro}</p>
            
            <form onSubmit={(e) => { e.preventDefault(); handleNextFromDestinataire(); }}>
              <div className="form-group">
                <label>{soulFormCopy.nameLabel} <span style={{ color: 'var(--gold)' }}>*</span></label>
                <input
                  type="text"
                  value={bookData.recipient_name}
                  onChange={(e) => setBookData({ ...bookData, recipient_name: e.target.value })}
                  placeholder={soulFormCopy.namePlaceholder}
                  required
                />
              </div>

              {isBirthdayEvent ? (
                <div className="form-group">
                  <label>{soulFormCopy.ageLabel} <span style={{ color: 'var(--gold)' }}>*</span></label>
                  <input
                    type="number"
                    value={bookData.recipient_age}
                    onChange={(e) => setBookData({ ...bookData, recipient_age: e.target.value })}
                    placeholder={soulFormCopy.agePlaceholder}
                    min="1"
                    max="120"
                    required
                  />
                </div>
              ) : null}

              <div className="form-group">
                <label>{soulFormCopy.nicknameLabel}</label>
                <input
                  type="text"
                  value={bookData.recipient_nickname || ''}
                  onChange={(e) => setBookData({ ...bookData, recipient_nickname: e.target.value })}
                  placeholder={soulFormCopy.nicknamePlaceholder}
                />
              </div>

              <div className="form-group">
                <label>{soulFormCopy.traitLabel}</label>
                <p className="form-helper">{soulFormCopy.traitHelper}</p>
                <textarea
                  value={bookData.recipient_trait || ''}
                  onChange={(e) => setBookData({ ...bookData, recipient_trait: e.target.value })}
                  placeholder={soulFormCopy.traitPlaceholder}
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label>{soulFormCopy.anecdoteLabel}</label>
                <p className="form-helper">{soulFormCopy.anecdoteHelper}</p>
                <textarea
                  value={bookData.recipient_anecdote || ''}
                  onChange={(e) => setBookData({ ...bookData, recipient_anecdote: e.target.value })}
                  placeholder={soulFormCopy.anecdotePlaceholder}
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label>{soulFormCopy.extraLabel}</label>
                <p className="form-helper">{soulFormCopy.extraHelper}</p>
                <textarea
                  value={bookData.ai_project_brief || ''}
                  onChange={(e) => setBookData({ ...bookData, ai_project_brief: e.target.value })}
                  placeholder={soulFormCopy.extraPlaceholder}
                  rows={5}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary button-primary"
                disabled={
                  !bookData.recipient_name
                  || (isBirthdayEvent && !String(bookData.recipient_age || '').trim())
                }
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
