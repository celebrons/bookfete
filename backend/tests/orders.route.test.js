// Tests de fumee pour GET /api/orders/book/:bookId/price-estimate : seule
// route de routes/orders.js testee au niveau route pour l'instant (le reste
// du fichier n'a pas encore de couverture route-level) — couvre l'ownership
// et le fait que print_format/page_count passes en query surchargent
// l'estimation sans jamais ecrire en base.

const BOOK_ID = 'order-book-1';
const OTHER_BOOK_ID = 'order-book-2';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        { id: 'order-book-1', owner_id: 'owner-test-1', title: 'Mon livre', page_count: 24, print_format: 'luxe' },
        { id: 'order-book-2', owner_id: 'someone-else', title: "Livre d'un autre", page_count: 24 }
      ],
      // Commandes utilisees par les tests de suivi de production (2026-09-11).
      orders: [
        // PDF : aucune commande Gelato, l'etat local EST l'etat reel.
        {
          id: 'order-pdf-1',
          owner_id: 'owner-test-1',
          book_id: 'order-book-1',
          order_number: 'CMD-TEST-PDF',
          type: 'pdf',
          status: 'pdf_ready',
          metadata: {},
          updated_at: '2026-09-11T10:00:00.000Z'
        },
        // Impression deja expediee : sert a verifier qu'un statut ne recule jamais.
        {
          id: 'order-print-shipped',
          owner_id: 'owner-test-1',
          book_id: 'order-book-1',
          order_number: 'CMD-TEST-PRINT',
          type: 'print',
          status: 'shipped',
          metadata: { gelatoOrderId: 'gelato-abc' },
          updated_at: '2026-09-11T10:00:00.000Z'
        },
        { id: 'order-autre', owner_id: 'someone-else', book_id: 'order-book-2', type: 'print', status: 'paid', metadata: {} },
        // Renvoi d'un test apres changement de format (2026-09-11) : un
        // BROUILLON doit etre rejouable, une VRAIE commande jamais.
        {
          id: 'order-draft-envoye',
          owner_id: 'owner-test-1',
          book_id: 'order-book-1',
          order_number: 'CMD-TEST-DRAFT',
          type: 'print',
          status: 'awaiting_payment',
          shipping_address: {
            fullName: 'Jean Test', line1: '1 rue des Tests', postalCode: '75001', city: 'Paris', country: 'France'
          },
          metadata: { gelatoOrderId: 'gelato-draft-1', gelatoOrderType: 'draft' }
        },
        {
          id: 'order-reelle-envoyee',
          owner_id: 'owner-test-1',
          book_id: 'order-book-1',
          order_number: 'CMD-TEST-REELLE',
          type: 'print',
          status: 'paid',
          shipping_address: {
            fullName: 'Jean Test', line1: '1 rue des Tests', postalCode: '75001', city: 'Paris', country: 'France'
          },
          metadata: { gelatoOrderId: 'gelato-reel-1', gelatoOrderType: 'order' }
        }
      ]
    },
    { userId: 'owner-test-1', userEmail: 'organisateur@test.local' }
  );
  global.__ordersSupabaseMock = mock;
  return mock;
});

// routes/orders.js lit les commandes via createUserScopedClient(), qui cree
// son PROPRE client Supabase (jeton de l'utilisateur, defense en profondeur
// RLS) au lieu d'utiliser ../config/supabase. Sans ce mock, ce client
// taperait sur un vrai Supabase et toute route de commande repondrait 404
// en test. On lui rend exactement le meme magasin en memoire.
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => global.__ordersSupabaseMock
}));

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

