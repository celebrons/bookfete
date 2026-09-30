// Relance MANUELLE, depuis l'administration, d'un envoi imprimeur echoue
// (retour utilisateur 2026-09-30 : "une nouvelle tentative reste possible").
//
// L'ecran de suivi client promet deja "notre equipe le relance" des qu'un
// envoi echoue (StepTracking.js) — retryGelatoSubmission est ce qui rend
// cette promesse vraie. Teste ici en dehors du mock complet de routes/orders
// utilise par admin.travaux.test.js, pour verifier la VRAIE logique de
// refus/declenchement.

const OWNER_ID = 'owner-test-1';
const BOOK_ID = 'book-retry-admin';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      orders: [
        {
          id: 'order-echouee',
          owner_id: OWNER_ID,
          order_number: 'CMD-RETRY-ECHOUEE',
          status: 'paid',
          type: 'print',
          book_id: BOOK_ID,
          shipping_address: { fullName: 'Test', line1: '1 rue', postalCode: '75001', city: 'Paris', country: 'FR', email: 'client@test.local' },
          metadata: { gelatoError: 'Gelato API 500', gelatoErrorAt: '2026-09-30T10:00:00.000Z' }
        },
        {
          id: 'order-deja-envoyee',
          owner_id: OWNER_ID,
          order_number: 'CMD-RETRY-DEJA',
          status: 'sent_to_printer',
          type: 'print',
          book_id: BOOK_ID,
          shipping_address: { fullName: 'Test', line1: '1 rue', postalCode: '75001', city: 'Paris', country: 'FR', email: 'client@test.local' },
          metadata: { gelatoOrderId: 'gelato-deja-la' }
        },
        {
          id: 'order-pdf',
          owner_id: OWNER_ID,
          order_number: 'CMD-RETRY-PDF',
          status: 'paid',
          type: 'pdf',
          book_id: BOOK_ID,
          metadata: {}
        },
        {
          id: 'order-lente',
          owner_id: OWNER_ID,
          order_number: 'CMD-RETRY-LENTE',
          status: 'paid',
          type: 'print',
          book_id: BOOK_ID,
          shipping_address: { fullName: 'Test', line1: '1 rue', postalCode: '75001', city: 'Paris', country: 'FR', email: 'client@test.local' },
          metadata: {}
        }
      ],
      books: [{ id: BOOK_ID, owner_id: OWNER_ID, title: 'Livre test', page_count: 30, print_format: 'standard' }]
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
  envoyerAlerteAdmin: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  isEmailEnabled: jest.fn(() => false)
}));

jest.mock('../services/printing/gelatoClient', () => ({
  deleteOrder: jest.fn(async () => ({})),
  getOrder: jest.fn(async () => ({})),
  buildOrderPayload: jest.fn(() => ({})),
  createOrder: jest.fn(async () => ({}))
}));

const mockSubmit = jest.fn(async ({ order }) => {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return { skipped: false, gelatoOrderId: `gelato-${order.id}`, gelatoOrderType: 'draft' };
});
jest.mock('../services/printing/gelatoOrderService', () => ({
  submitPrintOrderToGelato: mockSubmit
}));

const express = require('express');

describe('retryGelatoSubmission (administration)', () => {
  let orderRoutes;

  beforeAll(() => {
    process.env.GELATO_API_KEY = 'cle-de-test';
    orderRoutes = require('../routes/orders');
    const app = express();
    app.use('/api/orders', orderRoutes);
  });

  beforeEach(() => {
    mockSubmit.mockClear();
  });

  const attendre = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  it('commande introuvable : refuse proprement', async () => {
    const resultat = await orderRoutes.retryGelatoSubmission('inexistante');
    expect(resultat).toEqual({ lancee: false, raison: 'commande introuvable' });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('commande PDF (pas d impression) : refuse', async () => {
    const resultat = await orderRoutes.retryGelatoSubmission('order-pdf');
    expect(resultat.lancee).toBe(false);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('deja envoyee chez Gelato : refuse, jamais de second envoi', async () => {
    const resultat = await orderRoutes.retryGelatoSubmission('order-deja-envoyee');
    expect(resultat).toEqual({ lancee: false, raison: 'deja envoyee', gelatoOrderId: 'gelato-deja-la' });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('commande echouee, jamais envoyee : la relance part reellement', async () => {
    const resultat = await orderRoutes.retryGelatoSubmission('order-echouee');
    expect(resultat).toEqual({ lancee: true });

    await attendre(200);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit.mock.calls[0][0].order.id).toBe('order-echouee');
  });

  it('un envoi deja en cours pour cette commande : refuse plutot que de partir en double', async () => {
    orderRoutes.releaseGelatoSubmission('order-lente');
    orderRoutes.__triggerGelatoPourLesTests({
      db: global.__supabaseMock,
      order: { id: 'order-lente', type: 'print', book_id: BOOK_ID, owner_id: OWNER_ID, metadata: {} },
      ownerEmail: 'client@test.local'
    });

    // Le premier envoi tourne encore (120 ms) : la relance manuelle doit
    // etre refusee, pas empilee derriere.
    const resultat = await orderRoutes.retryGelatoSubmission('order-lente');
    expect(resultat.lancee).toBe(false);
    expect(resultat.raison).toMatch(/deja en cours/i);

    await attendre(250);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });
});
