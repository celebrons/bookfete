// backend/services/openrouterMistralService.js
const axios = require('axios');

class OpenRouterMistralService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseURL = 'https://openrouter.ai/api/v1';
    // Modèle Mistral Small 3.1 gratuit sur OpenRouter
    this.defaultModel = 'mistralai/mistral-small-3.1-24b-instruct:free';
  }

  async generateQuestions(chapterTitle, chapterDescription, count = 5) {
    try {
      const prompt = `Génère ${count} questions personnelles et ouvertes en français pour un chapitre de livre souvenir intitulé "${chapterTitle}".
      
Description du chapitre: ${chapterDescription || 'Souvenirs à partager'}

Format: Retourne UNIQUEMENT un tableau JSON valide avec les questions, sans texte additionnel.`;

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.defaultModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://memoire-collective.com',
            'X-Title': 'Memoire Collective'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      const questions = JSON.parse(content.match(/\[.*\]/s)[0]);
      return questions;
      
    } catch (error) {
      console.error('Erreur OpenRouter:', error);
      return this.getFallbackQuestions(chapterTitle);
    }
  }

  getFallbackQuestions(chapterTitle) {
    return [
      `Quel est votre plus beau souvenir lié à "${chapterTitle}" ?`,
      `Y a-t-il une anecdote amusante que vous aimeriez partager ?`,
      `Comment décririez-vous l'importance de ce moment en quelques mots ?`,
      `Y a-t-il une personne en particulier associée à ce souvenir ?`,
      `Si vous deviez garder une seule image de cette époque, quelle serait-elle ?`
    ];
  }
}

module.exports = new OpenRouterMistralService();