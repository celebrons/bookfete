// DEUX CHEMINS VERS L'IMPRIMEUR, UN SEUL VERROU.
//
// Le 2026-09-19, Gelato a recu DEUX brouillons pour la meme commande
// CMD-260919-MU8V6KLU-528 — bd63c9ef a 20:54:43 et b4ac19b5 a 20:55:26 —
// alors que notre journal n'en connaissait qu'un.
//
// Cause : l'envoi peut partir de deux endroits. Le bouton « envoi de test »
// prenait un verrou et ecrivait au journal ; la soumission declenchee par la
// CONFIRMATION DE PAIEMENT ne faisait ni l'un ni l'autre. Les deux ont
// tourne en parallele.
//
// En mode brouillon, ca fait un doublon dans le tableau de bord Gelato. En
// mode facturable, ce serait deux livres imprimes et deux factures. D'ou ces
// tests.

const ORDER_ID = 'commande-double-envoi';
const OWNER_ID = 'owner-test-1';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      orders: [{
        id: ORDER_ID,
        owner_id: OWNER_ID,
        order_number: 'CMD-DOUBLE-1',
        status: 'paid',
        type: 'print',
        book_id: 'book-1',
        shipping_address: {
          fullName: 'Test', line1: '1 rue', postalCode: '75001', city: 'Paris', country: 'FR'
        },
        metadata: {}
      }],
      books: [{ id: 'book-1', owner_id: OWNER_ID, title: 'Livre', page_count: 30, print_format: 'standard' }]
    },
    { userId: OWNER_ID, userEmail: 'proprietaire@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => global.__supabaseMock
}));

// Le service d'envoi : lent, pour que deux appels se chevauchent vraiment.
// `mock` en prefixe : jest l'exige pour toute variable citee dans une
// fabrique de mock.
const mockEnvois = [];
const mockSubmit = jest.fn(async ({ order }) => {
  mockEnvois.push(order.id);
  await new Promise((resolve) => setTimeout(resolve, 120));
  return { gelatoOrderId: `draft-${mockEnvois.length}`, gelatoOrderType: 'draft' };
});

jest.mock('../services/printing/gelatoOrderService', () => ({
  submitPrintOrderToGelato: mockSubmit
}));

jest.mock('../services/printing/gelatoClient', () => ({
  deleteOrder: jest.fn(async () => ({})),
  getOrder: jest.fn(async () => ({})),
  buildOrderPayload: jest.fn(() => ({})),
  createOrder: jest.fn(async () => ({}))
}));

const express = require('express');

describe('Un seul envoi a l imprimeur a la fois', () => {
  let orderRoutes;

  beforeAll(() => {
    process.env.GELATO_API_KEY = 'cle-de-test';
    orderRoutes = require('../routes/orders');
    // Monte pour que le module soit complet ; les tests appellent les
    // fonctions exportees directement.
    const app = express();
    app.use('/api/orders', orderRoutes);
  });

  beforeEach(() => {
    mockEnvois.length = 0;
    mockSubmit.mockClear();
    // Repartir d'un verrou libre entre deux tests.
    orderRoutes.releaseGelatoSubmission(ORDER_ID);
  });

  const commande = () => ({
    id: ORDER_ID, type: 'print', book_id: 'book-1', owner_id: OWNER_ID, metadata: {}
  });

  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

  it('deux declenchements simultanes ne produisent QU UN envoi', async () => {
    const { __triggerGelatoPourLesTests } = orderRoutes;
    const db = global.__supabaseMock;

    // Deux paiements confirmes coup sur coup — ce qui s'est reellement
    // produit : la page de commande et le webhook Stripe.
    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });

    await attendre(400);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockEnvois).toEqual([ORDER_ID]);
  });

  it('le verrou est relache : un envoi ulterieur reste possible', async () => {
    const { __triggerGelatoPourLesTests, listGelatoSubmissions } = orderRoutes;
    const db = global.__supabaseMock;

    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    await attendre(400);

    // Un verrou pris et jamais rendu bloquerait cette commande jusqu'au
    // redemarrage du serveur — un remede pire que le mal.
    expect(listGelatoSubmissions().some((t) => t.orderId === ORDER_ID)).toBe(false);

    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    await attendre(400);

    expect(mockSubmit).toHaveBeenCalledTimes(2);
  });

  it('un envoi ignore laisse une trace, il ne disparait pas en silence', async () => {
    const { logEvent } = require('../services/events/eventLog');
    const { __triggerGelatoPourLesTests } = orderRoutes;
    const db = global.__supabaseMock;

    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    await attendre(400);

    const types = logEvent.mock.calls.map((appel) => appel[0].type);
    expect(types).toContain('gelato.submit.skipped');
  });
});

// Le journal est espionne : c'est lui qui manquait quand le doublon est
// passe inapercu.
jest.mock('../services/events/eventLog', () => ({
  logEvent: jest.fn(),
  listEvents: jest.fn(async () => []),
  purgeEvents: jest.fn(async () => ({ removed: 0 })),
  environnement: jest.fn(() => 'test')
}));
