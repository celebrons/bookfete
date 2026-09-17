// Deux envois simultanes ne doivent creer QU'UN brouillon chez Gelato.
//
// Signale le 2026-09-17, capture du tableau de bord Gelato a l'appui : la
// commande CMD-260917-MU61ZW3U-348 y figurait DEUX fois, meme numero, meme
// seconde (23:46:48), deux brouillons a 0 EUR.
//
// Cause : la garde d'idempotence de gelatoOrderService s'appuie sur
// metadata.gelatoOrderId — or cette route le remet a null juste avant de
// soumettre, pour autoriser un renvoi apres correction. Deux appels
// rapproches lisent donc tous les deux une valeur vide et partent tous les
// deux. Cote client, `gelatoSending` desactive bien le bouton, mais
// setGelatoSending est asynchrone : deux clics rapides passent avant le
// re-rendu.
//
// La correction tient un verrou par commande, pris avant de repondre et
// relache a la fin du travail detache — donc pendant toute la duree du rendu,
// pas seulement celle de la requete HTTP.

const ORDER_ID = 'order-double-envoi';
const OWNER_ID = 'owner-test-1';
const BOOK_ID = 'book-double';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      orders: [
        {
          id: ORDER_ID,
          owner_id: OWNER_ID,
          order_number: 'CMD-DOUBLE-1',
          status: 'print_queued',
          type: 'print',
          book_id: BOOK_ID,
          quantity: 1,
          shipping_address: {
            fullName: 'Chikhi Nadjib',
            line1: '1 rue des Tests',
            postalCode: '75001',
            city: 'Paris',
            country: 'FR'
          },
          metadata: {}
        }
      ],
      books: [
        { id: BOOK_ID, owner_id: OWNER_ID, title: 'Voyage', page_count: 30, print_format: 'luxe', status: 'actif' }
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

jest.mock('../services/printing/gelatoClient', () => ({
  deleteOrder: jest.fn(async () => ({})),
  getOrder: jest.fn(async () => ({})),
  buildOrderPayload: jest.fn(() => ({})),
  createOrder: jest.fn(async () => ({}))
}));

// Une soumission LENTE : c'est pendant ce temps que le second appel arrive.
// Avec une soumission instantanee, la course ne se reproduirait pas et le
// test passerait sans rien prouver.
let mockSoumissions = 0;
jest.mock('../services/printing/gelatoOrderService', () => ({
  submitPrintOrderToGelato: jest.fn(async () => {
    mockSoumissions += 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
    return { skipped: false, gelatoOrderId: `draft-${mockSoumissions}`, gelatoOrderType: 'draft' };
  }),
  isGelatoLiveOrdersEnabled: () => process.env.GELATO_LIVE_ORDERS === '1'
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../routes/orders'));
  return app;
}

describe('POST /:orderId/gelato-test — deux envois simultanes', () => {
  let app;

  beforeAll(() => {
    delete process.env.GELATO_LIVE_ORDERS;
    app = buildApp();
  });

  // Le verrou n est relache qu a la fin du travail DETACHE : sans cette
  // vidange, le test suivant demarrerait verrou encore pris et verrait tous
  // ses appels refuses — il echouerait pour la mauvaise raison.
  const laisserFinir = () => new Promise((resolve) => { setTimeout(resolve, 250); });

  beforeEach(() => {
    mockSoumissions = 0;
  });

  afterEach(laisserFinir);

  const envoyer = () => request(app)
    .post(`/api/orders/${ORDER_ID}/gelato-test`)
    .set('Authorization', 'Bearer valid-token');

  it('le second appel est refuse tant que le premier tourne', async () => {
    const [premier, second] = await Promise.all([envoyer(), envoyer()]);

    const codes = [premier.status, second.status].sort();
    expect(codes).toEqual([202, 409]);

    const refuse = premier.status === 409 ? premier : second;
    expect(String(refuse.body.error)).toMatch(/deja en cours/i);
  });

  it("n'envoie qu'UNE fois a l'imprimeur — le doublon signale", async () => {
    await Promise.all([envoyer(), envoyer(), envoyer()]);
    // On laisse le travail detache se terminer.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(mockSoumissions).toBe(1);
  });

  it('un nouvel envoi redevient possible une fois le precedent termine', async () => {
    const premier = await envoyer();
    expect(premier.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const suivant = await envoyer();
    expect(suivant.status).toBe(202);
    expect(mockSoumissions).toBe(2);
  });
});
