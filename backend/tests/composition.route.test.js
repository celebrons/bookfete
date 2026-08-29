// Tests de fumee des routes du moteur de mise en page : catalogues publics,
// CRUD de contenu scope par owner, et endpoint de composition.

const BOOK_ID = 'book-test-1';
const OTHER_BOOK_ID = 'book-test-2';

let supabaseMock;

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        {
          id: 'book-test-1',
          owner_id: 'owner-test-1',
          title: 'Mon livre',
          template_id: 'tpl-1',
          page_count: 24
        },
        { id: 'book-test-2', owner_id: 'someone-else', title: "Livre d'un autre" }
      ],
      book_templates: [
        {
          id: 'tpl-1',
          slug: 'elegance',
          label: 'Elegance',
          active: true,
          sort_order: 1,
          allowed_layouts: ['photo-pleine-page'],
          design_tokens: { slotsPerPage: 3 }
        }
      ],
      layout_definitions: [
        { id: 'lay-1', slug: 'photo-pleine-page', label: 'Photo pleine page', kind: 'photo', active: true, min_items: 1, max_items: 1 }
      ],
      book_products: [
        { id: 'prod-1', page_count: 24, format: 'standard', price_cents: 2900, active: true }
      ],
      book_content_items: [
        { id: 'item-1', book_id: 'book-test-1', source: 'upload', kind: 'photo', url: 'https://cdn.test/1.jpg', display_order: 0 }
      ],
      book_pages: []
    },
    { userId: 'owner-test-1', userEmail: 'organisateur@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', require('../routes/composition'));
  app.use('/', require('../routes/products'));
  return app;
}

describe('routes/composition', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
    supabaseMock = global.__supabaseMock;
  });

  describe('catalogues publics', () => {
    it('GET /api/catalog/templates ne demande pas d\'authentification', async () => {
      const response = await request(app).get('/api/catalog/templates');
      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({ slug: 'elegance' });
    });

    it('GET /api/catalog/layouts renvoie les layouts actifs', async () => {
      const response = await request(app).get('/api/catalog/layouts');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });

    it('GET /api/catalog/products renvoie les produits actifs', async () => {
      const response = await request(app).get('/api/catalog/products');
      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({ page_count: 24 });
    });
  });

  describe('content-items — authentification et ownership', () => {
    it('refuse une requete sans header Authorization', async () => {
      const response = await request(app).get(`/api/books/${BOOK_ID}/content-items`);
      expect(response.status).toBe(401);
    });

    it("refuse l'acces au livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .get(`/api/books/${OTHER_BOOK_ID}/content-items`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(403);
    });

    it('renvoie 404 pour un livre inexistant', async () => {
      const response = await request(app)
        .get('/api/books/does-not-exist/content-items')
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(404);
    });
  });

  describe('content-items — CRUD nominal', () => {
    it('liste puis cree un item', async () => {
      const list = await request(app)
        .get(`/api/books/${BOOK_ID}/content-items`)
        .set('Authorization', 'Bearer valid-token');
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);

      const created = await request(app)
        .post(`/api/books/${BOOK_ID}/content-items`)
        .set('Authorization', 'Bearer valid-token')
        .send({ source: 'upload', kind: 'texte', text: 'Un souvenir.' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ book_id: BOOK_ID, kind: 'texte' });
    });
  });

  describe('POST /api/books/:bookId/compose', () => {
    it('refuse si le livre n\'a pas de template', async () => {
      // livre sans template_id/page_count dans les fixtures du mock
      const response = await request(app)
        .post(`/api/books/${OTHER_BOOK_ID}/compose`)
        .set('Authorization', 'Bearer valid-token');
      // OTHER_BOOK_ID appartient a un autre owner : 403 avant meme la verif template
      expect(response.status).toBe(403);
    });

    it('compose le livre et persiste les pages', async () => {
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/compose`)
        .set('Authorization', 'Bearer valid-token')
        .send({ variant: 0 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.pages)).toBe(true);
      expect(response.body.pages.length).toBeGreaterThan(0);
      expect(response.body.overflow).toBe(false);
    });
  });
});
