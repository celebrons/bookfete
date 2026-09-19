// Un paiement encaisse par Stripe ne doit pas dependre d'un onglet de navigateur.
//
// Le 2026-09-19, un client a paye 94,50 EUR puis est tombe sur une page
// blanche. Comme c'etait cette page qui annoncait le paiement au serveur, la
// commande est restee « awaiting_payment » : Stripe avait l'argent, nous
// n'avions rien. Un onglet ferme trop tot, un reseau qui lache ou un
// telephone qui se verrouille donnaient exactement le meme resultat.
//
// Ouvrir la commande suffit desormais a rattraper le paiement. Ces tests
// gardent les trois regles qui comptent : on rattrape quand Stripe dit
// « paye », on ne rattrape PAS le reste, et Stripe injoignable n'empeche
// jamais d'afficher la commande.

const ORDER_PAYE = 'order-paye-chez-stripe';
const ORDER_IMPAYE = 'order-jamais-paye';
const OWNER_ID = 'owner-test-1';
const SESSION_PAYEE = 'cs_test_payee';
const SESSION_IMPAYEE = 'cs_test_impayee';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const commande = (id, sessionId) => ({
    id,
    owner_id: OWNER_ID,
    order_number: `CMD-${id}`,
    status: 'awaiting_payment',
    type: 'pdf',
    book_id: 'book-1',
    metadata: { stripeCheckoutSessionId: sessionId }
  });
  const mock = createSupabaseMock(
    {
      orders: [commande(ORDER_PAYE, SESSION_PAYEE), commande(ORDER_IMPAYE, SESSION_IMPAYEE)],
      books: [{ id: 'book-1', owner_id: OWNER_ID, title: 'Livre', page_count: 30, print_format: 'luxe' }]
    },
    { userId: OWNER_ID, userEmail: 'proprietaire@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

// routes/orders.js lit les commandes via createUserScopedClient(), qui cree
// son PROPRE client Supabase : sans ce mock, chaque route repond 404.
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => global.__supabaseMock
}));

// Le double de Stripe. `mock` en prefixe : jest l'exige pour toute variable
// citee dans une fabrique de mock.
const mockSessions = {
  [SESSION_PAYEE]: {
    id: SESSION_PAYEE,
    payment_status: 'paid',
    payment_intent: 'pi_test_1',
    amount_total: 9450,
    metadata: { orderId: ORDER_PAYE }
  },
  [SESSION_IMPAYEE]: {
    id: SESSION_IMPAYEE,
    payment_status: 'unpaid',
    metadata: { orderId: ORDER_IMPAYE }
  }
};
const mockRetrieve = jest.fn(async (id) => {
  if (mockSessions[id]) return mockSessions[id];
  throw new Error('Session Stripe introuvable');
});

jest.mock('stripe', () => jest.fn(() => ({
  checkout: { sessions: { retrieve: mockRetrieve } }
})));

jest.mock('../services/printing/gelatoClient', () => ({
  deleteOrder: jest.fn(async () => ({})),
  getOrder: jest.fn(async () => ({})),
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

const lire = (app, id) => request(app)
  .get(`/api/orders/${id}`)
  .set('Authorization', 'Bearer valid-token');

describe('Un paiement encaisse est retrouve meme si le navigateur ne revient pas', () => {
  let app;

  beforeAll(() => {
    // routes/orders.js lit ces deux variables AU CHARGEMENT du module : il
    // faut donc les poser avant le require fait par buildApp().
    process.env.STRIPE_ENABLED = '1';
    process.env.STRIPE_SECRET_KEY = 'sk_test_pour_les_tests';
    app = buildApp();
  });

  beforeEach(() => {
    mockRetrieve.mockClear();
  });

  it('ouvrir la commande suffit a enregistrer le paiement', async () => {
    const reponse = await lire(app, ORDER_PAYE);

    expect(reponse.status).toBe(200);
    expect(reponse.body.status).toBe('paid');
    expect(mockRetrieve).toHaveBeenCalledWith(SESSION_PAYEE);
  });

  it('la base le retient, pas seulement la reponse', async () => {
    await lire(app, ORDER_PAYE);

    const enBase = global.__supabaseMock.__store.get('orders')
      .find((o) => o.id === ORDER_PAYE);
    expect(enBase.status).toBe('paid');
    expect(enBase.paid_at).toBeTruthy();
    // La source est tracee : un paiement rattrape apres coup ne se confond
    // pas avec un retour normal depuis Stripe.
    expect(enBase.metadata.stripeConfirmationSource).toBe('rattrapage');
  });

  it("une session que Stripe declare impayee ne paie rien", async () => {
    const reponse = await lire(app, ORDER_IMPAYE);

    expect(reponse.status).toBe(200);
    expect(reponse.body.status).toBe('awaiting_payment');

    const enBase = global.__supabaseMock.__store.get('orders')
      .find((o) => o.id === ORDER_IMPAYE);
    expect(enBase.status).toBe('awaiting_payment');
  });

  it('Stripe injoignable n empeche pas d afficher la commande', async () => {
    mockRetrieve.mockRejectedValueOnce(new Error('Stripe est tombe'));

    const reponse = await lire(app, ORDER_IMPAYE);

    // Le client doit voir sa commande, meme si on ne peut pas verifier le
    // paiement a cet instant : refuser l'affichage serait pire.
    expect(reponse.status).toBe(200);
    expect(reponse.body.id).toBe(ORDER_IMPAYE);
  });
});
