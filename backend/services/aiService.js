// C:\Users\USER\bookfete\backend\services\aiService.js
const { Mistral } = require('@mistralai/mistralai');

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.error('❌ MISTRAL_API_KEY manquante dans .env');
}

const mistral = new Mistral({ apiKey: apiKey });

/**
 * Génère des questions pour un chapitre
 * @param {Object} params - Les paramètres
 * @param {string} params.chapterTitle - Titre du chapitre
 * @param {string} params.eventType - Type d'événement
 * @param {string} params.style - Style narratif
 * @param {string} params.bookTitle - Titre du livre
 * @returns {Promise<string[]>} - Tableau de 4 questions
 */
async function generateQuestions({ chapterTitle, eventType, style, bookTitle }) {
  try {
    console.log('='.repeat(60));
    console.log('🎯 AI SERVICE - GÉNÉRATION DE QUESTIONS');
    console.log('='.repeat(60));
    console.log('📚 bookTitle reçu:', bookTitle);
    console.log('📖 chapterTitle reçu:', chapterTitle);
    console.log('🎉 eventType reçu:', eventType);
    console.log('✍️ style reçu:', style);
    
    if (!bookTitle) {
      console.log('⚠️ ATTENTION: bookTitle est vide ou null!');
    }

    const styleInstructions = {
      poetique: "Utilise un langage imagé, émouvant et lyrique.",
      factuel: "Sois direct, concret et pratique.",
      intime: "Adopte un ton chaleureux, personnel et confidentiel."
    };

    const styleInstruction = styleInstructions[style] || styleInstructions.factuel;

    // Extraire le nom de la personne du titre (ex: "Anniversaire de Yani" -> "Yani")
    let personName = '';
    if (bookTitle) {
      const matches = bookTitle.match(/(?:anniversaire|mariage|naissance|départ) de (.*)/i);
      personName = matches ? matches[1].trim() : '';
    }

    const prompt = `Tu es un assistant qui aide à créer des questions pour un livre souvenir collaboratif.
    
Contexte du livre :
- TITRE DU LIVRE : "${bookTitle || 'ce livre'}"
- Personne célébrée : ${personName || 'la personne concernée'}
- Type d'événement : ${eventType}
- Titre du chapitre : "${chapterTitle}"
- Style narratif : ${style}

${styleInstruction}

Génère 4 questions PERSONNALISÉES pour ce chapitre.

RÈGLES IMPÉRATIVES :
1. Chaque question doit mentionner "${personName || 'la personne'}" (le nom de la personne célébrée)
2. Les questions doivent être adaptées au chapitre "${chapterTitle}"
3. Utilise le style ${style}

Exemple pour un livre "Anniversaire de Yani", chapitre "Messages" :
- "Quel message aimerais-tu adresser directement à Yani ?"
- "Qu'est-ce que tu souhaites pour l'avenir de Yani ?"
- "Quel souvenir avec Yani aimerais-tu partager ?"
- "Quelle qualité de Yani veux-tu souligner ?"

Réponds UNIQUEMENT avec un tableau JSON de 4 questions.

Format : ["Question 1", "Question 2", "Question 3", "Question 4"]`;

    console.log('📝 Prompt envoyé à Mistral');

    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: 'Tu es un assistant spécialisé dans la création de livres souvenirs.' 
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
    console.log('📝 Réponse Mistral reçue');
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const questions = JSON.parse(jsonMatch[0]);
        console.log('✅ Questions générées:', questions);
        return questions.slice(0, 4);
      } catch (parseError) {
        console.error('❌ Erreur parsing JSON:', parseError);
      }
    }
    
    console.log('⚠️ Utilisation des questions par défaut');
    return getDefaultQuestions(bookTitle, chapterTitle, eventType, style, personName);
    
  } catch (error) {
    console.error('❌ Erreur génération questions:', error);
    return getDefaultQuestions(bookTitle, chapterTitle, eventType, style, personName);
  }
}

/**
 * Questions par défaut (contextuelles)
 */
function getDefaultQuestions(bookTitle, chapterTitle, eventType, style, personName) {
  const name = personName || 'la personne';
  
  const baseQuestions = [
    `Quel souvenir lié à ${name} est le plus précieux pour vous ?`,
    `Qu'est-ce qui rend ${name} unique à vos yeux ?`,
    `Quel message souhaitez-vous adresser à ${name} ?`,
    `Quelle qualité de ${name} aimeriez-vous souligner ?`
  ];

  if (style === 'poetique') {
    return [
      `Quels mots choisis-tu pour décrire la poésie de ${name} ?`,
      `Si ${name} était un poème, quels vers écrirais-tu ?`,
      `Quelle émotion ${name} éveille-t-elle en toi ?`,
      `Quelle lumière ${name} apporte-t-elle dans ta vie ?`
    ];
  }
  
  if (style === 'intime') {
    return [
      `Raconte-nous ce que ${name} représente pour toi.`,
      `Quel sentiment personnel ${name} évoque-t-il en toi ?`,
      `Partage un détail intime sur ${name}.`,
      `Qu'est-ce que tu aimerais que les autres retiennent de ${name} ?`
    ];
  }

  return baseQuestions;
}

/**
 * Génère une citation inspirante pour un chapitre
 */
async function generateQuote(chapterTitle, eventType, style) {
  try {
    console.log('🤖 Génération de citation pour:', { chapterTitle, eventType, style });

    const styleInstructions = {
      poetique: "Utilise un langage imagé, émouvant et lyrique.",
      factuel: "Sois direct, concret et pratique.",
      intime: "Adopte un ton chaleureux, personnel et confidentiel."
    };

    const styleInstruction = styleInstructions[style] || styleInstructions.factuel;

    const prompt = `Tu es un assistant qui aide à créer des citations pour un livre souvenir collaboratif.
    
Contexte :
- Type d'événement : ${eventType}
- Titre du chapitre : "${chapterTitle}"
- Style narratif : ${style}

${styleInstruction}

Génère UNE SEULE citation inspirante et personnalisée pour ce chapitre.
La citation doit être courte, mémorable et adaptée au contexte.
Elle peut être une formule de vœux, un proverbe revisité, ou une phrase originale.

Réponds UNIQUEMENT avec la citation, sans guillemets, sans texte additionnel.
La citation doit faire entre 10 et 30 mots maximum.`;

    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: 'Tu es un spécialiste des citations et des belles formules.' 
        },
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      temperature: 0.8,
      maxTokens: 100
    });

    const quote = response.choices[0].message.content.trim();
    console.log('📝 Citation générée:', quote);
    
    return quote;
    
  } catch (error) {
    console.error('❌ Erreur génération citation:', error);
    return getDefaultQuote(chapterTitle, eventType, style);
  }
}

/**
 * Citation par défaut
 */
function getDefaultQuote(chapterTitle, eventType, style) {
  const quotes = [
    `Les plus beaux moments deviennent des souvenirs éternels.`,
    `Chaque histoire mérite d'être racontée.`,
    `La vie est une collection de moments précieux.`,
    `Ce qui est partagé reste à jamais dans nos cœurs.`,
    `Les souvenirs sont la richesse de l'âme.`
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

module.exports = {
  generateQuestions,
  generateQuote,
  mistral
};