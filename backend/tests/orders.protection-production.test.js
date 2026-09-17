// Une commande PARTIE EN PRODUCTION ne doit jamais pouvoir etre supprimee.
//
// Constate le 2026-09-18 sur une vraie commande payee : l'application avait
// cree un BROUILLON chez Gelato, que l'utilisateur a ensuite confirme depuis
// le tableau de bord Gelato. Cote Gelato : orderType `order`, financialStatus
// `paid`, un livre en fabrication. Cote Celebrons : metadata.gelatoOrderType
// valait toujours `draft`.
//
// Or c'est precisement ce champ que teste le garde-fou de la suppression. Il
// etait donc desarme : le bouton « Supprimer cette commande » aurait efface la
// commande ET son fichier d'impression alors qu'un livre paye partait en
// fabrication.
//
// Deux correctifs, testes ici :
//  - le suivi enregistre le type REEL a chaque consultation (jamais a
//    l'envers : `order` ne redevient pas `draft`) ;
//  - la suppression interroge Gelato plutot que de croire sa propre base, et
//    refuse si elle ne peut pas verifier.

const OWNER_ID = 'owner-test-1';
const BOOK_ID = 'book-prod';

const commande = (id, metadata) => ({
  id,
  owner_id: OWNER_ID,
  order_number: `CMD-${id}`,
  status: 'sent_to_printer',
  type: 'print',
  book_id: BOOK_ID,
  quantity: 1,
  total_cents: 10800,
  shipping_address: {
    fullName: 'Chikhi Nadjib', line1: '1 rue des Tests', postalCode: '75001', city: 'Paris', country: 'FR'
  },
  metadata
});

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      orders: [
        // Celle du 2026-09-18 : nos metadonnees disent `draft`, Gelato dira
        // `order`.
        commande('order-confirmee-chez-gelato', { gelatoOrderId: 'gel-confirmee', gelatoOrderType: 'draft' }),
        // Un vrai brouillon, qui doit rester supprimable.
        commande('order-brouillon', { gelatoOrderId: 'gel-brouillon', gelatoOrderType: 'draft' }),
        // Gelato injoignable pour celle-ci.
        commande('order-gelato-muet', { gelatoOrderId: 'gel-muet', gelatoOrderType: 'draft' }),
        // Jamais envoyee : rien a verifier aupres de l'imprimeur.
        commande('order-jamais-envoyee', {})
      ],
      books: [{ id: BOOK_ID, owner_id: OWNER_ID, title: 'Voyage', page_count: 30, print_format: 'luxe' }]
    },
    { userId: OWNER_ID, userEmail: 'proprietaire@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => global.__supabaseMock
}));

jest.mock('../services/printing/gelatoClient', () => ({
  deleteOrder: jest.fn(async () => ({})),
  getOrder: jest.fn(async (id) => {
    if (id === 'gel-confirmee') {
      return { orderType: 'order', financialStatus: 'paid', fulfillmentStatus: 'passed', items: [{ fulfillmentStatus: 'passed' }] };
    }
    if (id === 'gel-muet') {
      throw new Error('Gelato injoignable');
    }
    return { orderType: 'draft', items: [] };
  }),
  buildOrderPayload: jest.fn(() => ({})),
  createOrder: jest.fn(async () => ({}))
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../routes/orders'));
  return app;
}

const idsEnBase = () => global.__supabaseMock.__store.get('orders').map((o) => o.id);
const metadataDe = (id) => (global.__supabaseMock.__store.get('orders').find((o) => o.id === id) || {}).metadata || {};

describe('DELETE /api/orders/:orderId — commande confirmee chez Gelato', () => {
  let app;

  beforeAll(() => { app = buildApp(); });

  const supprimer = (id) => request(app)
    .delete(`/api/orders/${id}`)
    .set('Authorization', 'Bearer valid-token');

  it('REFUSE alors que nos metadonnees la croient encore brouillon', async () => {
    const reponse = await supprimer('order-confirmee-chez-gelato');

    expect(reponse.status).toBe(409);
    expect(String(reponse.body.error)).toMatch(/production/i);
    expect(idsEnBase()).toContain('order-confirmee-chez-gelato');
  });

  it('corrige nos metadonnees au passage, pour ne plus avoir a demander', async () => {
    await supprimer('order-confirmee-chez-gelato');
    expect(metadataDe('order-confirmee-chez-gelato').gelatoOrderType).toBe('order');
  });

  it("REFUSE quand l'imprimeur est injoignable — en cas de doute, on protege", async () => {
    const reponse = await supprimer('order-gelato-muet');

    expect(reponse.status).toBe(409);
    expect(String(reponse.body.error)).toMatch(/verifier/i);
    expect(idsEnBase()).toContain('order-gelato-muet');
  });

  it('laisse supprimer un VRAI brouillon', async () => {
    const reponse = await supprimer('order-brouillon');

    expect(reponse.status).toBe(200);
    expect(idsEnBase()).not.toContain('order-brouillon');
  });

  it("laisse supprimer une commande jamais envoyee, sans appeler l'imprimeur", async () => {
    const gelatoClient = require('../services/printing/gelatoClient');
    gelatoClient.getOrder.mockClear();

    const reponse = await supprimer('order-jamais-envoyee');

    expect(reponse.status).toBe(200);
    expect(gelatoClient.getOrder).not.toHaveBeenCalled();
  });
});
