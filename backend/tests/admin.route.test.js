// Espace d'administration (2026-09-12).
//
// Ces routes exposent les livres et les emails de TOUS les utilisateurs, et
// le backend lit la base avec une cle service-role qui contourne RLS : rien
// d'autre que `requireAdmin` ne protege ces donnees. Les tests portent donc
// d'abord et avant tout sur les REFUS.

const ADMIN_EMAIL = 'patron@bookipix.com';
const USER_EMAIL = 'client@test.local';

const TOKENS = {
  'admin-token': { id: 'admin-1', email: ADMIN_EMAIL, is_anonymous: false },
  'admin-token-casse': { id: 'admin-1', email: 'PATRON@BOOKIPIX.COM', is_anonymous: false },
  'user-token': { id: 'user-1', email: USER_EMAIL, is_anonymous: false },
  'anon-token': { id: 'anon-1', is_anonymous: true },
  'sans-email-token': { id: 'ghost-1', email: '', is_anonymous: false }
};

jest.mock('../services/storageService', () => ({
  deleteBookFolder: jest.fn(async () => ({ success: true, removed: 0 }))
}));

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
    book_templates: [],
    app_settings: [{ id: 'global', mode: 'test', updated_at: '2026-10-01T00:00:00Z', updated_by: null }],
    app_events: []
  });

  mock.auth = {
    getUser: jest.fn(async (token) => {
      const user = global.__adminTokens[token];
      if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
      return { data: { user }, error: null };
    }),
    admin: {
      listUsers: jest.fn(async () => ({ data: { users: [] }, error: null })),
      deleteUser: jest.fn(async () => ({ error: null }))
    }
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

// Mode global test/production (2026-10-04) : voir services/settings/appMode.js.
// Le point qui compte le plus ici n'est pas "ca bascule", c'est "ca REFUSE
// de basculer en production sans les cles live" — une bascule a moitie
// prete serait pire qu'aucune bascule.
describe('Espace admin — mode test/production', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    global.__adminSupabaseMock.__table('app_settings')[0].mode = 'test';
    delete process.env.STRIPE_SECRET_KEY_LIVE;
    delete process.env.STRIPE_WEBHOOK_SECRET_LIVE;
    delete process.env.GELATO_API_KEY;
  });
  afterEach(() => { process.env = { ...OLD_ENV }; });

  it('GET /mode refuse un non-administrateur', async () => {
    const response = await request(app).get('/api/admin/mode').set('Authorization', 'Bearer user-token');
    expect(response.status).toBe(404);
  });

  it('GET /mode annonce le mode courant et ce qui manque pour la production', async () => {
    const response = await request(app).get('/api/admin/mode').set('Authorization', 'Bearer admin-token');
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('test');
    expect(response.body.missingForProduction).toEqual(expect.arrayContaining([
      expect.stringContaining('Stripe'), expect.stringContaining('Gelato')
    ]));
  });

  it('POST /mode refuse un non-administrateur, sans toucher au mode', async () => {
    const response = await request(app)
      .post('/api/admin/mode')
      .set('Authorization', 'Bearer user-token')
      .send({ mode: 'production' });
    expect(response.status).toBe(404);
    expect(global.__adminSupabaseMock.__table('app_settings')[0].mode).toBe('test');
  });

  it('POST /mode REFUSE de basculer en production sans les cles live configurees', async () => {
    const response = await request(app)
      .post('/api/admin/mode')
      .set('Authorization', 'Bearer admin-token')
      .send({ mode: 'production' });

    expect(response.status).toBe(400);
    expect(response.body.missing).toEqual(expect.arrayContaining([expect.stringContaining('Stripe')]));
    expect(global.__adminSupabaseMock.__table('app_settings')[0].mode).toBe('test');
  });

  it('POST /mode bascule en production quand tout est configure, et le repasse en test sans condition', async () => {
    process.env.STRIPE_SECRET_KEY_LIVE = 'sk_live_abc';
    process.env.STRIPE_WEBHOOK_SECRET_LIVE = 'whsec_abc';
    process.env.GELATO_API_KEY = 'une-cle';

    const activation = await request(app)
      .post('/api/admin/mode')
      .set('Authorization', 'Bearer admin-token')
      .send({ mode: 'production' });

    expect(activation.status).toBe(200);
    expect(activation.body.mode).toBe('production');
    expect(global.__adminSupabaseMock.__table('app_settings')[0].mode).toBe('production');
    expect(global.__adminSupabaseMock.__table('app_settings')[0].updated_by).toBe(ADMIN_EMAIL);

    const retour = await request(app)
      .post('/api/admin/mode')
      .set('Authorization', 'Bearer admin-token')
      .send({ mode: 'test' });

    expect(retour.status).toBe(200);
    expect(retour.body.mode).toBe('test');
    expect(global.__adminSupabaseMock.__table('app_settings')[0].mode).toBe('test');
  });

  it('POST /mode refuse une valeur de mode invalide', async () => {
    const response = await request(app)
      .post('/api/admin/mode')
      .set('Authorization', 'Bearer admin-token')
      .send({ mode: 'yolo' });
    expect(response.status).toBe(400);
  });
});

