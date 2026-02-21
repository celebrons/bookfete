// backend/controllers/chapterController.js
const mistralService = require('../services/mistralService');

// Dans votre fonction de création/édition de chapitre
const createChapter = async (req, res) => {
  try {
    const { title, eventType, style, autoGenerateQuestions } = req.body;
    
    // Logique existante...
    
    // Si l'utilisateur veut générer automatiquement des questions
    if (autoGenerateQuestions) {
      const aiResult = await mistralService.generateQuestions({
        title,
        eventType: eventType || 'generic',
        style: style || 'intime',
        count: 4
      });
      
      // Ajouter les questions générées au chapitre
      req.body.questions = aiResult.questions;
    }
    
    // Suite de la logique...
    
  } catch (error) {
    // Gestion d'erreur
  }
};