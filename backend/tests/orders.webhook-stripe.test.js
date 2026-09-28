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

// SANS CE MOCK, UN TEST ENVOIE UN VRAI EMAIL.
//
// Constate le 2026-09-27 : ce fichier n'avait jamais mocke transactionalEmails
// (le chemin "paiement recu" existant restait silencieux par accident, faute
// de destinataire connu sur la commande) — le nouveau chemin d'alerte, lui,
// lit ADMIN_EMAILS directement depuis backend/.env, une vraie adresse. Deux
// emails d'alerte reels sont partis pendant l'ecriture des tests ci-dessous
// avant que ce mock ne soit ajoute. Aucun test ne doit jamais pouvoir
// atteindre brevoClient.js — c'est la seule garantie qui compte ici.
jest.mock('../services/email/transactionalEmails', () => ({
  envoyerPaiementRecu: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerAlerteAdmin: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerCommandeConfirmee: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerPdfPret: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerEtapeFabrication: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerLienLivre: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  isEmailEnabled: jest.fn(() => false)
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

// Retour utilisateur (2026-09-27) : "une commande dont le paiement echoue ne
// doit jamais etre envoyee a Gelato, et doit rester dans un etat coherent
// plutot que bloquee entre deux statuts." Avant ce correctif, ces deux
// evenements etaient simplement ignores (branche isCheckoutCompleted,
// jamais atteinte) : aucune trace, aucune alerte.
describe('Webhook Stripe — paiement echoue/expire', () => {
  beforeEach(() => {
    // Le magasin mock est PARTAGE avec le describe precedent, qui a deja
    // fait passer la commande a "paid" (voir son premier test) : on la
    // remet a "awaiting_payment", metadata propre, pour que ce bloc parte
    // d'un etat connu quel que soit l'ordre d'execution.
    const commande = enBase();
    commande.status = 'awaiting_payment';
    commande.metadata = { stripeCheckoutSessionId: SESSION_ID };
  });

  it('checkout.session.expired : la commande RESTE awaiting_payment (deja coherente/relancable), avec un historique + une alerte admin', async () => {
    const emails = require('../services/email/transactionalEmails');
    emails.envoyerAlerteAdmin.mockClear();

    const reponse = await envoyer(evenement('checkout.session.expired', 'unpaid'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.status).toBe('payment_failure_recorded');

    const commande = enBase();
    // Statut INCHANGE : deja l'etat coherent, deja resumable (bouton "Payer
    // la commande en attente"), jamais touche par un echec de paiement.
    expect(commande.status).toBe('awaiting_payment');
    expect(commande.metadata.paymentFailures).toHaveLength(1);
    expect(commande.metadata.paymentFailures[0]).toEqual(expect.objectContaining({
      sessionId: SESSION_ID,
      reason: 'expired'
    }));
    expect(emails.envoyerAlerteAdmin).toHaveBeenCalledTimes(1);
    const alerte = emails.envoyerAlerteAdmin.mock.calls[0][0];
    expect(alerte.sujet).toMatch(/Paiement Stripe echoue/);
    expect(alerte.details).toEqual(expect.arrayContaining([['Raison', 'expired']]));
  });

  it('checkout.session.async_payment_failed : meme traitement, raison differente, s\'accumule a un historique existant', async () => {
    // Une premiere tentative echouee est deja enregistree (independant de
    // l'ordre d'execution des tests, jamais suppose depuis un test voisin).
    const commande = enBase();
    commande.metadata = {
      ...commande.metadata,
      paymentFailures: [{ at: '2026-09-27T10:00:00.000Z', sessionId: SESSION_ID, reason: 'expired' }]
    };

    const reponse = await envoyer(evenement('checkout.session.async_payment_failed', 'unpaid'));

    expect(reponse.status).toBe(200);
    const apres = enBase();
    expect(apres.status).toBe('awaiting_payment');
    // Deuxieme tentative echouee ajoutee (la precedente n'est pas ecrasee) :
    // 2 entrees au total sur cette commande.
    expect(apres.metadata.paymentFailures).toHaveLength(2);
    expect(apres.metadata.paymentFailures[1].reason).toBe('async_payment_failed');
  });

  it('ne touche JAMAIS une commande deja payee (evenement d\'echec arrive en retard)', async () => {
    // La commande est passee "paid" entre-temps (paiement reellement reussi,
    // webhook de succes deja traite) : un evenement d'echec qui arrive
    // APRES ne doit surtout pas la faire "reculer" ni y ajouter un historique
    // d'echec qui n'a plus de sens.
    const orders = global.__supabaseMock.__store.get('orders');
    const commandeAvant = orders.find((o) => o.id === ORDER_ID);
    commandeAvant.status = 'paid';
    commandeAvant.metadata = { ...commandeAvant.metadata, paymentFailures: undefined };

    const emails = require('../services/email/transactionalEmails');
    emails.envoyerAlerteAdmin.mockClear();

    const reponse = await envoyer(evenement('checkout.session.expired', 'unpaid'));

    expect(reponse.status).toBe(200);
    const commandeApres = enBase();
    expect(commandeApres.status).toBe('paid');
    expect(commandeApres.metadata.paymentFailures).toBeUndefined();
    // Aucune alerte non plus : rien d'anormal a signaler sur une commande
    // deja payee.
    expect(emails.envoyerAlerteAdmin).not.toHaveBeenCalled();
  });
});
