// backend/services/mistralService.js
const axios = require('axios');
const aiConfig = require('../config/ai');

class MistralService {
  /**
   * Génère des questions pour un chapitre
   * @param {Object} params - Paramètres de génération
   * @param {string} params.title - Titre du chapitre
   * @param {string} params.eventType - Type d'événement (anniversaire, mariage, etc.)
   * @param {string} params.style - Style narratif (poétique, factuel, intime)
   * @param {number} params.count - Nombre de questions (défaut: 4)
   */
  async generateQuestions({ title, eventType = 'générique', style = 'intime', count = 4 }) {
    try {
      // 1. Construction du prompt contextuel
      const prompt = this.buildPrompt(title, eventType, style, count);

      // 2. Appel à l'API Mistral
      const response = await axios.post(
        `${aiConfig.baseURL}/chat/completions`,
        {
          model: aiConfig.model,
          messages: [
            {
              role: "system",
              content: "Tu es un assistant spécialisé dans la création de questions pour des livres souvenirs. Tu génères des questions personnelles, ouvertes et adaptées au contexte. Réponds UNIQUEMENT avec un tableau JSON de questions, sans texte additionnel."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 500,
          response_format: { type: "json_object" }
        },
        { headers: aiConfig.getHeaders() }
      );

      // 3. Extraction et validation des questions
      const questions = this.extractQuestions(response.data);
      
      return {
        success: true,
        questions,
        count: questions.length,
        provider: 'mistral-ai'
      };

    } catch (error) {
      console.error('❌ Erreur Mistral:', error.response?.data || error.message);
      
      // Fallback élégant
      return {
        success: false,
        questions: this.getFallbackQuestions(title, count),
        count,
        provider: 'fallback',
        error: error.message
      };
    }
  }

  /**
   * Construit le prompt en fonction du contexte
   */
  buildPrompt(title, eventType, style, count) {
    const styleInstructions = {
      poétique: "questions poétiques et imagées qui invitent à la rêverie",
      factuel: "questions précises sur les faits, dates, lieux et personnes",
      intime: "questions personnelles sur les émotions et ressentis"
    };

    const eventContexts = {
      anniversaire: "célébration d'un anniversaire, souvenirs des années passées",
      mariage: "cérémonie de mariage, rencontre des mariés, journée spéciale",
      naissance: "arrivée d'un enfant, premiers moments, émotions des parents",
      voyage: "aventure, découvertes, moments partagés en voyage",
      generic: "souvenirs partagés, moments de vie"
    };

    return `Génère ${count} questions en français pour un chapitre de livre souvenir.
    
Contexte :
- Titre du chapitre : "${title}"
- Type d'événement : ${eventContexts[eventType] || eventContexts.generic}
- Style recherché : ${styleInstructions[style] || styleInstructions.intime}

Les questions doivent :
- Être ouvertes (pas de réponses par oui/non)
- Encourager le partage de souvenirs personnels
- Être adaptées au style demandé
- Varier entre émotions, anecdotes, personnes et lieux

Format de réponse : Retourne UNIQUEMENT un objet JSON avec une clé "questions" contenant un tableau de ${count} chaînes de caractères.`;
  }

  /**
   * Extrait les questions de la réponse Mistral
   */
  extractQuestions(data) {
    try {
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);
      
      // Gestion des différents formats possibles
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        return parsed.questions;
      } else {
        // Chercher le premier tableau dans l'objet
        const arrayProp = Object.values(parsed).find(val => Array.isArray(val));
        return arrayProp || [];
      }
    } catch (e) {
      console.error('❌ Erreur parsing JSON:', e);
      return [];
    }
  }

  /**
   * Questions de fallback (sans IA)
   */
  getFallbackQuestions(title, count) {
    const baseQuestions = [
      `Quel est votre plus beau souvenir lié à "${title}" ?`,
      `Y a-t-il une anecdote amusante que vous aimeriez partager ?`,
      `Comment décririez-vous l'importance de ce moment ?`,
      `Qui était présent et que retenez-vous d'eux ?`,
      `Si vous deviez garder une seule image, quelle serait-elle ?`,
      `Qu'est-ce que cela vous a appris ?`,
      `Quelle émotion ressort de ce souvenir ?`
    ];
    return baseQuestions.slice(0, count);
  }
}

module.exports = new MistralService();