// Demarrage sans compte (2026-09-12) — voir controllers/anonymousController.js.
//
// Ce fichier teste la partie REELLEMENT sensible de la fonctionnalite : le
// rattachement des livres commences anonymement a un compte existant.
// Transferer des livres d'un compte a un autre est exactement ce qu'un
// attaquant chercherait a detourner, et les tests portent donc d'abord sur
// les REFUS.

const ANON_ID = 'anon-user-1';
const REAL_ID = 'owner-test-1';
const OTHER_REAL_ID = 'someone-else';

// Jetons factices : le middleware d'auth et le controleur passent tous deux
// par supabase.auth.getUser(token), mocke ci-dessous.
const TOKENS = {
  'real-token': { id: REAL_ID, email: 'vrai@test.local', is_anonymous: false },
  'anon-token': { id: ANON_ID, is_anonymous: true },
  'other-real-token': { id: OTHER_REAL_ID, email: 'autre@test.local', is_anonymous: false }
};

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock({
    books: [
      { id: 'book-anon-1', owner_id: 'anon-user-1', title: 'Livre commence sans compte' },
      { id: 'book-anon-2', owner_id: 'anon-user-1', title: 'Second livre anonyme' },
      { id: 'book-autre', owner_id: 'someone-else', title: "Livre d'un autre" }
    ],
    profiles: []
  });

  // Le vrai client expose `auth.getUser(token)` : on le simule a partir de la
  // table de jetons ci-dessus, pour que middleware ET controleur voient la
  // meme verite.
  mock.auth = {
    getUser: jest.fn(async (token) => {
      const user = global.__anonTokens[token];
      if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
      return { data: { user }, error: null };
    })
  };

  global.__anonSupabaseMock = mock;
  return mock;
});

const express = require('express');
const request = require('supertest');

global.__anonTokens = TOKENS;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  return app;
}

const booksOwnedBy = (ownerId) => global.__anonSupabaseMock
  .__table('books')
  .filter((row) => row.owner_id === ownerId)
  .map((row) => row.id);

describe('POST /api/auth/anonymous/link', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  beforeEach(() => {
    // Le magasin est partage : on remet les proprietaires d'origine, sinon
    // un test qui transfere fausse tous les suivants.
    global.__anonSupabaseMock.__table('books').forEach((row) => {
      if (row.id === 'book-anon-1' || row.id === 'book-anon-2') row.owner_id = ANON_ID;
      if (row.id === 'book-autre') row.owner_id = OTHER_REAL_ID;
    });
  });

  it('exige une authentification', async () => {
    const response = await request(app).post('/api/auth/anonymous/link').send({ anonymousToken: 'anon-token' });
    expect(response.status).toBe(401);
  });

  it('transfere les livres commences anonymement vers le compte connecte', async () => {
    const response = await request(app)
      .post('/api/auth/anonymous/link')
      .set('Authorization', 'Bearer real-token')
      .send({ anonymousToken: 'anon-token' });

    expect(response.status).toBe(200);
    expect(response.body.transferred).toBe(2);
    expect(booksOwnedBy(REAL_ID).sort()).toEqual(['book-anon-1', 'book-anon-2']);
    expect(booksOwnedBy(ANON_ID)).toHaveLength(0);
  });

  it("ne touche JAMAIS aux livres d'un autre proprietaire", async () => {
    await request(app)
      .post('/api/auth/anonymous/link')
      .set('Authorization', 'Bearer real-token')
      .send({ anonymousToken: 'anon-token' });

    expect(booksOwnedBy(OTHER_REAL_ID)).toEqual(['book-autre']);
  });

  // --- Les refus : c'est ici que se joue la securite ---------------------

  it("REFUSE un jeton qui n'est pas anonyme (on ne siphonne pas un vrai compte)", async () => {
    const response = await request(app)
      .post('/api/auth/anonymous/link')
      .set('Authorization', 'Bearer real-token')
      .send({ anonymousToken: 'other-real-token' });

    expect(response.status).toBe(200);
    expect(response.body.transferred).toBe(0);
    // Le livre de l'autre compte n'a pas bouge d'un pouce.
    expect(booksOwnedBy(OTHER_REAL_ID)).toEqual(['book-autre']);
  });

  it('REFUSE un jeton invalide ou perime, sans rien transferer', async () => {
    const response = await request(app)
      .post('/api/auth/anonymous/link')
      .set('Authorization', 'Bearer real-token')
      .send({ anonymousToken: 'jeton-invente' });

    expect(response.status).toBe(200);
    expect(response.body.transferred).toBe(0);
    expect(booksOwnedBy(ANON_ID).sort()).toEqual(['book-anon-1', 'book-anon-2']);
  });

  it('REFUSE de transferer quoi que ce soit vers un compte encore anonyme', async () => {
    const response = await request(app)
      .post('/api/auth/anonymous/link')
      .set('Authorization', 'Bearer anon-token')
      .send({ anonymousToken: 'anon-token' });

    expect(response.status).toBe(400);
  });

  it('sans jeton anonyme fourni : succes a 0 livre, jamais une erreur', async () => {
    // Cas le plus frequent : une connexion normale, sans livre commence.
    const response = await request(app)
      .post('/api/auth/anonymous/link')
      .set('Authorization', 'Bearer real-token')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.transferred).toBe(0);
  });
});

describe('POST /api/auth/anonymous/complete', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('cree le profil manquant apres conversion du compte anonyme', async () => {
    const response = await request(app)
      .post('/api/auth/anonymous/complete')
      .set('Authorization', 'Bearer real-token')
      .send({ full_name: 'Jean Test' });

    expect(response.status).toBe(200);
    expect(response.body.full_name).toBe('Jean Test');
    expect(global.__anonSupabaseMock.__table('profiles').some((row) => row.id === REAL_ID)).toBe(true);
  });

  it('REFUSE si le compte est encore anonyme (la conversion a echoue)', async () => {
    const response = await request(app)
      .post('/api/auth/anonymous/complete')
      .set('Authorization', 'Bearer anon-token')
      .send({ full_name: 'Jean Test' });

    expect(response.status).toBe(409);
  });
});
