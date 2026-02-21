// C:\Users\USER\bookfete\backend\services\aiService.js
const { Mistral } = require('@mistralai/mistralai');

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.error('❌ MISTRAL_API_KEY manquante dans .env');
}

const mistral = new Mistral({ apiKey: apiKey });

/**
 * Génère des questions pour un chapitre
 * @param {string} chapterTitle - Titre du chapitre
 * @param {string} eventType - Type d'événement (anniversaire, mariage...)
 * @param {string} style - Style narratif (poétique, factuel, intime)
 * @returns {Promise<string[]>} - Tableau de 4 questions
 */
async function generateQuestions(chapterTitle, eventType, style) {
  try {
    console.log('🤖 Génération de questions pour:', { chapterTitle, eventType, style });

    // Adapter le prompt selon le style
    const styleInstructions = {
      poetique: "Utilise un langage imagé, émouvant et lyrique.",
      factuel: "Sois direct, concret et pratique.",
      intime: "Adopte un ton chaleureux, personnel et confidentiel."
    };

    const styleInstruction = styleInstructions[style] || styleInstructions.factuel;

    const prompt = `Tu es un assistant qui aide à créer des questions pour un livre souvenir collaboratif.
    
Contexte :
- Type d'événement : ${eventType}
- Titre du chapitre : "${chapterTitle}"
- Style narratif : ${style}

${styleInstruction}

Génère 4 questions ouvertes et inspirantes pour ce chapitre. 
Les questions doivent aider les contributeurs à écrire des témoignages personnels et émouvants.
Adapte le ton au style demandé (${style}).

Réponds UNIQUEMENT avec un tableau JSON de 4 chaînes de caractères.
Exemple de format : ["Question 1", "Question 2", "Question 3", "Question 4"]

Ne mets rien d'autre que le tableau JSON dans ta réponse.`;

    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: 'Tu es un assistant spécialisé dans la création de livres souvenirs et de témoignages.' 
        },
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      temperature: 0.7,
      maxTokens: 500
    });

    const content = response.choices[0].message.content;
    console.log('📝 Réponse Mistral:', content);
    
    // Extraire le tableau JSON de la réponse
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const questions = JSON.parse(jsonMatch[0]);
        // Vérifier que c'est bien un tableau de 4 questions
        if (Array.isArray(questions) && questions.length >= 4) {
          return questions.slice(0, 4);
        }
      } catch (parseError) {
        console.error('❌ Erreur parsing JSON:', parseError);
      }
    }
    
    // Fallback si l'IA ne répond pas correctement
    console.log('⚠️ Utilisation des questions par défaut');
    return getDefaultQuestions(chapterTitle, eventType, style);
    
  } catch (error) {
    console.error('❌ Erreur génération questions:', error);
    return getDefaultQuestions(chapterTitle, eventType, style);
  }
}

/**
 * Questions par défaut en cas d'échec de l'IA
 */
function getDefaultQuestions(chapterTitle, eventType, style) {
  const baseQuestions = [
    `Quel est votre plus beau souvenir lié à ce chapitre "${chapterTitle}" ?`,
    `Qu'est-ce qui rend ce moment spécial pour vous ?`,
    `Si vous deviez décrire cette expérience en trois mots, lesquels choisiriez-vous ?`,
    `Quel conseil ou vœu souhaiteriez-vous partager ?`
  ];

  // Adapter selon le style
  if (style === 'poetique') {
    return [
      `Quels mots choisis-tu pour décrire la magie de "${chapterTitle}" ?`,
      `Si ce moment était un poème, quels vers écrirais-tu ?`,
      `Quelle émotion te traverse quand tu penses à "${chapterTitle}" ?`,
      `Quelle lumière garderas-tu de cette expérience ?`
    ];
  }
  
  if (style === 'intime') {
    return [
      `Raconte-nous ce que "${chapterTitle}" représente pour toi.`,
      `Quel sentiment te vient en premier quand tu y penses ?`,
      `Partage un détail, même petit, qui te tient à cœur.`,
      `Qu'est-ce que tu aimerais que les autres retiennent de ce moment ?`
    ];
  }

  return baseQuestions;
}

module.exports = {
  generateQuestions
};