// --- Gelato, mode test (2026-09-11) ----------------------------------------
// Envoi manuel a l'imprimeur SANS paiement (demande utilisateur : tester en
// ligne sur Render avec de vraies photos). Ce qui compte ici : le garde-fou
// production et les refus clairs — la soumission elle-meme est couverte par
// tests/printing/gelatoOrderService.test.js.
describe('Gelato — mode test', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  afterEach(() => { process.env = { ...OLD_ENV }; });

  it('GET /gelato/status dit que le test est indisponible sans cle API', async () => {
    delete process.env.GELATO_API_KEY;
    const response = await request(app)
      .get('/api/orders/gelato/status')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.configured).toBe(false);
    expect(response.body.testAvailable).toBe(false);
  });

  it('GET /gelato/status : cle API presente et mode production desactive -> test disponible', async () => {
    process.env.GELATO_API_KEY = 'cle-de-test';
    process.env.GELATO_LIVE_ORDERS = '0';
    const response = await request(app)
      .get('/api/orders/gelato/status')
      .set('Authorization', 'Bearer valid-token');

    expect(response.body.configured).toBe(true);
    expect(response.body.liveOrders).toBe(false);
    expect(response.body.testAvailable).toBe(true);
  });

  it('GET /gelato/status : GELATO_LIVE_ORDERS=1 -> test NON disponible (garde-fou production)', async () => {
    process.env.GELATO_API_KEY = 'cle-de-test';
    process.env.GELATO_LIVE_ORDERS = '1';
    const response = await request(app)
      .get('/api/orders/gelato/status')
      .set('Authorization', 'Bearer valid-token');

    expect(response.body.liveOrders).toBe(true);
    expect(response.body.testAvailable).toBe(false);
  });

  it('POST /:orderId/gelato-test refuse net quand le mode production est actif (jamais de vraie commande facturee)', async () => {
    process.env.GELATO_LIVE_ORDERS = '1';
    const response = await request(app)
      .post('/api/orders/commande-inexistante/gelato-test')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/GELATO_LIVE_ORDERS/);
  });

  it('POST /:orderId/gelato-test refuse une commande introuvable / d\'un autre proprietaire', async () => {
    process.env.GELATO_LIVE_ORDERS = '0';
    const response = await request(app)
      .post('/api/orders/commande-inexistante/gelato-test')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('POST /:orderId/gelato-test exige une authentification', async () => {
    const response = await request(app).post('/api/orders/peu-importe/gelato-test');
    expect(response.status).toBe(401);
  });
});

// --- Suivi reel de production (2026-09-11) ---------------------------------
// La garantie la plus importante ici : un aller-retour vers Gelato ne doit
// JAMAIS faire reculer une commande deja avancee, et ne doit jamais casser
// l'ecran de suivi quand l'imprimeur est injoignable ou renvoie un statut
// que nous ne savons pas traduire.
jest.mock('../services/printing/gelatoClient', () => ({
  buildOrderPayload: jest.fn(),
  createOrder: jest.fn(),
  deleteOrder: jest.fn(),
  getOrder: jest.fn()
}));
const gelatoClient = require('../services/printing/gelatoClient');

describe('GET /api/orders/:orderId/tracking', () => {
  let app;
  beforeAll(() => { app = buildApp(); });
  beforeEach(() => { gelatoClient.getOrder.mockReset(); });

  it('exige une authentification', async () => {
    const response = await request(app).get('/api/orders/order-pdf-1/tracking');
    expect(response.status).toBe(401);
  });

  it("refuse la commande d'un autre proprietaire", async () => {
    const response = await request(app)
      .get('/api/orders/order-autre/tracking')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(404);
  });

  it('commande PDF (aucune commande Gelato) : etat local, sans appeler l\'imprimeur', async () => {
    const response = await request(app)
      .get('/api/orders/order-pdf-1/tracking')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('local');
    expect(response.body.status).toBe('pdf_ready');
    expect(response.body.stale).toBe(false);
    expect(gelatoClient.getOrder).not.toHaveBeenCalled();
  });

  it('Gelato injoignable : renvoie le dernier etat connu avec stale:true, jamais une erreur', async () => {
    gelatoClient.getOrder.mockRejectedValue(new Error('API Gelato indisponible'));

    const response = await request(app)
      .get('/api/orders/order-print-shipped/tracking')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.stale).toBe(true);
    expect(response.body.source).toBe('cache');
    expect(response.body.status).toBe('shipped'); // inchange
  });

  it('statut Gelato ANTERIEUR : ne fait jamais reculer la commande', async () => {
    // Gelato dit "printed", la commande est deja "shipped" -> on garde shipped.
    gelatoClient.getOrder.mockResolvedValue({ fulfillmentStatus: 'printed' });

    const response = await request(app)
      .get('/api/orders/order-print-shipped/tracking')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('shipped');
    expect(response.body.gelatoStatus).toBe('printed');
  });

  it('statut inconnu : signale explicitement, expose la chaine brute et ne change rien', async () => {
    gelatoClient.getOrder.mockResolvedValue({ fulfillmentStatus: 'un_statut_inedit' });

    const response = await request(app)
      .get('/api/orders/order-print-shipped/tracking')
      .set('Authorization', 'Bearer valid-token');

    expect(response.body.gelatoStatusUnknown).toBe(true);
    expect(response.body.gelatoStatus).toBe('un_statut_inedit');
    expect(response.body.status).toBe('shipped');
  });

  it('remonte le numero de suivi renvoye par Gelato', async () => {
    gelatoClient.getOrder.mockResolvedValue({
      fulfillmentStatus: 'shipped',
      shipment: { shipmentMethodName: 'Colissimo', trackingCode: 'AB123', trackingUrl: 'https://suivi.test/AB123' }
    });

    const response = await request(app)
      .get('/api/orders/order-print-shipped/tracking')
      .set('Authorization', 'Bearer valid-token');

    expect(response.body.tracking).toEqual({
      carrier: 'Colissimo', code: 'AB123', url: 'https://suivi.test/AB123'
    });
  });
});