// Vider le journal des evenements (2026-10-03).
describe('Espace admin — purge du journal', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    const table = global.__adminSupabaseMock.__table('app_events');
    table.length = 0;
    table.push(
      { id: 'e1', type: 'order.created', level: 'info', created_at: '2026-09-01T00:00:00Z' },
      { id: 'e2', type: 'pdf.failed', level: 'error', created_at: '2026-09-02T00:00:00Z' }
    );
  });
  afterEach(() => { process.env = { ...OLD_ENV }; });

  it('refuse un non-administrateur, sans toucher au journal', async () => {
    const response = await request(app).post('/api/admin/events/purge').set('Authorization', 'Bearer user-token');
    expect(response.status).toBe(404);
    expect(global.__adminSupabaseMock.__table('app_events')).toHaveLength(2);
  });

  it('vide toutes les lignes existantes et le dit', async () => {
    const response = await request(app).post('/api/admin/events/purge').set('Authorization', 'Bearer admin-token');
    expect(response.status).toBe(200);
    expect(response.body.removed).toBe(2);

    // Une ligne de traçabilite reapparait APRES la purge, pour que le
    // journal ne reparte pas totalement muet sur ce qui vient de se passer.
    const table = global.__adminSupabaseMock.__table('app_events');
    expect(table).toHaveLength(1);
    expect(table[0].type).toBe('admin.events.purged');
  });
});

