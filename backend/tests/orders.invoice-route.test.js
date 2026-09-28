// GET /api/orders/:orderId/invoice — URL signee de telechargement, si la
// facture existe deja. La generation elle-meme (invoiceService.js) est
// testee a part (tests/invoicing/) ; ce fichier verifie seulement la route :
// verification de commande, RLS via le proprietaire, 404 explicite tant
// qu'aucune facture n'existe.

const OWNER_ID = 'owner-test-1';
const BOOK_ID = 'book-1';

jest.mock('../services/invoicing/invoiceService', () => ({
  generateInvoiceForOrder: jest.fn(),
  signedInvoiceUrl: jest.fn(async (path) => `https://x.test/signed/${path}`),
  buildLineItems: jest.requireActual('../services/invoicing/invoiceService').buildLineItems,
  INVOICES_BUCKET: 'invoices'
}));

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [{ id: BOOK_ID, owner_id: OWNER_ID, title: 'Portugal 2025', page_count: 34, print_format: 'standard' }],
      orders: [
        { id: 'order-avec-facture', owner_id: OWNER_ID, book_id: BOOK_ID, status: 'paid', type: 'print' },
        { id: 'order-sans-facture', owner_id: OWNER_ID, book_id: BOOK_ID, status: 'awaiting_payment', type: 'print' },
        { id: 'order-dun-autre', owner_id: 'un-autre-proprietaire', book_id: BOOK_ID, status: 'paid', type: 'print' }
      ],
      invoices: [
        {
          id: 'invoice-1', order_id: 'order-avec-facture', owner_id: OWNER_ID,
          invoice_number: 'F-2026-000001', issued_at: '2026-09-28T10:00:00.000Z',
          storage_path: 'orders/order-avec-facture/F-2026-000001.pdf',
          totals: { totalCents: 4930 }
        }
      ]
    },
    { userId: OWNER_ID, userEmail: 'proprietaire@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => global.__supabaseMock
}));

jest.mock('../services/email/transactionalEmails', () => ({
  envoyerCommandeConfirmee: jest.fn(async () => ({ sent: false })),
  envoyerPaiementRecu: jest.fn(async () => ({ sent: false })),
  envoyerFacture: jest.fn(async () => ({ sent: false })),
  isEmailEnabled: jest.fn(() => false)
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../routes/orders'));
  return app;
}

describe('GET /api/orders/:orderId/invoice', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('facture existante : renvoie le numero et une URL signee', async () => {
    const reponse = await request(app)
      .get('/api/orders/order-avec-facture/invoice')
      .set('Authorization', 'Bearer valid-token');

    expect(reponse.status).toBe(200);
    expect(reponse.body.invoiceNumber).toBe('F-2026-000001');
    expect(reponse.body.totalCents).toBe(4930);
    expect(reponse.body.url).toContain('F-2026-000001.pdf');
  });

  it('commande sans facture (pas encore payee) : 404 explicite', async () => {
    const reponse = await request(app)
      .get('/api/orders/order-sans-facture/invoice')
      .set('Authorization', 'Bearer valid-token');

    expect(reponse.status).toBe(404);
  });

  it('commande d un autre proprietaire : 404, jamais l URL d un tiers', async () => {
    const reponse = await request(app)
      .get('/api/orders/order-dun-autre/invoice')
      .set('Authorization', 'Bearer valid-token');

    expect(reponse.status).toBe(404);
  });

  it('commande inexistante : 404', async () => {
    const reponse = await request(app)
      .get('/api/orders/inexistante/invoice')
      .set('Authorization', 'Bearer valid-token');

    expect(reponse.status).toBe(404);
  });
});
