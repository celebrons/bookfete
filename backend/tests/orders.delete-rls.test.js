// Une suppression que la BASE refuse ne doit jamais etre annoncee comme reussie.
//
// Signale le 2026-09-16 : « le bouton supprimer ne marche pas ». La commande
// disparaissait de l'ecran, puis reapparaissait — 14 commandes etaient encore
// en base apres plusieurs tentatives.
//
// Cause : sql/orders.sql active RLS sur public.orders avec des policies
// select / insert / update, mais AUCUNE pour delete. Sous RLS, une
// suppression sans policy ne leve pas d'erreur : elle supprime zero ligne et
// rend la main normalement. La route repondait donc 200 « supprimee ».
//
// La regle SQL manquante est ajoutee par sql/phase20_orders_delete_policy.sql.
// Ce test garde l'autre moitie de la correction, celle qui vaut pour toute
// table : ne jamais deduire un succes du seul fait que la base n'a pas rale.

const ORDER_ID = 'order-rls-refuse';
const OWNER_ID = 'owner-test-1';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      orders: [
        {
          id: ORDER_ID,
          owner_id: OWNER_ID,
          order_number: 'CMD-RLS-1',
          status: 'awaiting_payment',
          type: 'pdf',
          book_id: 'book-1',
          metadata: {}
        }
      ],
      books: [{ id: 'book-1', owner_id: OWNER_ID, title: 'Livre', page_count: 30, print_format: 'luxe' }]
    },
    {
      userId: OWNER_ID,
      userEmail: 'proprietaire@test.local',
      // La base accepte la requete et ne supprime rien : le comportement
      // exact de RLS sans policy `delete`.
      refuseDeletesOn: ['orders']
    }
  );
  global.__supabaseMock = mock;
  return mock;
});

// routes/orders.js lit les commandes via createUserScopedClient(), qui cree
// son PROPRE client Supabase au lieu d utiliser ../config/supabase. Sans ce
// mock, toute route de commande repond 404 en test — et un test qui verifie
// seulement « pas 200 » passerait alors pour la mauvaise raison.
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

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../routes/orders'));
  return app;
}

describe('DELETE /api/orders/:orderId — quand la base refuse en silence', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  it("ne repond pas 200 alors que rien n'a ete supprime", async () => {
    const response = await request(app)
      .delete(`/api/orders/${ORDER_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).not.toBe(200);
    expect(response.body.deleted).toBeUndefined();
  });

  it('explique ce qui manque, plutot qu une erreur opaque', async () => {
    const response = await request(app)
      .delete(`/api/orders/${ORDER_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(409);
    expect(String(response.body.error)).toMatch(/orders/i);
    expect(String(response.body.error)).toMatch(/delete/i);
  });

  it('la commande est toujours la — ce que l ecran doit refleter', async () => {
    await request(app)
      .delete(`/api/orders/${ORDER_ID}`)
      .set('Authorization', 'Bearer valid-token');

    const restantes = global.__supabaseMock.__store.get('orders');
    expect(restantes.map((o) => o.id)).toContain(ORDER_ID);
  });
});
