// C:\Users\USER\bookfete\backend\routes\ai.js
const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const authenticate = require('../middleware/auth');

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

    // Appel avec un objet contenant tous les paramètres
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

// Route pour générer des titres de chapitres
router.post('/generate-chapters', authenticate, async (req, res) => {
  try {
    const { eventType, style, count, bookTitle } = req.body;
    
    console.log('📝 Génération de chapitres:', { eventType, style, count, bookTitle });

    if (!count || count < 1) {
      return res.status(400).json({ error: 'Le nombre de chapitres doit être supérieur à 0' });
    }

    const prompt = `Génère exactement ${count} titres de chapitres pour un livre souvenir personnalisé.

Contexte :
- Type d'événement : ${eventType || 'générique'}
- Style narratif : ${style || 'intime'}
- Titre du livre : ${bookTitle || 'Livre souvenir'}

Les titres doivent être :
- Créatifs et originaux, adaptés à l'événement
- Variés (souvenirs, anecdotes, messages, photos, émotions, personnes)
- Rédigés en français, avec une majuscule au début
- Longueur : entre 3 et 8 mots maximum
- Évocateurs et donnant envie d'écrire

Exemples de styles selon l'événement :
- Anniversaire : "Souvenirs d'enfance", "Ce que j'aime chez toi", "Nos fêtes mémorables"
- Mariage : "Leur rencontre", "Les préparatifs", "Messages aux mariés"
- Départ : "Souvenirs partagés", "Ce qu'on retient", "Nouveau départ"

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
          content: prompt 
        }
      ],
      temperature: 0.8,
      maxTokens: 800
    });

    const content = response.choices[0].message.content;
    console.log('📦 Réponse IA brute:', content);
    
    let titles = [];
    
    try {
      const cleanContent = content.replace(/```json|```/g, '').trim();
      titles = JSON.parse(cleanContent);
    } catch (e) {
      console.log('⚠️ Premier parsing échoué, tentative avec regex...');
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
      titles = generateFallbackTitles(eventType, count);
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

    console.log(`✅ ${chapters.length} chapitres générés avec succès`);
    res.json({ chapters });
    
  } catch (error) {
    console.error('❌ Erreur génération chapitres:', error);
    
    const fallbackChapters = generateFallbackTitles(req.body.eventType, req.body.count || 8)
      .map((title, index) => ({
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
    const { bookTitle, eventType, style, recipientName } = req.body;
    
    const prompt = `Rédige une introduction poétique et chaleureuse pour un livre souvenir.

Contexte :
- Titre du livre : ${bookTitle}
- Type d'événement : ${eventType}
- Style : ${style}
- Nom du destinataire : ${recipientName || 'la personne'}

L'introduction doit :
- Faire environ 100-150 mots
- Expliquer pourquoi ce livre a été créé
- Donner envie de lire la suite
- Être écrite en français, avec une touche d'émotion

Réponds UNIQUEMENT avec le texte de l'introduction, sans guillemets.`;

    const response = await aiService.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'Tu rédiges des introductions pour des livres souvenirs.' },
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

// Fonction de fallback pour les titres
function generateFallbackTitles(eventType, count) {
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
    ],
    potdepart: [
      'Souvenirs de bureau',
      'Moments marquants',
      'Anecdotes',
      'Messages des collègues',
      'Ce qu\'on retient',
      'Bon vent !'
    ]
  };

  const titles = baseTitles[eventType] || baseTitles.generique;
  const result = [];

  for (let i = 0; i < count; i++) {
    const baseIndex = i % titles.length;
    let title = titles[baseIndex];
    
    if (i >= titles.length) {
      const suffix = Math.floor(i / titles.length) + 1;
      title = `${title} ${suffix}`;
    }
    
    result.push(title);
  }
  
  return result;
}

module.exports = router;