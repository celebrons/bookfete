// Retour utilisateur (2026-09-28, plan de mise en production —
// "Verrouiller le livre apres paiement") : rien n'empechait avant ce
// correctif d'ajouter/retirer des pages a un livre dont une commande avait
// deja ete payee, alors que le fichier envoye a l'imprimeur suit le livre
// au moment de l'ENVOI, pas au moment du PAIEMENT.
//
// Verifie ici sur UNE route representative (pages/extend) : le verrou lui-
// meme vit dans middleware/bookEditLock.js, partage par les 14 routes de
// composition.js qui modifient du contenu (voir requireBookNotLocked dans
// ce fichier) — le tester sur une seule route suffit a prouver que le
// middleware fonctionne ; chaque route qui l'utilise en beneficie de la
// meme facon.

const OWNER_ID = 'owner-test-1';
const BOOK_ID_LOCKED = 'book-verrouille';
const BOOK_ID_FREE = 'book-libre';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        {
          id: BOOK_ID_LOCKED,
          owner_id: OWNER_ID,
          title: 'Livre deja paye',
          page_count: 30,
          print_format: 'standard',
          locked_at: '2026-09-28T10:00:00.000Z'
        },
        {
          id: BOOK_ID_FREE,
          owner_id: OWNER_ID,
          title: 'Livre jamais paye',
          page_count: 30,
          print_format: 'standard',
          locked_at: null
        }
      ],
      book_pages: []
    },
    { userId: OWNER_ID, userEmail: 'proprietaire@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => global.__supabaseMock
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(require('../routes/composition'));
  return app;
}

describe('Verrouillage d\'un livre apres paiement (middleware/bookEditLock.js)', () => {
  afterEach(() => {
    delete process.env.ALLOW_BOOK_EDITS_AFTER_PAYMENT;
  });

  it('refuse une modification (423) sur un livre verrouille, sans bypass', async () => {
    delete process.env.ALLOW_BOOK_EDITS_AFTER_PAYMENT;
    const app = buildApp();

    const response = await request(app)
      .post(`/api/books/${BOOK_ID_LOCKED}/pages/extend`)
      .set('Authorization', 'Bearer valid-token')
      .send({ count: 2 });

    expect(response.status).toBe(423);
    expect(response.body.bookLocked).toBe(true);
    expect(response.body.error).toMatch(/déjà été payée/);
  });

  it('autorise la meme modification sur un livre jamais paye', async () => {
    const app = buildApp();

    const response = await request(app)
      .post(`/api/books/${BOOK_ID_FREE}/pages/extend`)
      .set('Authorization', 'Bearer valid-token')
      .send({ count: 2 });

    expect(response.status).not.toBe(423);
  });

  it('ALLOW_BOOK_EDITS_AFTER_PAYMENT=1 (mode test) : la modification redevient possible sur un livre verrouille', async () => {
    process.env.ALLOW_BOOK_EDITS_AFTER_PAYMENT = '1';
    const app = buildApp();

    const response = await request(app)
      .post(`/api/books/${BOOK_ID_LOCKED}/pages/extend`)
      .set('Authorization', 'Bearer valid-token')
      .send({ count: 2 });

    expect(response.status).not.toBe(423);
  });

  it('une valeur "truthy" mais pas litteralement "1" ne debloque PAS le mode test (jamais de coercion)', async () => {
    process.env.ALLOW_BOOK_EDITS_AFTER_PAYMENT = 'true';
    const app = buildApp();

    const response = await request(app)
      .post(`/api/books/${BOOK_ID_LOCKED}/pages/extend`)
      .set('Authorization', 'Bearer valid-token')
      .send({ count: 2 });

    expect(response.status).toBe(423);
  });

  it('les routes de LECTURE restent accessibles sur un livre verrouille, sans bypass', async () => {
    delete process.env.ALLOW_BOOK_EDITS_AFTER_PAYMENT;
    const app = buildApp();

    const response = await request(app)
      .get(`/api/books/${BOOK_ID_LOCKED}/pages`)
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).not.toBe(423);
  });
});
