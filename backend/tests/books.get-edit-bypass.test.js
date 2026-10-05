// Retour utilisateur (2026-10-05, sur une commande REELLEMENT payee en
// production) : l'atelier affichait "Mode test — modifiable malgre le
// paiement, ce ne serait pas possible en production" sur un livre deja
// verrouille, alors que le serveur refusait bel et bien toute modification
// (423, verifie manuellement sur la vraie commande). Cause : le bandeau
// frontend (BookAtelierLuxe.js) se basait uniquement sur book.locked_at,
// jamais sur le mode reellement actif cote serveur — GET /api/books/:id ne
// renvoyait meme pas cette information. Ce test verifie le champ que la
// route doit desormais renvoyer (bookEditBypassed), sur lequel le bandeau
// se base maintenant.

const OWNER_ID = 'owner-test-1';
const BOOK_ID_LOCKED = 'book-verrouille';
const BOOK_ID_FREE = 'book-libre';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        { id: BOOK_ID_LOCKED, owner_id: OWNER_ID, title: 'Livre deja paye', locked_at: '2026-10-05T21:03:03.779Z' },
        { id: BOOK_ID_FREE, owner_id: OWNER_ID, title: 'Livre jamais paye', locked_at: null }
      ]
    },
    { userId: OWNER_ID, userEmail: 'proprietaire@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('../services/settings/appMode', () => ({
  getAppModeSync: jest.fn(() => 'test')
}));
const { getAppModeSync } = require('../services/settings/appMode');

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/books', require('../routes/books'));
  return app;
}

describe('GET /api/books/:id — bookEditBypassed', () => {
  afterEach(() => {
    getAppModeSync.mockReturnValue('test');
  });

  it('en PRODUCTION reelle, un livre verrouille renvoie bookEditBypassed=false (le bandeau "Mode test" ne doit pas s\'afficher)', async () => {
    getAppModeSync.mockReturnValue('production');
    const app = buildApp();

    const response = await request(app)
      .get(`/api/books/${BOOK_ID_LOCKED}`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.bookEditBypassed).toBe(false);
  });

  it('en mode test, un livre verrouille renvoie bookEditBypassed=true', async () => {
    getAppModeSync.mockReturnValue('test');
    const app = buildApp();

    const response = await request(app)
      .get(`/api/books/${BOOK_ID_LOCKED}`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.bookEditBypassed).toBe(true);
  });

  it('un livre jamais verrouille renvoie bookEditBypassed=false, meme en mode test (rien a signaler)', async () => {
    getAppModeSync.mockReturnValue('test');
    const app = buildApp();

    const response = await request(app)
      .get(`/api/books/${BOOK_ID_FREE}`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.bookEditBypassed).toBe(false);
  });
});