// Livres non finalises et sans commande (2026-10-03, "repartir a zero").
// b1 est en 'editing' mais a une commande (o1) : il ne doit JAMAIS etre
// supprime, peu importe son statut — orders.book_id n'a aucune contrainte
// de cle etrangere, donc c'est le seul garde-fou. b2 est en 'editing' et
// n'a aucune commande : c'est le seul candidat legitime dans ce jeu de
// donnees.
describe('Espace admin — nettoyage des livres non finalises', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  beforeEach(() => { process.env.ADMIN_EMAILS = ADMIN_EMAIL; });
  afterEach(() => {
    process.env = { ...OLD_ENV };
    // Remet b2 si un test precedent l'a supprime.
    const books = global.__adminSupabaseMock.__table('books');
    if (!books.find((b) => b.id === 'b2')) {
      books.push({ id: 'b2', owner_id: 'anon-1', title: 'Livre sans compte', print_format: 'livret', page_count: 30, updated_at: '2026-09-11T10:00:00Z', created_at: '2026-09-11T09:00:00Z', cover_config: {} });
    }
  });

  it('GET /books/unfinalized refuse un non-administrateur', async () => {
    const response = await request(app).get('/api/admin/books/unfinalized').set('Authorization', 'Bearer user-token');
    expect(response.status).toBe(404);
  });

  it('GET /books/unfinalized ne liste QUE b2 — jamais b1, qui a une commande', async () => {
    const response = await request(app).get('/api/admin/books/unfinalized').set('Authorization', 'Bearer admin-token');
    expect(response.status).toBe(200);
    expect(response.body.books.map((b) => b.id)).toEqual(['b2']);
  });

  it('POST /books/unfinalized/purge refuse un non-administrateur, sans rien supprimer', async () => {
    const response = await request(app).post('/api/admin/books/unfinalized/purge').set('Authorization', 'Bearer user-token');
    expect(response.status).toBe(404);
    expect(global.__adminSupabaseMock.__table('books').map((b) => b.id)).toEqual(expect.arrayContaining(['b1', 'b2']));
  });

  it('POST /books/unfinalized/purge supprime b2 et conserve b1 (il a une commande)', async () => {
    const response = await request(app).post('/api/admin/books/unfinalized/purge').set('Authorization', 'Bearer admin-token');
    expect(response.status).toBe(200);
    expect(response.body.removed).toBe(1);
    expect(response.body.bookIds).toEqual(['b2']);
    // Les photos du dossier de b2 doivent etre nettoyees aussi — jamais
    // seulement la ligne "books" (voir storageService.deleteBookFolder).
    expect(require('../services/storageService').deleteBookFolder).toHaveBeenCalledWith('contribution-photos', 'b2');

    const remaining = global.__adminSupabaseMock.__table('books').map((b) => b.id);
    expect(remaining).toContain('b1');
    expect(remaining).not.toContain('b2');
  });
});

// Comptes anonymes abandonnes (2026-10-04, voir
// services/accounts/anonymousPurge.js). Les routes elles-memes ne font que
// deleguer et verifier les droits — le detail (exclusion des comptes avec
// commande, ordre des suppressions) est teste directement sur le service
// dans tests/accounts/anonymousPurge.test.js ; ici on verifie juste le cote
// HTTP (acces, parametre `jours`, forme de la reponse).
describe('Espace admin — comptes anonymes abandonnes', () => {
  let app;
  const OLD_ENV = { ...process.env };

  beforeAll(() => { app = buildApp(); });
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    global.__adminSupabaseMock.auth.admin.listUsers.mockImplementation(async ({ page }) => (
      page === 1
        ? { data: { users: [{ id: 'u-abandon', is_anonymous: true, created_at: '2020-01-01T00:00:00Z' }] }, error: null }
        : { data: { users: [] }, error: null }
    ));
  });
  afterEach(() => { process.env = { ...OLD_ENV }; });

  it('GET /accounts/anonymous/abandoned refuse un non-administrateur', async () => {
    const response = await request(app).get('/api/admin/accounts/anonymous/abandoned').set('Authorization', 'Bearer user-token');
    expect(response.status).toBe(404);
  });

  it('GET /accounts/anonymous/abandoned liste le compte abandonne, avec le seuil par defaut (7 jours)', async () => {
    const response = await request(app).get('/api/admin/accounts/anonymous/abandoned').set('Authorization', 'Bearer admin-token');
    expect(response.status).toBe(200);
    expect(response.body.jours).toBe(7);
    expect(response.body.total).toBe(1);
    expect(response.body.comptes[0].userId).toBe('u-abandon');
  });

  it('POST /accounts/anonymous/abandoned/purge refuse un non-administrateur', async () => {
    const response = await request(app).post('/api/admin/accounts/anonymous/abandoned/purge').set('Authorization', 'Bearer user-token');
    expect(response.status).toBe(404);
    expect(global.__adminSupabaseMock.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('POST /accounts/anonymous/abandoned/purge supprime le compte abandonne', async () => {
    const response = await request(app).post('/api/admin/accounts/anonymous/abandoned/purge').set('Authorization', 'Bearer admin-token');
    expect(response.status).toBe(200);
    expect(response.body.removed).toBe(1);
    expect(global.__adminSupabaseMock.auth.admin.deleteUser).toHaveBeenCalledWith('u-abandon');
  });
});