// --- Renvoi d'un test apres changement (2026-09-11) ------------------------
// L'idempotence de gelatoOrderService est indexee sur la COMMANDE, alors que
// le format d'impression vit sur le LIVRE : sans ce comportement, changer de
// format puis relancer un test repondait "Deja envoye" et rien n'etait
// regenere (retour utilisateur).
jest.mock('../services/printing/gelatoOrderService', () => ({
  submitPrintOrderToGelato: jest.fn(async () => ({ skipped: false, gelatoOrderId: 'gelato-nouveau', gelatoOrderType: 'draft' })),
  isGelatoLiveOrdersEnabled: () => process.env.GELATO_LIVE_ORDERS === '1'
}));
const { submitPrintOrderToGelato } = require('../services/printing/gelatoOrderService');

describe('POST /:orderId/gelato-test — renvoi apres changement de format', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  beforeEach(async () => {
    submitPrintOrderToGelato.mockClear();
    gelatoClient.deleteOrder.mockReset();
    gelatoClient.deleteOrder.mockResolvedValue({});
    process.env.GELATO_LIVE_ORDERS = '0';
    // Le magasin mock est partage par tout le fichier, et un renvoi efface
    // justement gelatoOrderId : sans cette remise en etat, seul le premier
    // test de ce bloc verrait un brouillon precedent a remplacer.
    await global.__ordersSupabaseMock
      .from('orders')
      .update({ metadata: { gelatoOrderId: 'gelato-draft-1', gelatoOrderType: 'draft' } })
      .eq('id', 'order-draft-envoye');
  });
  afterEach(() => { process.env = { ...OLD_ENV }; });

  it('un BROUILLON deja envoye est rejouable : relance la generation', async () => {
    const response = await request(app)
      .post('/api/orders/order-draft-envoye/gelato-test')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('started');
    expect(submitPrintOrderToGelato).toHaveBeenCalled();
  });

  it('le brouillon precedent est supprime chez Gelato (pas de tableau de bord encombre)', async () => {
    await request(app)
      .post('/api/orders/order-draft-envoye/gelato-test')
      .set('Authorization', 'Bearer valid-token');

    expect(gelatoClient.deleteOrder).toHaveBeenCalledWith('gelato-draft-1');
  });

  it("un echec de suppression du brouillon precedent n'empeche pas le nouvel envoi", async () => {
    gelatoClient.deleteOrder.mockRejectedValue(new Error('Gelato indisponible'));

    const response = await request(app)
      .post('/api/orders/order-draft-envoye/gelato-test')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(202);
    expect(submitPrintOrderToGelato).toHaveBeenCalled();
  });

  it('une VRAIE commande deja envoyee n\'est JAMAIS rejouee (pas de reimpression/refacturation)', async () => {
    const response = await request(app)
      .post('/api/orders/order-reelle-envoyee/gelato-test')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.skipped).toBe(true);
    expect(response.body.gelatoOrderId).toBe('gelato-reel-1');
    expect(submitPrintOrderToGelato).not.toHaveBeenCalled();
    expect(gelatoClient.deleteOrder).not.toHaveBeenCalled();
  });
});
