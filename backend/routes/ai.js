// C:\Users\USER\bookfete\backend\routes\ai.js
const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const authenticate = require('../middleware/auth');

// ============================================
// ROUTES PUBLIQUES (SANS AUTHENTIFICATION)
// ============================================

// Route PUBLIQUE pour générer des chapitres (sans authentification)
router.post('/generate-chapters-public', async (req, res) => {
  try {
    const { 
      eventType, 
      style, 
      count, 
      bookTitle, 
      recipientName, 
      recipientAge, 
      recipientGender,
      prompt 
    } = req.body;
    
    console.log('='.repeat(60));
    console.log('📝 [PUBLIC] GÉNÉRATION DE CHAPITRES');
    console.log('='.repeat(60));
    console.log('📊 Contexte reçu:', {
      eventType, 
      style, 
      count, 
      bookTitle, 
      recipientName, 
      recipientAge, 
      recipientGender
    });

    if (!count || count < 1) {
      return res.status(400).json({ error: 'Le nombre de chapitres doit être supérieur à 0' });
    }

    // Utiliser le prompt fourni ou en construire un
    const finalPrompt = prompt || `Génère ${count} titres de chapitres pour un livre souvenir personnalisé.

Contexte :
- Type d'événement : ${eventType || 'générique'}
- Style narratif : ${style || 'intime'}
- Titre du livre : ${bookTitle || 'Livre souvenir'}
- Personne célébrée : ${recipientName || 'la personne'}
- Âge : ${recipientAge || 'non spécifié'} ans
- Sexe : ${recipientGender || 'non spécifié'}

Les titres doivent être :
- Créatifs et originaux, adaptés à l'événement et à la personne
- Variés (souvenirs, anecdotes, messages, photos, émotions)
- Rédigés en français
- Longueur : entre 3 et 8 mots maximum
- Évocateurs et donnant envie d'écrire

Exemples adaptés :
- Pour une femme : "Souvenirs avec [Prénom]", "Ce que j'admire chez elle"
- Pour un homme : "Ce qu'il nous a appris", "Nos moments avec lui"

Réponds UNIQUEMENT avec un tableau JSON de ${count} chaînes de caractères.
Format exact : ["Titre 1", "Titre 2", "Titre 3", ...]`;

    console.log('📤 Appel à Mistral...');

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: 'Tu es un expert en création de livres souvenirs. Tu génères des titres de chapitres poétiques et originaux, parfaitement adaptés au contexte de la personne et de l\'événement.' 
        },
        { 
          role: 'user', 
          content: finalPrompt 
        }
      ],
      temperature: 0.8,
      maxTokens: 800
    });

    const content = response.choices[0].message.content;
    console.log('📦 Réponse Mistral reçue');
    
    let titles = [];
    
    // Essayer de parser la réponse
    try {
      // Nettoyer la réponse (enlever les markdown éventuels)
      const cleanContent = content.replace(/```json|```/g, '').trim();
      titles = JSON.parse(cleanContent);
    } catch (e) {
      console.log('⚠️ Premier parsing échoué, tentative avec regex...');
      // Si le parsing échoue, on essaie d'extraire un tableau avec regex
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          titles = JSON.parse(match[0]);
        } catch (e2) {
          console.error('❌ Parsing regex échoué');
        }
      }
    }

    // Vérifier que titles est bien un tableau
    if (!Array.isArray(titles) || titles.length === 0) {
      console.log('⚠️ Pas de titres valides, utilisation du fallback');
      titles = generateFallbackTitles(eventType, count, recipientName, recipientAge, recipientGender);
    }

    // S'assurer qu'on a le bon nombre de titres
    while (titles.length < count) {
      titles.push(`Chapitre ${titles.length + 1}`);
    }
    
    // Limiter au nombre demandé
    titles = titles.slice(0, count);

    // Transformer en objets chapitres
    const chapters = titles.map((title, index) => ({
      title: title,
      description: `Chapitre ${index + 1} - Partagez vos souvenirs`,
      order_index: index
    }));

    console.log(`✅ ${chapters.length} chapitres générés avec succès (public)`);
    res.json({ chapters });
    
  } catch (error) {
    console.error('❌ Erreur génération chapitres (public):', error);
    
    // Fallback en cas d'erreur
    const fallbackChapters = generateFallbackTitles(
      req.body.eventType, 
      req.body.count || 8,
      req.body.recipientName,
      req.body.recipientAge,
      req.body.recipientGender
    ).map((title, index) => ({
      title: title,
      description: `Chapitre ${index + 1}`,
      order_index: index
    }));
    
    res.json({ 
      chapters: fallbackChapters,
      fallback: true,
      error: error.message 
    });
  }
});

