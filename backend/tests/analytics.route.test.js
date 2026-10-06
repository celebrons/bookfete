// Route publique d'enregistrement de visite : jamais bloquante pour le
// visiteur, meme si l'ecriture echoue (voir services/analytics/pageViews.js).

jest.mock('../services/analytics/pageViews', () => ({
  recordPageView: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const { recordPageView } = require('../services/analytics/pageViews');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(require('../routes/analytics'));
  return app;
}

describe('POST /api/analytics/pageview', () => {
  beforeEach(() => { recordPageView.mockReset(); });

  it('repond 204 et transmet chemin/referrer', async () => {
    recordPageView.mockResolvedValue(undefined);
    const response = await request(buildApp())
      .post('/api/analytics/pageview')
      .send({ path: '/tarifs', referrer: 'https://www.google.com' });

    expect(response.status).toBe(204);
    expect(recordPageView).toHaveBeenCalledWith({ path: '/tarifs', referrer: 'https://www.google.com' });
  });

  it("repond 204 meme si l'enregistrement echoue : jamais bloquant pour le visiteur", async () => {
    recordPageView.mockRejectedValue(new Error('base injoignable'));
    const response = await request(buildApp()).post('/api/analytics/pageview').send({ path: '/' });
    expect(response.status).toBe(204);
  });

  it('aucun corps envoye -> repond quand meme 204', async () => {
    recordPageView.mockResolvedValue(undefined);
    const response = await request(buildApp()).post('/api/analytics/pageview');
    expect(response.status).toBe(204);
  });
});
