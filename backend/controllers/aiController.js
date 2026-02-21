// C:\Users\USER\bookfete\backend\controllers\aiController.js
const aiService = require('../services/aiService');

/**
 * Générer des questions pour un chapitre
 */
exports.generateQuestions = async (req, res) => {
  const { chapterTitle, eventType, style } = req.body;

  try {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 GÉNÉRATION QUESTIONS IA');
    console.log('='.repeat(60));
    console.log('Titre du chapitre:', chapterTitle);
    console.log('Type événement:', eventType);
    console.log('Style narratif:', style);

    // Validation des paramètres
    if (!chapterTitle || !eventType || !style) {
      console.error('❌ Paramètres manquants');
      return res.status(400).json({ 
        error: 'Paramètres manquants',
        required: ['chapterTitle', 'eventType', 'style'],
        received: { chapterTitle, eventType, style }
      });
    }

    // Appel au service IA
    const questions = await aiService.generateQuestions(chapterTitle, eventType, style);
    
    console.log('✅ Questions générées:');
    questions.forEach((q, i) => console.log(`   ${i+1}. ${q}`));

    res.json({ 
      success: true, 
      questions,
      meta: {
        model: 'mistral-small-latest',
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erreur endpoint IA:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération des questions',
      message: error.message 
    });
  }
};