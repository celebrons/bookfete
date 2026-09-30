// Gestion des erreurs d'envoi a Gelato (retour utilisateur, 2026-09-30) :
// si l'envoi echoue, la commande est conservee, une nouvelle tentative
// automatique est faite (GELATO_SUBMIT_MAX_ATTEMPTS, routes/orders.js), et
// l'administrateur est alerte par email si les deux echouent — sans jamais
// resoumettre une commande deja creee chez Gelato (voir gelatoOrderService).
//
// Ces trois garanties n'avaient AUCUNE couverture avant ce correctif : un
// echec d'envoi ne partait qu'au journal d'evenements, jamais par email, et
// une seule tentative etait faite avant d'abandonner silencieusement.

const ORDER_ID = 'commande-echec-retry';
const OWNER_ID = 'owner-test-1';
const BOOK_ID = 'book-echec-retry';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      orders: [{
        id: ORDER_ID,
        owner_id: OWNER_ID,
        order_number: 'CMD-ECHEC-RETRY-1',
        status: 'paid',
        type: 'print',
        book_id: BOOK_ID,
        metadata: {}
      }],
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

// SANS CE MOCK, UN TEST ENVOIE UN VRAI EMAIL (voir orders.webhook-stripe.test.js
// pour l'incident constate le 2026-09-27) — jamais atteindre brevoClient.js.
const mockAlerteAdmin = jest.fn(async () => ({ sent: false, skipped: 'test' }));
jest.mock('../services/email/transactionalEmails', () => ({
  envoyerInvitationParticipant: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerRelanceParticipant: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerNouvelleContribution: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerLienLivre: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerCommandeConfirmee: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerPaiementRecu: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerFacture: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerPdfPret: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerEtapeFabrication: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerEssai: jest.fn(async () => ({ sent: false, skipped: 'test' })),
  envoyerAlerteAdmin: mockAlerteAdmin,
  isEmailEnabled: jest.fn(() => false),
  destinataireDe: jest.fn(() => null),
  formatLisible: jest.fn((v) => v),
  siteUrl: jest.fn(() => 'https://test.local')
}));

jest.mock('../services/printing/gelatoClient', () => ({
  deleteOrder: jest.fn(async () => ({})),
  getOrder: jest.fn(async () => ({})),
  buildOrderPayload: jest.fn(() => ({})),
  createOrder: jest.fn(async () => ({}))
}));

let mockAppels = 0;
let comportement = 'toujours_echec'; // 'toujours_echec' | 'reussit_au_2e' | 'reussit_direct'
const mockSubmit = jest.fn(async () => {
  mockAppels += 1;
  if (comportement === 'reussit_direct') {
    return { skipped: false, gelatoOrderId: 'gelato-1', gelatoOrderType: 'draft' };
  }
  if (comportement === 'reussit_au_2e' && mockAppels >= 2) {
    return { skipped: false, gelatoOrderId: 'gelato-2', gelatoOrderType: 'draft' };
  }
  return { skipped: false, error: 'Gelato API 500' };
});

jest.mock('../services/printing/gelatoOrderService', () => ({
  submitPrintOrderToGelato: mockSubmit
}));

const express = require('express');

describe('Envoi imprimeur echoue : retry automatique + alerte admin', () => {
  let orderRoutes;

  beforeAll(() => {
    process.env.GELATO_API_KEY = 'cle-de-test';
    orderRoutes = require('../routes/orders');
    const app = express();
    app.use('/api/orders', orderRoutes);
  });

  beforeEach(() => {
    mockAppels = 0;
    mockSubmit.mockClear();
    mockAlerteAdmin.mockClear();
    orderRoutes.releaseGelatoSubmission(ORDER_ID);
  });

  const commande = () => ({
    id: ORDER_ID, type: 'print', book_id: BOOK_ID, owner_id: OWNER_ID, order_number: 'CMD-ECHEC-RETRY-1', metadata: {}
  });

  const attendre = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  it('reussit au premier essai : un seul appel, pas d alerte', async () => {
    comportement = 'reussit_direct';
    const { __triggerGelatoPourLesTests } = orderRoutes;
    const db = global.__supabaseMock;

    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    await attendre(200);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockAlerteAdmin).not.toHaveBeenCalled();
  });

  it('echoue une fois puis reussit : LA RETENTATIVE AUTOMATIQUE evite une alerte inutile', async () => {
    comportement = 'reussit_au_2e';
    const { __triggerGelatoPourLesTests } = orderRoutes;
    const db = global.__supabaseMock;

    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    await attendre(200);

    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect(mockAlerteAdmin).not.toHaveBeenCalled();
  });

  it('echoue deux fois de suite : exactement 2 tentatives, puis une alerte admin', async () => {
    comportement = 'toujours_echec';
    const { __triggerGelatoPourLesTests } = orderRoutes;
    const db = global.__supabaseMock;

    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    await attendre(200);

    // Jamais plus de 2 : un envoi Gelato est couteux, une cause structurelle
    // ne se resout pas au 3e essai identique (meme principe que PDF_EXPORT_
    // MAX_ATTEMPTS, routes/books.js).
    expect(mockSubmit).toHaveBeenCalledTimes(2);

    expect(mockAlerteAdmin).toHaveBeenCalledTimes(1);
    const alerte = mockAlerteAdmin.mock.calls[0][0];
    expect(alerte.sujet).toMatch(/CMD-ECHEC-RETRY-1/);
    expect(alerte.details).toEqual(expect.arrayContaining([
      ['Erreur', 'Gelato API 500']
    ]));
  });

  it("l'alerte admin echoue elle-meme : jamais bloquant, le verrou est quand meme relache", async () => {
    comportement = 'toujours_echec';
    mockAlerteAdmin.mockRejectedValueOnce(new Error('SMTP indisponible'));
    const { __triggerGelatoPourLesTests, listGelatoSubmissions } = orderRoutes;
    const db = global.__supabaseMock;

    __triggerGelatoPourLesTests({ db, order: commande(), ownerEmail: 'client@test.local' });
    await attendre(200);

    // Le verrou "en cours"/"bloquee" ne doit plus contenir cette commande,
    // que l'alerte elle-meme ait reussi ou non (`finally`, jamais conditionnel).
    const enCours = await listGelatoSubmissions();
    expect(enCours.some((t) => t.orderId === ORDER_ID)).toBe(false);
  });
});
