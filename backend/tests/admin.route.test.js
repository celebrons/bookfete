// Espace d'administration (2026-09-12).
//
// Ces routes exposent les livres et les emails de TOUS les utilisateurs, et
// le backend lit la base avec une cle service-role qui contourne RLS : rien
// d'autre que `requireAdmin` ne protege ces donnees. Les tests portent donc
// d'abord et avant tout sur les REFUS.

const ADMIN_EMAIL = 'patron@celebrons.fr';
const USER_EMAIL = 'client@test.local';

const TOKENS = {
  'admin-token': { id: 'admin-1', email: ADMIN_EMAIL, is_anonymous: false },
  'admin-token-casse': { id: 'admin-1', email: 'PATRON@Celebrons.FR', is_anonymous: false },
  'user-token': { id: 'user-1', email: USER_EMAIL, is_anonymous: false },
  'anon-token': { id: 'anon-1', is_anonymous: true },
  'sans-email-token': { id: 'ghost-1', email: '', is_anonymous: false }
};

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock({
    books: [
      { id: 'b1', owner_id: 'user-1', title: 'Livre de Marie', print_format: 'standard', page_count: 30, updated_at: '2026-09-12T10:00:00Z', created_at: '2026-09-01T10:00:00Z', cover_config: {} },
      { id: 'b2', owner_id: 'anon-1', title: 'Livre sans compte', print_format: 'livret', page_count: 30, updated_at: '2026-09-11T10:00:00Z', created_at: '2026-09-11T09:00:00Z', cover_config: {} }
    ],
    book_content_items: [
      { id: 'i1', book_id: 'b1', kind: 'photo' },
      { id: 'i2', book_id: 'b1', kind: 'photo' },
      { id: 'i3', book_id: 'b1', kind: 'texte' }
    ],
    book_pages: [{ id: 'p1', book_id: 'b1' }],
    orders: [{ id: 'o1', book_id: 'b1', status: 'paid', type: 'print', total_cents: 7450 }],
    profiles: [{ id: 'user-1', email: 'client@test.local', full_name: 'Marie Test' }],
    layout_definitions: [],
    book_templates: []
  });

  mock.auth = {
    getUser: jest.fn(async (token) => {
      const user = global.__adminTokens[token];
      if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
      return { data: { user }, error: null };
    })
  };

  global.__adminSupabaseMock = mock;
  return mock;
});

const express = require('express');
const request = require('supertest');

global.__adminTokens = TOKENS;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/admin'));
  return app;
}

describe('Espace admin — controle d\'acces', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  beforeEach(() => { process.env.ADMIN_EMAILS = ADMIN_EMAIL; });
  afterEach(() => { process.env = { ...OLD_ENV }; });

  it('refuse sans authentification', async () => {
    expect((await request(app).get('/api/admin/books')).status).toBe(401);
  });

  it("REFUSE un utilisateur normal — et ne revele pas l'existence de l'espace (404, pas 403)", async () => {
    const response = await request(app).get('/api/admin/books').set('Authorization', 'Bearer user-token');
    expect(response.status).toBe(404);
    // Aucune donnee ne doit fuir dans la reponse d'erreur.
    expect(JSON.stringify(response.body)).not.toContain('Livre de Marie');
  });

  it('REFUSE un compte anonyme', async () => {
    expect((await request(app).get('/api/admin/books').set('Authorization', 'Bearer anon-token')).status).toBe(404);
  });

  it('REFUSE un compte sans email', async () => {
    expect((await request(app).get('/api/admin/books').set('Authorization', 'Bearer sans-email-token')).status).toBe(404);
  });

  it('REFUSE TOUT LE MONDE quand ADMIN_EMAILS est absent (une variable oubliee ferme la porte)', async () => {
    delete process.env.ADMIN_EMAILS;
    expect((await request(app).get('/api/admin/books').set('Authorization', 'Bearer admin-token')).status).toBe(404);
  });

  it('REFUSE quand ADMIN_EMAILS est vide', async () => {
    process.env.ADMIN_EMAILS = '   ';
    expect((await request(app).get('/api/admin/books').set('Authorization', 'Bearer admin-token')).status).toBe(404);
  });

  it('accepte un administrateur', async () => {
    expect((await request(app).get('/api/admin/books').set('Authorization', 'Bearer admin-token')).status).toBe(200);
  });

  it("la casse de l'email n'a pas d'importance", async () => {
    expect((await request(app).get('/api/admin/books').set('Authorization', 'Bearer admin-token-casse')).status).toBe(200);
  });

  it('accepte un administrateur au milieu d\'une liste', async () => {
    process.env.ADMIN_EMAILS = ` autre@x.fr , ${ADMIN_EMAIL} ,encore@y.fr `;
    expect((await request(app).get('/api/admin/books').set('Authorization', 'Bearer admin-token')).status).toBe(200);
  });

  it('/me repond sans reveler qui est administrateur', async () => {
    const asAdmin = await request(app).get('/api/admin/me').set('Authorization', 'Bearer admin-token');
    const asUser = await request(app).get('/api/admin/me').set('Authorization', 'Bearer user-token');

    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.isAdmin).toBe(true);
    expect(asUser.status).toBe(200);
    expect(asUser.body.isAdmin).toBe(false);
    // La reponse ne doit pas contenir la liste des administrateurs.
    expect(JSON.stringify(asUser.body)).not.toContain(ADMIN_EMAIL);
  });
});

