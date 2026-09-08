// Tests de fumee pour GET /api/orders/book/:bookId/price-estimate : seule
// route de routes/orders.js testee au niveau route pour l'instant (le reste
// du fichier n'a pas encore de couverture route-level) — couvre l'ownership
// et le fait que print_format/page_count passes en query surchargent
// l'estimation sans jamais ecrire en base.

const BOOK_ID = 'order-book-1';
const OTHER_BOOK_ID = 'order-book-2';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  return createSupabaseMock(
    {
      books: [
        { id: 'order-book-1', owner_id: 'owner-test-1', title: 'Mon livre', page_count: 24, print_format: 'luxe' },
        { id: 'order-book-2', owner_id: 'someone-else', title: "Livre d'un autre", page_count: 24 }
      ]
    },
    { userId: 'owner-test-1', userEmail: 'organisateur@test.local' }
  );
});

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../routes/orders'));
  return app;
}

describe('GET /api/orders/book/:bookId/price-estimate', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  it('refuse une requete sans header Authorization', async () => {
    const response = await request(app).get(`/api/orders/book/${BOOK_ID}/price-estimate`);
    expect(response.status).toBe(401);
  });

  it("refuse le livre d'un autre proprietaire", async () => {
    const response = await request(app)
      .get(`/api/orders/book/${OTHER_BOOK_ID}/price-estimate`)
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(404);
  });

  it('renvoie 404 pour un livre inexistant', async () => {
    const response = await request(app)
      .get('/api/orders/book/does-not-exist/price-estimate')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(404);
  });

  it('sans parametre : utilise les valeurs reelles du livre (luxe, 24 pages)', async () => {
    const response = await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ printFormat: 'luxe', pageCount: 24, unitCents: 10020, totalCents: 10020 });
  });

  it('print_format en query surcharge le format reel du livre, sans le persister', async () => {
    const response = await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate?print_format=livret`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ printFormat: 'livret', pageCount: 24, unitCents: 4900, totalCents: 4900 });
  });

  it('page_count en query surcharge la pagination reelle, pour previsualiser avant sauvegarde', async () => {
    const response = await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate?page_count=64`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ printFormat: 'luxe', pageCount: 64, unitCents: 15220, totalCents: 15220 });
  });

  it('print_format et page_count combines', async () => {
    const response = await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate?print_format=standard&page_count=64`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ printFormat: 'standard', pageCount: 64, unitCents: 10340, totalCents: 10340 });
  });

  it('ne persiste jamais la surcharge (le livre reel n\'est pas modifie)', async () => {
    await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate?print_format=livret&page_count=8`)
      .set('Authorization', 'Bearer valid-token');

    const again = await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate`)
      .set('Authorization', 'Bearer valid-token');

    expect(again.body).toEqual({ printFormat: 'luxe', pageCount: 24, unitCents: 10020, totalCents: 10020 });
  });

  it("type et quantity (optionnels, defaut 'print'/1) simulent le vrai prix d'une commande PDF/Pack/quantite multiple", async () => {
    const pdf = await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate?type=pdf`)
      .set('Authorization', 'Bearer valid-token');
    expect(pdf.body.totalCents).toBe(3900); // tarif PDF plat, ignore print_format/page_count

    const pack = await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate?type=pack`)
      .set('Authorization', 'Bearer valid-token');
    expect(pack.body.unitCents).toBe(10020 + 2000);

    const doublePrint = await request(app)
      .get(`/api/orders/book/${BOOK_ID}/price-estimate?type=print&quantity=2`)
      .set('Authorization', 'Bearer valid-token');
    expect(doublePrint.body.unitCents).toBe(10020);
    expect(doublePrint.body.totalCents).toBe(10020 * 2);
  });
});
