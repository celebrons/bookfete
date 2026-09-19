// Le webhook Stripe : le seul point ou un paiement est enregistre sans
// dependre d'un navigateur.
//
// Le 2026-09-19, un client a paye 94,50 EUR et est retombe sur une page
// blanche : la commande est restee « awaiting_payment ». Le code du webhook
// existait deja et aurait tout rattrape — il n'etait simplement declare nulle
// part chez Stripe, et AUCUN test ne le couvrait.
//
// Ces tests verifient la signature pour de vrai : on ne remplace pas la
// librairie Stripe, on lui fait signer l'evenement puis on le lui fait
// verifier. Un test qui accepterait n'importe quoi serait pire que rien sur
// une route non authentifiee, ouverte sur l'internet.

const ORDER_ID = 'order-webhook-1';
const OWNER_ID = 'owner-test-1';
const SESSION_ID = 'cs_test_webhook';
const SECRET_WEBHOOK = 'whsec_test_celebrons';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      orders: [{
        id: ORDER_ID,
        owner_id: OWNER_ID,
        order_number: 'CMD-WEBHOOK-1',
        status: 'awaiting_payment',
        type: 'pdf',
        book_id: 'book-1',
        metadata: { stripeCheckoutSessionId: SESSION_ID }
      }],
      books: [{ id: 'book-1', owner_id: OWNER_ID, title: 'Livre', page_count: 30, print_format: 'luxe' }]
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
  getOrder: jest.fn(async () => ({})),
  buildOrderPayload: jest.fn(() => ({})),
  createOrder: jest.fn(async () => ({}))
}));

const express = require('express');
const request = require('supertest');

// La vraie librairie Stripe, volontairement : c'est elle qui signe et c'est
// elle qui verifie. Aucun appel reseau n'est fait ici — construire le client
// et signer un evenement sont des operations locales.
const Stripe = require('stripe');

let app;
let stripe;

const evenement = (type, paymentStatus) => ({
  id: `evt_${type}_${paymentStatus}`,
  type,
  data: {
    object: {
      id: SESSION_ID,
      payment_status: paymentStatus,
      payment_intent: 'pi_test_webhook',
      amount_total: 9450,
      metadata: { orderId: ORDER_ID, ownerId: OWNER_ID }
    }
  }
});

const envoyer = (corps, { signer = true } = {}) => {
  const charge = JSON.stringify(corps);
  const entetes = signer
    ? { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: charge, secret: SECRET_WEBHOOK }) }
    : {};
  return request(app)
    .post('/api/orders/webhook/stripe')
    .set('Content-Type', 'application/json')
    .set(entetes)
    .send(charge);
};

const enBase = () => global.__supabaseMock.__store.get('orders').find((o) => o.id === ORDER_ID);

describe('Webhook Stripe', () => {
  beforeAll(() => {
    // Lues au CHARGEMENT de routes/orders.js : a poser avant le require.
    process.env.STRIPE_ENABLED = '1';
    process.env.STRIPE_SECRET_KEY = 'sk_test_pour_les_tests';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET_WEBHOOK;

    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const orderRoutes = require('../routes/orders');
    app = express();
    // Meme montage que server.js : le corps BRUT, avant express.json().
    // Stripe signe des octets ; un corps deja transforme en objet ne peut
    // plus etre verifie.
    app.post(
      '/api/orders/webhook/stripe',
      express.raw({ type: 'application/json' }),
      orderRoutes.handleStripeWebhook
    );
  });

  it('enregistre le paiement sans qu aucun navigateur ne revienne', async () => {
    const reponse = await envoyer(evenement('checkout.session.completed', 'paid'));

    expect(reponse.status).toBe(200);
    expect(enBase().status).toBe('paid');
    expect(enBase().paid_at).toBeTruthy();
    expect(enBase().metadata.stripeConfirmationSource).toBe('webhook');
  });

  it('refuse un evenement mal signe, sans rien changer', async () => {
    const avant = enBase().status;

    const reponse = await request(app)
      .post('/api/orders/webhook/stripe')
      .set('Content-Type', 'application/json')
      .set({ 'stripe-signature': 't=1,v1=signature_inventee' })
      .send(JSON.stringify(evenement('checkout.session.completed', 'paid')));

    expect(reponse.status).toBe(400);
    expect(enBase().status).toBe(avant);
  });

  it('refuse un evenement sans signature du tout', async () => {
    const reponse = await envoyer(evenement('checkout.session.completed', 'paid'), { signer: false });
    expect(reponse.status).toBe(400);
  });

  it('ignore une session que Stripe ne declare pas payee', async () => {
    const reponse = await envoyer(evenement('checkout.session.completed', 'unpaid'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.ignored).toBe('payment_not_paid');
  });

  it('ignore poliment les evenements qui ne nous concernent pas', async () => {
    const reponse = await envoyer(evenement('customer.created', 'paid'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.ignored).toBe('customer.created');
  });
});
