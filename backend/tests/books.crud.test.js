// Tests de fumee du CRUD livres : verifient le comportement observable des
// routes avant/apres refactoring (codes HTTP, forme des reponses, filtrage owner).

const fixture = require('./fixtures/bookFixture');

let supabaseMock;

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const bookFixture = require('./fixtures/bookFixture');
  const mock = createSupabaseMock(bookFixture.buildTables(), {
    userId: bookFixture.OWNER_ID,
    userEmail: bookFixture.OWNER_EMAIL
  });
  global.__supabaseMock = mock;
  return mock;
});

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/books', require('../routes/books'));
  return app;
}

describe('routes/books — CRUD', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
    supabaseMock = global.__supabaseMock;
  });

  describe('authentification', () => {
    it('refuse une requete sans header Authorization', async () => {
      const response = await request(app).get('/api/books');
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Token manquant' });
    });

    it('refuse un header mal forme', async () => {
      const response = await request(app).get('/api/books').set('Authorization', 'token-brut');
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Format de token invalide' });
    });

    it('refuse un token invalide', async () => {
      const response = await request(app).get('/api/books').set('Authorization', 'Bearer invalid');
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Token invalide' });
    });
  });

  describe('GET /api/books', () => {
    it('retourne les livres du proprietaire', async () => {
      const response = await request(app).get('/api/books').set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: fixture.BOOK_ID,
        title: fixture.book.title,
        owner_id: fixture.OWNER_ID
      });
    });

    it('filtre sur owner_id et trie par date de creation descendante', async () => {
      supabaseMock.__calls.length = 0;
      await request(app).get('/api/books').set('Authorization', 'Bearer valid-token');

      const call = supabaseMock.__calls.find((entry) => entry.table === 'books');
      expect(call.filters).toEqual([{ type: 'eq', column: 'owner_id', value: fixture.OWNER_ID }]);
      expect(call.order).toEqual({ column: 'created_at', ascending: false });
    });
  });

  describe('GET /api/books/:id', () => {
    it('retourne le livre demande', async () => {
      const response = await request(app)
        .get(`/api/books/${fixture.BOOK_ID}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(fixture.BOOK_ID);
    });

    it('renvoie une erreur quand le livre est introuvable', async () => {
      const response = await request(app)
        .get('/api/books/book-inexistant')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/books', () => {
    it('cree un livre en forcant owner_id depuis le token', async () => {
      const response = await request(app)
        .post('/api/books')
        .set('Authorization', 'Bearer valid-token')
        .send({ title: 'Nouveau livre', owner_id: 'usurpateur-1' });

      expect(response.status).toBe(201);
      expect(response.body.owner_id).toBe(fixture.OWNER_ID);
      expect(response.body.title).toBe('Nouveau livre');
    });
  });

  describe('PUT /api/books/:id', () => {
    it('met a jour le livre du proprietaire', async () => {
      const response = await request(app)
        .put(`/api/books/${fixture.BOOK_ID}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ title: 'Titre modifie' });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Titre modifie');
    });

    it('applique le double filtre id + owner_id', async () => {
      supabaseMock.__calls.length = 0;
      await request(app)
        .put(`/api/books/${fixture.BOOK_ID}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ title: 'Autre titre' });

      const call = supabaseMock.__calls.find((entry) => entry.operation === 'update');
      expect(call.filters).toEqual([
        { type: 'eq', column: 'id', value: fixture.BOOK_ID },
        { type: 'eq', column: 'owner_id', value: fixture.OWNER_ID }
      ]);
    });
  });

  describe('DELETE /api/books/:id', () => {
    it('supprime le livre et repond success', async () => {
      const response = await request(app)
        .delete('/api/books/book-a-supprimer')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });

    it('applique le double filtre id + owner_id', async () => {
      supabaseMock.__calls.length = 0;
      await request(app)
        .delete(`/api/books/${fixture.BOOK_ID}`)
        .set('Authorization', 'Bearer valid-token');

      const call = supabaseMock.__calls.find((entry) => entry.operation === 'delete');
      expect(call.filters).toEqual([
        { type: 'eq', column: 'id', value: fixture.BOOK_ID },
        { type: 'eq', column: 'owner_id', value: fixture.OWNER_ID }
      ]);
    });
  });
});
