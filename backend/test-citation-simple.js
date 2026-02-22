// backend/test-citation-simple.js
require('dotenv').config();
const { Mistral } = require('@mistralai/mistralai');

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

async function testCitation() {
  console.log('🤖 Test de génération de citations (5 essais)\n');
  
  const contextes = [
    { style: "intime", titre: "Souvenirs de famille" },
    { style: "poetique", titre: "Notre histoire d'amour" },
    { style: "factuel", titre: "Le grand voyage" }
  ];

  for (const ctx of contextes) {
    console.log(`\n📚 Contexte: ${ctx.titre} (${ctx.style})`);
    console.log('─'.repeat(40));
    
    for (let i = 1; i <= 3; i++) {
      try {
        const response = await mistral.chat.complete({
          model: 'mistral-small-latest',
          messages: [
            { 
              role: 'system', 
              content: 'Tu génères des citations originales. Varie à chaque réponse.' 
            },
            { 
              role: 'user', 
              content: `Génère une citation inspirante pour un chapitre intitulé "${ctx.titre}" dans un style ${ctx.style}. Sois créatif et différent à chaque fois.` 
            }
          ],
          temperature: 0.9,
          maxTokens: 50
        });
        
        console.log(`${i}. "${response.choices[0].message.content}"`);
      } catch (error) {
        console.log(`${i}. ❌ Erreur: ${error.message}`);
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

testCitation();