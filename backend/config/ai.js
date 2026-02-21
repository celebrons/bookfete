// backend/config/ai.js
const axios = require('axios');

class AIConfig {
  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY;
    this.baseURL = 'https://api.mistral.ai/v1';
    this.model = 'mistral-small-latest'; // Bon rapport qualité/prix
    
    if (!this.apiKey) {
      console.warn('⚠️ MISTRAL_API_KEY manquante dans .env');
    }
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }
}

module.exports = new AIConfig();