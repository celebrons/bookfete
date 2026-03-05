// C:\Users\USER\bookfete\backend\services\aiService.js
const { Mistral } = require('@mistralai/mistralai');
const promptTemplateService = require('./promptTemplateService');

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.error('❌ MISTRAL_API_KEY manquante dans .env');
}

const mistral = new Mistral({ apiKey: apiKey });

function normalizeQuestionText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeQuestionList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return normalizeQuestionText(item);
      if (item && typeof item === 'object') {
        return normalizeQuestionText(item.question || item.title || item.label);
      }
      return '';
    })
    .filter(Boolean);
}

function parseQuestions(content) {
  if (!content) return [];

  const cleanContent = String(content).replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleanContent);
    if (Array.isArray(parsed)) {
      return normalizeQuestionList(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.questions)) {
        return normalizeQuestionList(parsed.questions);
      }
      if (Array.isArray(parsed.items)) {
        return normalizeQuestionList(parsed.items);
      }
    }
  } catch (error) {
    // no-op
  }

  const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsedArray = JSON.parse(jsonMatch[0]);
      return normalizeQuestionList(parsedArray);
    } catch (error) {
      // no-op
    }
  }

  const fromLines = [];
  const numberedLineRegex = /(?:^|\n)\s*(?:[-*•]?\s*)?(?:\d+[\)\.\-]|Question\s*\d+\s*[:\-])\s*(.+)/gi;
  let match = numberedLineRegex.exec(cleanContent);
  while (match) {
    const text = normalizeQuestionText(match[1]);
    if (text) {
      fromLines.push(text);
    }
    match = numberedLineRegex.exec(cleanContent);
  }

  return fromLines;
}

/**
 * Génère des questions pour un chapitre
 * @param {Object} params - TOUS les paramètres dans un objet
 */
async function generateQuestions(params) {
  // Extraire toutes les données de l'objet params
  const { 
    chapterTitle, 
    eventType, 
    style, 
    bookTitle,
    recipientName,
    recipientAge,
    recipientGender 
  } = params || {};

  // UTILISATION DES VRAIES VALEURS DE LA BASE
  // Si les valeurs sont undefined, on utilise le titre comme fallback
  const name = recipientName || 
              (bookTitle ? bookTitle.split(' ').pop() : 'la personne');
  const age = recipientAge || 'non spécifié';
  const gender = recipientGender || 'non spécifié';

  // Déterminer les pronoms selon le genre (basé sur les vraies données)
  let pronoun = 'la personne';
  let possessive = 'sa';
  let subjectPronoun = 'elle';
  
  if (gender === 'homme') {
    pronoun = 'cet homme';
    possessive = 'son';
    subjectPronoun = 'il';
  } else if (gender === 'femme') {
    pronoun = 'cette femme';
    possessive = 'sa';
    subjectPronoun = 'elle';
  }

  // Adapter selon l'âge (basé sur les vraies données)
  let ageContext = '';
  if (age !== 'non spécifié') {
    const ageNum = parseInt(age, 10);
    if (!Number.isNaN(ageNum)) {
      if (ageNum < 18) ageContext = `(${pronoun} est ${gender === 'homme' ? 'un jeune garçon' : 'une jeune fille'} de ${ageNum} ans)`;
      else if (ageNum < 30) ageContext = `(${pronoun} est ${gender === 'homme' ? 'un jeune homme' : 'une jeune femme'} de ${ageNum} ans)`;
      else if (ageNum < 50) ageContext = `(${pronoun} est ${gender === 'homme' ? 'un adulte' : 'une adulte'} de ${ageNum} ans)`;
      else if (ageNum < 70) ageContext = `(${pronoun} est ${gender === 'homme' ? 'un senior' : 'une senior'} de ${ageNum} ans)`;
      else ageContext = `(${pronoun} est ${gender === 'homme' ? 'un vétéran' : 'une vétérane'} de ${ageNum} ans)`;
    }
  }

  const styleInstructions = {
    poetique: "Utilise un langage imagé, émouvant et lyrique.",
    factuel: "Sois direct, concret et pratique.",
    intime: "Adopte un ton chaleureux, personnel et confidentiel."
  };

  const styleInstruction = styleInstructions[style] || styleInstructions.factuel;

  try {
    console.log('='.repeat(60));
    console.log('🎯 AI SERVICE - GÉNÉRATION DE QUESTIONS');
    console.log('='.repeat(60));
    console.log('📚 bookTitle reçu:', bookTitle);
    console.log('📖 chapterTitle reçu:', chapterTitle);
    console.log('🎉 eventType reçu:', eventType);
    console.log('✍️ style reçu:', style);
    console.log('👤 recipientName reçu:', recipientName);
    console.log('📅 recipientAge reçu:', recipientAge);
    console.log('⚥ recipientGender reçu:', recipientGender);

    const promptConfig = await promptTemplateService.buildPrompt({
      promptKey: promptTemplateService.PROMPT_KEYS.QUESTION_GENERATION,
      eventType: eventType || 'generique',
      variables: {
        chapterTitle: chapterTitle || 'Chapitre',
        eventType: eventType || 'evenement',
        style: style || 'factuel',
        bookTitle: bookTitle || 'Notre livre de souvenirs',
        recipientName: name,
        recipientAge: age,
        recipientGender: gender,
        pronoun,
        possessive,
        subjectPronoun,
        ageContext,
        styleInstruction
      }
    });

    const prompt = promptConfig.userPrompt;

    console.log('📝 Prompt envoyé à Mistral (extrait):', prompt.substring(0, 300) + '...');
    console.log('🧩 Source prompt questions:', promptConfig.source, 'version:', promptConfig.version);

    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { 
          role: 'system', 
          content: promptConfig.systemPrompt
        },
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      temperature: promptConfig.temperature,
      maxTokens: promptConfig.maxTokens
    });

    const content = response.choices[0].message.content;
    console.log('📝 Réponse Mistral reçue');

    const questions = parseQuestions(content);
    if (questions.length > 0) {
      console.log('✅ Questions générées:', questions);
      return questions.slice(0, 4);
    }
    
    console.log('⚠️ Utilisation des questions par défaut');
    return getDefaultQuestions(bookTitle, chapterTitle, eventType, style, name, age, gender);
    
  } catch (error) {
    console.error('❌ Erreur génération questions:', error);
    return getDefaultQuestions(bookTitle, chapterTitle, eventType, style, name, age, gender);
  }
}