// ============================================
// ROUTES PROTÉGÉES (AVEC AUTHENTIFICATION)
// ============================================

// Route pour générer des questions
router.post('/generate-questions', authenticate, async (req, res) => {
  try {
    const { chapterTitle, bookTitle, eventType, style } = req.body;
    
    console.log('📝 Route /generate-questions appelée avec:', { 
      chapterTitle, 
      bookTitle, 
      eventType, 
      style 
    });

    if (!chapterTitle) {
      return res.status(400).json({ error: 'chapterTitle est requis' });
    }

    const questions = await aiService.generateQuestions({
      chapterTitle,
      bookTitle: bookTitle || 'ce livre',
      eventType: eventType || 'evenement',
      style: style || 'intime'
    });
    
    res.json({ questions });
  } catch (error) {
    console.error('❌ Erreur route generate-questions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour générer une citation
router.post('/generate-quote', authenticate, async (req, res) => {
  try {
    const { chapterTitle, eventType, style } = req.body;
    
    console.log('📝 Génération de citation pour:', { chapterTitle, eventType, style });
    
    const quote = await aiService.generateQuote(chapterTitle, eventType, style);
    
    res.json({ quote });
  } catch (error) {
    console.error('❌ Erreur route generate-quote:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route protégée pour générer des chapitres (pour utilisateurs connectés)
router.post('/generate-chapters', authenticate, async (req, res) => {
  try {
    const { 
      eventType, 
      style, 
      count, 
      bookTitle, 
      recipientName, 
      recipientAge, 
      recipientGender,
      prompt 
    } = req.body;
    
    console.log('📝 [PROTÉGÉ] Génération de chapitres avec contexte:', {
      eventType, 
      style, 
      count, 
      bookTitle, 
      recipientName, 
      recipientAge, 
      recipientGender
    });

    if (!count || count < 1) {
      return res.status(400).json({ error: 'Le nombre de chapitres doit être supérieur à 0' });
    }

    // Utiliser le prompt fourni ou en construire un
    const finalPrompt = prompt || `Génère ${count} titres de chapitres pour un livre souvenir personnalisé.

Contexte :
- Type d'événement : ${eventType || 'générique'}
- Style narratif : ${style || 'intime'}
- Titre du livre : ${bookTitle || 'Livre souvenir'}
- Personne célébrée : ${recipientName || 'la personne'}
- Âge : ${recipientAge || 'non spécifié'} ans
- Sexe : ${recipientGender || 'non spécifié'}

Les titres doivent être :
- Créatifs et originaux, adaptés à l'événement et à la personne
- Variés (souvenirs, anecdotes, messages, photos, émotions)
- Rédigés en français
- Longueur : entre 3 et 8 mots maximum
- Évocateurs et donnant envie d'écrire

Réponds UNIQUEMENT avec un tableau JSON de ${count} chaînes de caractères.
Format exact : ["Titre 1", "Titre 2", "Titre 3", ...]`;

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: 'Tu es un expert en création de livres souvenirs. Tu génères des titres de chapitres poétiques et originaux.' 
        },
        { 
          role: 'user', 
          content: finalPrompt 
        }
      ],
      temperature: 0.8,
      maxTokens: 800
    });

    const content = response.choices[0].message.content;
    
    let titles = [];
    
    try {
      const cleanContent = content.replace(/```json|```/g, '').trim();
      titles = JSON.parse(cleanContent);
    } catch (e) {
      console.log('⚠️ Parsing échoué, tentative avec regex...');
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          titles = JSON.parse(match[0]);
        } catch (e2) {
          console.error('❌ Parsing regex échoué');
        }
      }
    }

    if (!Array.isArray(titles) || titles.length === 0) {
      console.log('⚠️ Pas de titres valides, utilisation du fallback');
      titles = generateFallbackTitles(eventType, count, recipientName, recipientAge, recipientGender);
    }

    while (titles.length < count) {
      titles.push(`Chapitre ${titles.length + 1}`);
    }
    
    titles = titles.slice(0, count);

    const chapters = titles.map((title, index) => ({
      title: title,
      description: `Chapitre ${index + 1} - Partagez vos souvenirs`,
      order_index: index
    }));

    console.log(`✅ ${chapters.length} chapitres générés avec succès (protégé)`);
    res.json({ chapters });
    
  } catch (error) {
    console.error('❌ Erreur génération chapitres:', error);
    
    const fallbackChapters = generateFallbackTitles(
      req.body.eventType, 
      req.body.count || 8,
      req.body.recipientName,
      req.body.recipientAge,
      req.body.recipientGender
    ).map((title, index) => ({
      title: title,
      description: `Chapitre ${index + 1}`,
      order_index: index
    }));
    
    res.json({ 
      chapters: fallbackChapters,
      fallback: true,
      error: error.message 
    });
  }
});

// Route pour générer une introduction
router.post('/generate-introduction', authenticate, async (req, res) => {
  try {
    const { bookTitle, eventType, style, recipientName, recipientAge, recipientGender } = req.body;
    
    const prompt = `Rédige une introduction poétique et chaleureuse pour un livre souvenir.

Contexte :
- Titre du livre : ${bookTitle}
- Type d'événement : ${eventType}
- Style : ${style}
- Nom du destinataire : ${recipientName || 'la personne'}
- Âge : ${recipientAge || 'non spécifié'} ans
- Sexe : ${recipientGender || 'non spécifié'}

L'introduction doit :
- Faire environ 100-150 mots
- Expliquer pourquoi ce livre a été créé
- Mentionner le nom de la personne (${recipientName || 'le/la destinataire'})
- Donner envie de lire la suite
- Être écrite en français, avec une touche d'émotion

Réponds UNIQUEMENT avec le texte de l'introduction, sans guillemets.`;

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'Tu rédiges des introductions pour des livres souvenirs, avec élégance et émotion.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      maxTokens: 300
    });

    const introduction = response.choices[0].message.content.trim();
    res.json({ introduction });
    
  } catch (error) {
    console.error('❌ Erreur génération introduction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour générer une conclusion
router.post('/generate-conclusion', authenticate, async (req, res) => {
  try {
    const { bookTitle, eventType, style, recipientName } = req.body;
    
    const prompt = `Rédige une conclusion touchante pour un livre souvenir.

Contexte :
- Titre du livre : ${bookTitle}
- Type d'événement : ${eventType}
- Style : ${style}
- Nom du destinataire : ${recipientName || 'la personne'}

La conclusion doit :
- Faire environ 80-120 mots
- Remercier les contributeurs
- Souhaiter quelque chose de beau au destinataire
- Clore le livre avec élégance

Réponds UNIQUEMENT avec le texte de la conclusion, sans guillemets.`;

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'Tu rédiges des conclusions pour des livres souvenirs.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      maxTokens: 250
    });

    const conclusion = response.choices[0].message.content.trim();
    res.json({ conclusion });
    
  } catch (error) {
    console.error('❌ Erreur génération conclusion:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FONCTION DE FALLBACK
// ============================================

function generateFallbackTitles(eventType, count, recipientName, recipientAge, recipientGender) {
  const name = recipientName || 'la personne';
  const age = recipientAge ? parseInt(recipientAge) : null;
  
  // Adapter les titres selon l'âge
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
      'Leur rencontre',
      'La demande',
      'Les préparatifs',
      'La cérémonie',
      'La fête',
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
    ],
    potdepart: [
      `Souvenirs avec ${name}`,
      `Moments marquants avec ${name}`,
      `Anecdotes avec ${name}`,
      `Messages des collègues pour ${name}`,
      `Ce qu'on retient de ${name}`,
      `Bon vent ${name} !`
    ]
  };

  const titles = baseTitles[eventType] || baseTitles.generique;
  const result = [];

  for (let i = 0; i < count; i++) {
    const baseIndex = i % titles.length;
    let title = titles[baseIndex];
    
    // Adapter le titre selon l'âge si nécessaire
    if (age && title.includes('souvenirs') && !title.includes(agePrefix)) {
      title = title.replace('souvenirs', `souvenirs ${agePrefix}`);
    }
    
    // Ajouter un suffixe si on dépasse le nombre de titres de base
    if (i >= titles.length) {
      const suffix = Math.floor(i / titles.length) + 1;
      title = `${title} ${suffix}`;
    }
    
    result.push(title);
  }
  
  return result;
}

module.exports = router;