describe('Espace admin — liste des livres', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  beforeEach(() => { process.env.ADMIN_EMAILS = ADMIN_EMAIL; });
  afterEach(() => { process.env = { ...OLD_ENV }; });

  const list = (query = '') => request(app)
    .get(`/api/admin/books${query}`)
    .set('Authorization', 'Bearer admin-token');

  it('renvoie TOUS les livres, pas seulement ceux de l\'administrateur', async () => {
    const response = await list();
    expect(response.body.total).toBe(2);
    expect(response.body.books.map((b) => b.id).sort()).toEqual(['b1', 'b2']);
  });

  it('indique qui a fait le livre', async () => {
    const book = (await list()).body.books.find((b) => b.id === 'b1');
    expect(book.owner.email).toBe('client@test.local');
    expect(book.owner.name).toBe('Marie Test');
  });

  it('signale explicitement un livre commence sans compte', async () => {
    const book = (await list()).body.books.find((b) => b.id === 'b2');
    expect(book.owner.anonymous).toBe(true);
    expect(book.owner.email).toBeNull();
  });

  // Depuis la migration phase16, un compte anonyme a bien une ligne
  // `profiles` — avec un email vide. Se fier a l'absence de profil affichait
  // donc "email inconnu" au lieu de "sans compte" (constate sur les vraies
  // donnees le 2026-09-12).
  it('reste correct quand le compte anonyme possede un profil a email vide', async () => {
    const store = global.__adminSupabaseMock.__table('profiles');
    store.push({ id: 'anon-1', email: null, full_name: null });
    try {
      const book = (await list()).body.books.find((b) => b.id === 'b2');
      expect(book.owner.anonymous).toBe(true);
    } finally {
      store.splice(store.findIndex((row) => row.id === 'anon-1'), 1);
    }
  });

  it('compte photos, souvenirs, pages et commandes', async () => {
    const book = (await list()).body.books.find((b) => b.id === 'b1');
    expect(book.counts).toEqual({ photos: 2, texts: 1, pages: 1, orders: 1 });
  });

  it('donne un statut lisible', async () => {
    const book = (await list()).body.books.find((b) => b.id === 'b1');
    expect(book.lifecycle).toBe('editing');
    expect(book.lifecycleLabel).toBe('En cours de création');
  });

  it('la recherche filtre sur le titre comme sur l\'email du proprietaire', async () => {
    expect((await list('?search=marie')).body.books.map((b) => b.id)).toEqual(['b1']);
    expect((await list('?search=client@test')).body.books.map((b) => b.id)).toEqual(['b1']);
    expect((await list('?search=introuvable')).body.books).toHaveLength(0);
  });
});

// Consultation d'un livre. BUG REEL signale le 2026-09-12 (capture a
// l'appui) : l'apercu ne montrait aucune couverture. Les couvertures ne sont
// JAMAIS stockees dans `book_pages` — elles sont recalculees a la volee par
// coverComposer, hors du budget de pages interieures. Rendre uniquement
// `listPages` donnait donc un livre sans premiere ni quatrieme de
// couverture... et une page entierement blanche pour un livre encore vide,
// ce qui etait precisement le cas a l'ecran.
describe('Espace admin — consultation d\'un livre', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  beforeEach(() => { process.env.ADMIN_EMAILS = ADMIN_EMAIL; });
  afterEach(() => { process.env = { ...OLD_ENV }; });

  const preview = (id) => request(app)
    .get(`/api/admin/books/${id}/preview.html`)
    .set('Authorization', 'Bearer admin-token');

  it('refuse un non-administrateur', async () => {
    const response = await request(app)
      .get('/api/admin/books/b1/preview.html')
      .set('Authorization', 'Bearer user-token');
    expect(response.status).toBe(404);
  });

  it('rend un document HTML complet', async () => {
    const response = await preview('b1');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<!doctype html>');
  });

  it('inclut la premiere ET la quatrieme de couverture', async () => {
    const response = await preview('b1');
    expect(response.text).toContain('front-cover');
    expect(response.text).toContain('back-cover');
  });

  it("un livre encore vide affiche quand meme ses couvertures (jamais une page blanche)", async () => {
    // b2 n'a aucune ligne dans book_pages.
    const response = await preview('b2');
    expect(response.status).toBe(200);
    expect(response.text).toContain('front-cover');
    expect(response.text).not.toContain("n'a pas encore de pages composées");
  });

  it('404 sur un livre inexistant', async () => {
    expect((await preview('nexiste-pas')).status).toBe(404);
  });
});