/**
 * Questions par défaut (contextuelles)
 */
function getDefaultQuestions(bookTitle, chapterTitle, eventType, style, recipientName, recipientAge, recipientGender) {
  const name = recipientName || 'la personne';
  
  // Adapter les pronoms
  const pronoun = recipientGender === 'femme' ? 'elle' : recipientGender === 'homme' ? 'lui' : 'cette personne';
  const possessive = recipientGender === 'femme' ? 'sa' : recipientGender === 'homme' ? 'son' : 'sa';
  
  const baseQuestions = [
    `En lien avec "${bookTitle}", quel souvenir lié à "${chapterTitle}" est le plus précieux pour vous concernant ${name} ?`,
    `Qu'est-ce qui rend ce moment "${chapterTitle}" unique dans l'histoire de ${name} ?`,
    `Si vous deviez décrire ${chapterTitle} en trois mots pour ce livre, lesquels choisiriez-vous ?`,
    `Quel message ou conseil souhaitez-vous partager dans ce chapitre "${chapterTitle}" avec ${name} ?`
  ];

  if (style === 'poetique') {
    return [
      `Quels mots choisis-tu pour décrire la poésie de "${chapterTitle}" dans la vie de ${name} ?`,
      `Si "${chapterTitle}" de ${name} était un poème, quels vers écrirais-tu ?`,
      `Quelle émotion ${name} éveille-t-${pronoun} en toi quand tu penses à "${chapterTitle}" ?`,
      `Quelle lumière garderas-tu de ce chapitre sur ${name} ?`
    ];
  }
  
  if (style === 'intime') {
    return [
      `Raconte-nous ce que "${chapterTitle}" représente pour toi dans la vie de ${name}.`,
      `Quel sentiment personnel ${name} évoque-t-${pronoun} en toi quand tu penses à "${chapterTitle}" ?`,
      `Partage un détail intime, même petit, sur "${chapterTitle}" de ${name}.`,
      `Qu'est-ce que tu aimerais que les autres retiennent de ${name} à travers ce chapitre ?`
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
