// Retour utilisateur (2026-09-28, plan de mise en production — "Ne plus
// reecrire le prix d'une commande payee") : POST /:orderId/gelato-test
// recalculait le prix (unit_cents/total_cents/snapshot) SANS jamais
// verifier le statut de la commande — un envoi de test sur une commande
// DEJA PAYEE ecrasait silencieusement le montant reellement encaisse par
// Stripe, rendant fausse toute facture qui en decoulerait. Corrige :
// aucune reecriture de prix pour une commande deja payee (ou au-dela) ;
// un brouillon (draft/awaiting_payment) continue de se faire reprix
// normalement, exactement comme avant ce correctif.

const OWNER_ID = 'owner-test-1';
const BOOK_ID = 'book-reprice-1';
const ADRESSE = {
  fullName: 'Jean Test', line1: '1 rue des Tests', postalCode: '75001', city: 'Paris', country: 'France'
};

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [{ id: BOOK_ID, owner_id: OWNER_ID, title: 'Livre', page_count: 34, print_format: 'standard' }],
      orders: [
        {
          id: 'order-deja-payee',
          owner_id: OWNER_ID,
          book_id: BOOK_ID,
          order_number: 'CMD-PAYEE-1',
          type: 'print',
          status: 'paid',
          quantity: 1,
          unit_cents: 4430,
          total_cents: 4930,
          shipping_address: ADRESSE,
          snapshot: { bookPriceCents: 4430, shippingPriceCents: 500, totalPriceCents: 4930, pricingVersion: 'figee-au-paiement' },
          metadata: {}
        },
        {
          id: 'order-brouillon',
          owner_id: OWNER_ID,
          book_id: BOOK_ID,
          order_number: 'CMD-BROUILLON-1',
          type: 'print',
          status: 'awaiting_payment',
          quantity: 1,
          unit_cents: 1,
          total_cents: 1,
          shipping_address: ADRESSE,
          snapshot: {},
          metadata: {}
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

jest.mock('../services/printing/gelatoOrderService', () => ({
  submitPrintOrderToGelato: jest.fn(async () => ({ gelatoOrderId: 'draft-test', gelatoOrderType: 'draft' })),
  isGelatoLiveOrdersEnabled: jest.fn(() => false)
}));

jest.mock('../services/printing/gelatoClient', () => ({
  deleteOrder: jest.fn(async () => ({})),
  getOrder: jest.fn(async () => ({})),
  buildOrderPayload: jest.fn(() => ({})),
  createOrder: jest.fn(async () => ({}))
}));

jest.mock('../services/events/eventLog', () => ({
  logEvent: jest.fn(),
  listEvents: jest.fn(async () => []),
  purgeEvents: jest.fn(async () => ({ removed: 0 })),
  environnement: jest.fn(() => 'test')
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  process.env.GELATO_API_KEY = 'cle-de-test';
  delete process.env.GELATO_LIVE_ORDERS;
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../routes/orders'));
  return app;
}

const ligne = (id) => global.__supabaseMock.__table('orders').find((o) => o.id === id);

describe('POST /:orderId/gelato-test — ne reecrit jamais le prix d\'une commande deja payee', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  it('commande PAYEE : unit_cents/total_cents/snapshot restent EXACTEMENT ce que Stripe a encaisse', async () => {
    const reponse = await request(app)
      .post('/api/orders/order-deja-payee/gelato-test')
      .set('Authorization', 'Bearer valid-token');

    expect(reponse.status).toBe(202);

    const commande = ligne('order-deja-payee');
    expect(commande.unit_cents).toBe(4430);
    expect(commande.total_cents).toBe(4930);
    expect(commande.snapshot).toEqual({
      bookPriceCents: 4430, shippingPriceCents: 500, totalPriceCents: 4930, pricingVersion: 'figee-au-paiement'
    });
    // Le prix recalcule n'est pas non plus glisse dans metadata.pricing —
    // ce champ, lui aussi, doit rester celui fige au paiement (absent ici,
    // donc toujours absent).
    expect(commande.metadata.pricing).toBeUndefined();
    // Les metadonnees liees a l'envoi Gelato, elles, continuent d'etre
    // ecrites normalement : ce correctif ne doit pas casser l'envoi de test.
    expect(commande.metadata.gelatoTestStartedAt).toBeTruthy();
  });

  it('commande encore EN BROUILLON : le prix continue de se recalculer normalement (comportement inchange)', async () => {
    const reponse = await request(app)
      .post('/api/orders/order-brouillon/gelato-test')
      .set('Authorization', 'Bearer valid-token');

    expect(reponse.status).toBe(202);

    const commande = ligne('order-brouillon');
    // 34 pages, standard : 3990 + (4/2)*220 = 4430 (grille tarifaire reelle,
    // pas le "1" arbitraire pose dans la fixture pour rendre ce test
    // probant s'il n'etait pas recalcule).
    expect(commande.unit_cents).toBe(4430);
    expect(commande.total_cents).toBe(4430 + 600);
    expect(commande.metadata.pricing).toBeTruthy();
  });
});
