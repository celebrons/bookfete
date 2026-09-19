// Tests de fumee des routes du moteur de mise en page : catalogues publics,
// CRUD de contenu scope par owner, et endpoint de composition.

const BOOK_ID = 'book-test-1';
const OTHER_BOOK_ID = 'book-test-2';

let supabaseMock;

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        {
          id: 'book-test-1',
          owner_id: 'owner-test-1',
          title: 'Mon livre',
          template_id: 'tpl-1',
          // 48 (pas 24) : depuis le plancher imprimable Gelato (28 pages
          // minimum, 2026-09-09 — voir layoutEngine.MIN_PRINTABLE_PAGES),
          // POST /compose bloque desormais (422) tout resultat sous ce
          // seuil. Un budget genereux ici evite aussi overflow===true une
          // fois les ~32 items ajoutes plus bas (book_content_items).
          page_count: 48,
          collection_mode: 'solo'
        },
        { id: 'book-test-2', owner_id: 'someone-else', title: "Livre d'un autre" },
        {
          id: 'book-test-3',
          owner_id: 'owner-test-1',
          title: 'Livre sans page interieure',
          template_id: 'tpl-1',
          page_count: 24,
          collection_mode: 'solo'
        },
        {
          id: 'book-test-4',
          owner_id: 'owner-test-1',
          title: 'Livre au format livret',
          template_id: 'tpl-1',
          page_count: 24,
          collection_mode: 'solo',
          print_format: 'livret'
        },
        {
          id: 'book-test-5',
          owner_id: 'owner-test-1',
          title: 'Livre atelier manuel',
          template_id: 'tpl-1',
          // 32 (pas 2) : idem book-test-1, plancher imprimable Gelato.
          page_count: 32,
          collection_mode: 'solo'
        },
        {
          id: 'book-test-8',
          owner_id: 'owner-test-1',
          title: 'Livre avec assez de contenu (changement de format)',
          template_id: 'tpl-1',
          page_count: 48,
          collection_mode: 'solo'
        },
        {
          id: 'book-test-6',
          owner_id: 'owner-test-1',
          title: 'Livre collaboratif',
          collection_mode: 'open',
          share_token: 'share-token-abc'
        },
        {
          id: 'book-test-7',
          owner_id: 'owner-test-1',
          title: 'Livre au format luxe',
          template_id: 'tpl-1',
          page_count: 24,
          collection_mode: 'solo',
          print_format: 'luxe'
        }
      ],
      book_templates: [
        {
          id: 'tpl-1',
          slug: 'elegance',
          label: 'Elegance',
          active: true,
          sort_order: 1,
          allowed_layouts: ['FULL_PHOTO'],
          design_tokens: { slotsPerPage: 3 }
        }
      ],
      layout_definitions: [
        {
          id: 'lay-1',
          slug: 'FULL_PHOTO',
          label: 'Photo pleine page',
          kind: 'photo',
          active: true,
          min_items: 1,
          max_items: 1,
          capacity: { slots: [{ type: 'photo' }] }
        },
        {
          id: 'lay-mixte',
          slug: 'PHOTO_TEXT',
          label: 'Photo et texte',
          kind: 'mixte',
          active: true,
          min_items: 2,
          max_items: 2,
          capacity: { slots: [{ type: 'photo' }, { type: 'text', lengthClass: ['SHORT', 'MEDIUM', 'LONG'] }] }
        }
      ],
      book_products: [
        { id: 'prod-1', page_count: 24, format: 'standard', price_cents: 2900, active: true }
      ],
      book_content_items: [
        { id: 'item-1', book_id: 'book-test-1', source: 'upload', kind: 'photo', url: 'https://cdn.test/1.jpg', display_order: 0 },
        { id: 'item-5-photo', book_id: 'book-test-5', source: 'upload', kind: 'photo', url: 'https://cdn.test/5.jpg', display_order: 0 },
        { id: 'item-5-text', book_id: 'book-test-5', source: 'upload', kind: 'texte', text: 'Un souvenir.', display_order: 1 },
        // Dediees a GET /print-quality-check (voir plus bas) : metadata.width/
        // height reellement bas/haut pour obtenir un DPI effectif sans
        // ambiguite une fois placees en FULL_PHOTO (lay-1) sur un format
        // standard (~182x252mm de zone utile).
        { id: 'item-5-photo-lowres', book_id: 'book-test-5', source: 'upload', kind: 'photo', url: 'https://cdn.test/5-lowres.jpg', display_order: 2, metadata: { width: 100, height: 100 } },
        { id: 'item-5-photo-hires', book_id: 'book-test-5', source: 'upload', kind: 'photo', url: 'https://cdn.test/5-hires.jpg', display_order: 3, metadata: { width: 4000, height: 3000 } }
      ]
        // 32 photos supplementaires sur book-test-1 : template tpl-1
        // n'autorise que FULL_PHOTO (1 photo/page, voir allowed_layouts
        // plus bas), donc ~1 photo == ~1 page composee — largement de quoi
        // depasser le plancher imprimable Gelato (28 pages, voir
        // layoutEngine.MIN_PRINTABLE_PAGES) sans depasser page_count:48
        // (evite overflow===true, teste explicitement plus bas).
        .concat(Array.from({ length: 32 }, (_, index) => ({
          id: `item-1-bulk-${index}`,
          book_id: 'book-test-1',
          source: 'upload',
          kind: 'photo',
          url: `https://cdn.test/1-bulk-${index}.jpg`,
          display_order: index + 1
        })))
        // 30 photos supplementaires sur book-test-5, EN PLUS de
        // item-5-photo/item-5-text (celles-ci restent les seules
        // verrouillees manuellement dans les tests "page verrouillee
        // survit..." — le pool restant doit a lui seul depasser 28 pages
        // une fois la page verrouillee exclue, voir formatComposer.js).
        .concat(Array.from({ length: 30 }, (_, index) => ({
          id: `item-5-bulk-${index}`,
          book_id: 'book-test-5',
          source: 'upload',
          kind: 'photo',
          url: `https://cdn.test/5-bulk-${index}.jpg`,
          display_order: index + 2
        })))
        // book-test-8 : livre dedie au test de changement de format sur un
        // livre initialement SANS page interieure persistee (book_pages
        // vide au depart), mais avec assez de contenu reel pour composer
        // au dessus du plancher imprimable — book-test-3 reste, lui,
        // volontairement VIDE de tout contenu (voir plus bas : test
        // "preview.html sur un livre sans aucune page interieure...", qui
        // depend justement de book-test-3 n'ayant jamais rien compose).
        .concat(Array.from({ length: 32 }, (_, index) => ({
          id: `item-8-bulk-${index}`,
          book_id: 'book-test-8',
          source: 'upload',
          kind: 'photo',
          url: `https://cdn.test/8-bulk-${index}.jpg`,
          display_order: index
        }))),
      book_pages: []
    },
    { userId: 'owner-test-1', userEmail: 'organisateur@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('../services/composition/pdfService', () => ({
  resolveBrowserPath: jest.fn(() => '/fake/chrome'),
  renderPdfFromHtml: jest.fn(async () => require('path').join(__dirname, 'fixtures', 'fake.pdf')),
  renderPdfFromPages: jest.fn(async () => require('path').join(__dirname, 'fixtures', 'fake.pdf'))
}));

jest.mock('../services/storageService', () => ({
  uploadFile: jest.fn(async () => ({ success: true, url: 'https://cdn.test/uploaded.jpg', fileName: 'book-test-1/uploaded.jpg' }))
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', require('../routes/composition'));
  app.use('/', require('../routes/products'));
  return app;
}

describe('routes/composition', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
    supabaseMock = global.__supabaseMock;
  });

  describe('catalogues publics', () => {
    it('GET /api/catalog/templates ne demande pas d\'authentification', async () => {
      const response = await request(app).get('/api/catalog/templates');
      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({ slug: 'elegance' });
    });

    it('GET /api/catalog/layouts renvoie les layouts actifs', async () => {
      const response = await request(app).get('/api/catalog/layouts');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('GET /api/catalog/products renvoie les produits actifs', async () => {
      const response = await request(app).get('/api/catalog/products');
      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({ page_count: 24 });
    });
  });

  describe('content-items — authentification et ownership', () => {
    it('refuse une requete sans header Authorization', async () => {
      const response = await request(app).get(`/api/books/${BOOK_ID}/content-items`);
      expect(response.status).toBe(401);
    });

    it("refuse l'acces au livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .get(`/api/books/${OTHER_BOOK_ID}/content-items`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(403);
    });

    it('renvoie 404 pour un livre inexistant', async () => {
      const response = await request(app)
        .get('/api/books/does-not-exist/content-items')
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(404);
    });

    it("getBook() interroge select('*') — jamais une liste explicite de colonnes (regression : une colonne "
      + "heritee/incertaine nommee explicitement, ex. event_date/recipient_name, a deja fait echouer TOUTE requete "
      + "avec 'Livre introuvable' en production des qu'elle n'existait pas reellement en base, select('*') ne peut "
      + "jamais echouer pour une colonne absente)", async () => {
      const before = supabaseMock.__calls.length;
      await request(app)
        .get(`/api/books/${BOOK_ID}/content-items`)
        .set('Authorization', 'Bearer valid-token');

      const booksCalls = supabaseMock.__calls.slice(before).filter((call) => call.table === 'books');
      expect(booksCalls.length).toBeGreaterThan(0);
      booksCalls.forEach((call) => expect(call.columns).toBe('*'));
    });
  });

  describe('content-items — CRUD nominal', () => {
    it('liste puis cree un item', async () => {
      const list = await request(app)
        .get(`/api/books/${BOOK_ID}/content-items`)
        .set('Authorization', 'Bearer valid-token');
      expect(list.status).toBe(200);
      // 1 (item-1) + 32 items en vrac ajoutes pour depasser le plancher
      // imprimable Gelato dans les tests de composition plus bas (voir
      // book_content_items en tete de fichier).
      expect(list.body).toHaveLength(33);

      const created = await request(app)
        .post(`/api/books/${BOOK_ID}/content-items`)
        .set('Authorization', 'Bearer valid-token')
        .send({ source: 'upload', kind: 'texte', text: 'Un souvenir.' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ book_id: BOOK_ID, kind: 'texte' });
    });
  });

  describe('POST /api/books/:bookId/content-items/photo', () => {
    it('uploade une photo et cree le content-item', async () => {
      const octets = Buffer.from('fake-image-bytes');
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/content-items/photo`)
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', octets, 'souvenir.jpg');

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        book_id: BOOK_ID,
        kind: 'photo',
        url: 'https://cdn.test/uploaded.jpg'
      });

      // Nom et poids du fichier d'origine (2026-09-19) : sans eux, l'atelier
      // n'a aucun moyen de reconnaitre une photo deja envoyee — une fois
      // dans le stockage, elle porte un nom genere.
      expect(response.body.metadata).toMatchObject({
        originalName: 'souvenir.jpg',
        size: octets.length
      });

      const storageService = require('../services/storageService');
      expect(storageService.uploadFile).toHaveBeenCalledWith('contribution-photos', expect.anything(), BOOK_ID);
    });

    it('refuse sans fichier joint', async () => {
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/content-items/photo`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(400);
    });

    it('refuse une photo trop volumineuse avec un message JSON clair en francais (pas la page HTML brute de multer/Express)', async () => {
      const oversized = Buffer.alloc(21 * 1024 * 1024, 1); // > 20 Mo (limite, voir middleware/upload.js)
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/content-items/photo`)
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', oversized, 'trop-grande.jpg');

      expect(response.status).toBe(413);
      expect(response.body.error).toMatch(/volumineuse/i);
      expect(response.body.error).toMatch(/20 Mo/);
    });

    it("refuse l'upload sur le livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .post(`/api/books/${OTHER_BOOK_ID}/content-items/photo`)
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', Buffer.from('fake-image-bytes'), 'souvenir.jpg');
      expect(response.status).toBe(403);
    });
  });

  describe('lien de partage collaboratif (public, sans authentification)', () => {
    it('GET /api/public/share/:token renvoie 404 pour un token invalide', async () => {
      const response = await request(app).get('/api/public/share/does-not-exist');
      expect(response.status).toBe(404);
    });

    it('GET /api/public/share/:token renvoie uniquement id/title, sans authentification', async () => {
      const response = await request(app).get('/api/public/share/share-token-abc');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 'book-test-6', title: 'Livre collaboratif' });
    });

    it("POST .../text cree un item texte dans book_content_items du bon livre, sans authentification", async () => {
      const response = await request(app)
        .post('/api/public/share/share-token-abc/text')
        .send({ text: 'Un souvenir envoye sans compte.', contributorName: 'Jules', contributionId: 'contrib-1' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        book_id: 'book-test-6',
        kind: 'texte',
        text: 'Un souvenir envoye sans compte.',
        contribution_id: 'contrib-1',
        metadata: { contributor_name: 'Jules' }
      });
    });

    it('POST .../text refuse un texte vide', async () => {
      const response = await request(app)
        .post('/api/public/share/share-token-abc/text')
        .send({ text: '   ' });
      expect(response.status).toBe(400);
    });

    it('POST .../text sur un token invalide renvoie 404 (jamais de creation orpheline)', async () => {
      const response = await request(app)
        .post('/api/public/share/does-not-exist/text')
        .send({ text: 'Peu importe.' });
      expect(response.status).toBe(404);
    });

    it("POST .../photo uploade une photo et cree l'item, sans authentification", async () => {
      const response = await request(app)
        .post('/api/public/share/share-token-abc/photo')
        .field('contributorName', 'Jules')
        .field('contributionId', 'contrib-1')
        .attach('photo', Buffer.from('fake-image-bytes'), 'souvenir.jpg');

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        book_id: 'book-test-6',
        kind: 'photo',
        url: 'https://cdn.test/uploaded.jpg',
        contribution_id: 'contrib-1'
      });

      const storageService = require('../services/storageService');
      expect(storageService.uploadFile).toHaveBeenCalledWith('contribution-photos', expect.anything(), 'book-test-6');
    });

    it('POST .../photo refuse sans fichier joint', async () => {
      const response = await request(app).post('/api/public/share/share-token-abc/photo');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/books/:bookId/recommended-page-count', () => {
    it('recommande un palier a partir du contenu du livre', async () => {
      const response = await request(app)
        .get(`/api/books/${BOOK_ID}/recommended-page-count`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(typeof response.body.recommended).toBe('number');
      expect(Array.isArray(response.body.tiers)).toBe(true);
    });
  });

  describe('POST /api/books/:bookId/compose', () => {
    it('refuse si le livre n\'a pas de template', async () => {
      // livre sans template_id/page_count dans les fixtures du mock
      const response = await request(app)
        .post(`/api/books/${OTHER_BOOK_ID}/compose`)
        .set('Authorization', 'Bearer valid-token');
      // OTHER_BOOK_ID appartient a un autre owner : 403 avant meme la verif template
      expect(response.status).toBe(403);
    });

    it('compose le livre et persiste les pages', async () => {
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/compose`)
        .set('Authorization', 'Bearer valid-token')
        .send({ variant: 0 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.pages)).toBe(true);
      expect(response.body.pages.length).toBeGreaterThan(0);
      expect(response.body.overflow).toBe(false);
    });

    // 2026-09-14 : la composition ne mettait PAS a jour books.page_count. Les
    // pages verrouillees survivant a une recomposition, le livre pouvait
    // contenir plus de pages qu'il n'en declarait — et comme le PRIX se
    // calcule sur page_count tandis que le FICHIER D'IMPRESSION se construit
    // sur les pages reelles, on facturait un nombre de pages et on en
    // imprimait un autre (constate sur un livre reel : 30 facturees, 40
    // imprimees).
    it('synchronise books.page_count avec le livre reel (plancher 30, nombre PAIR, aucune page au-dela)', async () => {
      const supabase = require('../config/supabase');
      const { MIN_BOOK_PAGES } = require('../services/composition/bookContentService');
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/compose`)
        .set('Authorization', 'Bearer valid-token')
        .send({ variant: 0 });

      expect(response.status).toBe(200);
      const { data: book } = await supabase.from('books').select('*').eq('id', BOOK_ID).single();

      // Le compte n'est pas forcement `pages.length` : une composition peut
      // produire un nombre IMPAIR (mesure : 33), que l'imprimeur refuse — il
      // est alors arrondi au pair superieur. Ce sont les trois garanties
      // ci-dessous qui comptent, pas l'egalite stricte.
      expect(book.page_count).toBeGreaterThanOrEqual(MIN_BOOK_PAGES);
      expect(book.page_count % 2).toBe(0);
      expect(book.page_count).toBeGreaterThanOrEqual(response.body.pages.length);
      expect(response.body.pageCount).toBe(book.page_count);
    });

    // DEUX BLOCAGES RETIRES LE 2026-09-15, tous deux constates sur des livres
    // reels de l utilisateur.
    //
    // 1. Le plancher de 30 pages refusait la generation tant que le CONTENU ne
    //    remplissait pas 30 pages. Le calcul etait juste (47 photos tiennent
    //    en ~21 pages, le moteur en posant plusieurs par page) mais le refus
    //    ne l etait plus : depuis que les pages blanches sont des pages a part
    //    entiere (rendues, comptees, facturees), un livre de 30 pages dont 21
    //    composees est parfaitement valide — c est deja ce qu est un livre
    //    compose a la main. Et syncPageCount tient le plancher de toute facon.
    // 2. Un template etait exige, alors que ce n est qu une liste blanche de
    //    mises en page (vide = pas de restriction). Les livres crees par le
    //    parcours actuel n en ont aucun : le mode automatique leur etait
    //    purement et simplement inaccessible.
    it('genere meme quand le contenu ne remplit pas tout le livre (pages blanches a la fin)', async () => {
      const response = await request(app)
        .post('/api/books/book-test-5/compose')
        .set('Authorization', 'Bearer valid-token')
        .send({ variant: 0 });

      expect(response.status).toBe(200);
      expect(response.body.pages.length).toBeGreaterThan(0);
      // Le plancher produit reste tenu par l autorite unique, pas par un refus.
      const { MIN_BOOK_PAGES } = require('../services/composition/bookContentService');
      expect(response.body.pageCount).toBeGreaterThanOrEqual(MIN_BOOK_PAGES);
    });

    it('genere aussi un livre SANS template (le catalogue complet sert de pioche)', async () => {
      const livre = supabaseMock.__table('books').find((b) => b.id === 'book-test-5');
      const templatePrecedent = livre.template_id;
      livre.template_id = null;
      try {
        const response = await request(app)
          .post('/api/books/book-test-5/compose')
          .set('Authorization', 'Bearer valid-token')
          .send({ variant: 0 });

        expect(response.status).toBe(200);
        expect(response.body.pages.length).toBeGreaterThan(0);
      } finally {
        livre.template_id = templatePrecedent;
      }
    });

    it('accepte une ambiance (mood) valide', async () => {
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/compose`)
        .set('Authorization', 'Bearer valid-token')
        .send({ variant: 0, mood: 'aere' });

      expect(response.status).toBe(200);
      expect(response.body.pages.length).toBeGreaterThan(0);
    });

    it('une ambiance inconnue degrade silencieusement (pas d\'erreur, compose quand meme)', async () => {
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/compose`)
        .set('Authorization', 'Bearer valid-token')
        .send({ variant: 0, mood: 'inexistant' });

      expect(response.status).toBe(200);
      expect(response.body.pages.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/books/:bookId/format-options', () => {
    it('refuse une requete sans header Authorization', async () => {
      const response = await request(app).get(`/api/books/${BOOK_ID}/format-options`);
      expect(response.status).toBe(401);
    });

    it("refuse le livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .get(`/api/books/${OTHER_BOOK_ID}/format-options`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(403);
    });

    it('renvoie une pagination calculee pour chacun des 3 formats, sans rien persister', async () => {
      const before = supabaseMock.__table('book_pages').filter((p) => p.book_id === BOOK_ID);

      const response = await request(app)
        .get(`/api/books/${BOOK_ID}/format-options`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.formats).toEqual(expect.arrayContaining([
        expect.objectContaining({ formatId: 'livret', pageCount: expect.any(Number) }),
        expect.objectContaining({ formatId: 'standard', pageCount: expect.any(Number) }),
        expect.objectContaining({ formatId: 'luxe', pageCount: expect.any(Number) })
      ]));

      const after = supabaseMock.__table('book_pages').filter((p) => p.book_id === BOOK_ID);
      expect(after).toEqual(before);
    });
  });

  describe('POST /api/books/:bookId/format', () => {
    it('refuse une requete sans header Authorization', async () => {
      const response = await request(app).post(`/api/books/${BOOK_ID}/format`).send({ formatId: 'luxe' });
      expect(response.status).toBe(401);
    });

    it("refuse le livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .post(`/api/books/${OTHER_BOOK_ID}/format`)
        .set('Authorization', 'Bearer valid-token')
        .send({ formatId: 'luxe' });
      expect(response.status).toBe(403);
    });

    it('refuse un formatId inconnu', async () => {
      const response = await request(app)
        .post(`/api/books/${BOOK_ID}/format`)
        .set('Authorization', 'Bearer valid-token')
        .send({ formatId: 'geant' });
      expect(response.status).toBe(400);
    });

    it('recompose, persiste et met a jour print_format/page_count du livre', async () => {
      // book-test-8 (pas BOOK_ID, pas book-test-3) : le mock partage son etat
      // entre tous les tests de ce fichier (pas de reset entre chaque `it`) —
      // muter BOOK_ID.print_format ici casserait les tests plus bas qui
      // supposent encore BOOK_ID au format "standard" par defaut (ex.
      // cover-preview.html) ; book-test-3, lui, doit rester SANS contenu
      // compose (voir le test "preview.html sur un livre sans aucune page
      // interieure..." plus bas, qui en depend) — book-test-8 est dedie a
      // ce test-ci, avec assez de contenu pour depasser le plancher
      // imprimable (28 pages, voir layoutEngine.MIN_PRINTABLE_PAGES).
      const response = await request(app)
        .post(`/api/books/book-test-8/format`)
        .set('Authorization', 'Bearer valid-token')
        .send({ formatId: 'luxe' });

      expect(response.status).toBe(200);
      expect(response.body.book).toMatchObject({ print_format: 'luxe', page_count: response.body.pageCount });
      expect(Array.isArray(response.body.pages)).toBe(true);
    });

    it('une page verrouillee manuellement survit a un changement de format (POST /format)', async () => {
      const saved = await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-5-photo', 'item-5-text'] });
      expect(saved.status).toBe(200);

      const formatResponse = await request(app)
        .post('/api/books/book-test-5/format')
        .set('Authorization', 'Bearer valid-token')
        .send({ formatId: 'luxe' });
      expect(formatResponse.status).toBe(200);

      const pages = await request(app)
        .get('/api/books/book-test-5/pages')
        .set('Authorization', 'Bearer valid-token');

      const page0 = pages.body.find((page) => page.page_index === 0);
      expect(page0.locked).toBe(true);
      expect(page0.layout_id).toBe('lay-mixte');
      expect(page0.content.itemIds).toEqual(['item-5-photo', 'item-5-text']);
    });
  });

  describe('apercu (preview.html / preview.pdf)', () => {
    it('GET preview.html renvoie un document HTML autonome sans dependance externe', async () => {
      const response = await request(app)
        .get(`/api/books/${BOOK_ID}/preview.html`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('<!doctype html>');
    });

    it('preview.html place une couverture avant la premiere page interieure et une 4e apres la derniere', async () => {
      const response = await request(app)
        .get(`/api/books/${BOOK_ID}/preview.html`)
        .set('Authorization', 'Bearer valid-token');

      const frontIndex = response.text.indexOf('data-cvr-role="front-cover"');
      const backIndex = response.text.indexOf('data-cvr-role="back-cover"');
      const firstInteriorIndex = response.text.indexOf('class="page-blocks"');

      expect(frontIndex).toBeGreaterThan(-1);
      expect(backIndex).toBeGreaterThan(-1);
      expect(backIndex).toBeGreaterThan(frontIndex);
      if (firstInteriorIndex !== -1) {
        expect(frontIndex).toBeLessThan(firstInteriorIndex);
        expect(backIndex).toBeGreaterThan(firstInteriorIndex);
      }
    });

    // Un livre dont AUCUNE page n'a jamais ete composee n'a aucune ligne en
    // base — mais il annonce quand meme un nombre de pages, et c est ce
    // nombre-la qui est facture et imprime. L apercu doit donc montrer le
    // livre ENTIER, pages blanches comprises (2026-09-14 : il n en montrait
    // que 24 sur 30, le client recevait moins de pages qu il n en payait).
    it('preview.html sur un livre sans aucune page composee montre quand meme toutes ses pages, blanches', async () => {
      const book = supabaseMock.__table('books').find((b) => b.id === 'book-test-3');
      const response = await request(app)
        .get('/api/books/book-test-3/preview.html')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.text).toContain('data-cvr-role="front-cover"');
      expect(response.text).toContain('data-cvr-role="back-cover"');
      const interieures = (response.text.match(/class="page-blocks"/g) || []).length;
      expect(interieures).toBe(book.page_count);
    });

    it('GET cover-preview.html renvoie le recto seul par defaut (?face omis), une seule page', async () => {
      const response = await request(app)
        .get(`/api/books/${BOOK_ID}/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('data-cvr-role="front-cover"');
      expect(response.text).not.toContain('data-cvr-role="back-cover"');
      expect(response.text).not.toContain('class="page-blocks"');
    });

    it('GET cover-preview.html?face=back renvoie la 4e de couverture seule', async () => {
      const response = await request(app)
        .get(`/api/books/${BOOK_ID}/cover-preview.html?face=back`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.text).toContain('data-cvr-role="back-cover"');
      expect(response.text).not.toContain('data-cvr-role="front-cover"');
    });

    // 2026-09-11 : l'apercu ne dimensionne plus la page en 100vw/100vh. Les
    // unites CSS pt et mm etant ABSOLUES, elles ne suivaient pas ce
    // redimensionnement : la typographie et les marges restaient a leur
    // taille absolue et paraissaient donc disproportionnees des que l'apercu
    // etait affiche plus petit que la taille physique de la page — l'apercu
    // n'etait pas fidele au PDF. La page garde desormais sa taille reelle et
    // est mise a l'echelle par une transformation, qui entraine TOUT avec
    // elle. La garantie testee ici reste la meme : aucun defilement dans
    // l'iframe.
    it('cover-preview.html tient dans son conteneur sans defilement, a l\'echelle de la page reelle', async () => {
      const response = await request(app)
        .get(`/api/books/${BOOK_ID}/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.text).toContain('overflow: hidden');
      expect(response.text).toContain('width: var(--page-width-mm)');
      expect(response.text).toContain('height: var(--page-height-mm)');
      // Mise a l'echelle proportionnelle (un seul facteur pour les deux axes,
      // donc jamais de deformation).
      expect(response.text).toContain('Math.min(window.innerWidth / w, window.innerHeight / h)');
    });

    it('cover-preview.html applique reellement book.print_format aux dimensions de la couverture (marge de securite livret = 8mm, standard = 15mm)', async () => {
      const livret = await request(app)
        .get(`/api/books/book-test-4/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');
      const standard = await request(app)
        .get(`/api/books/${BOOK_ID}/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');

      expect(livret.text).toContain('--cvr-safe-margin:8mm');
      expect(standard.text).toContain('--cvr-safe-margin:15mm');
    });

    it('cover-preview.html du format Livret est CARRE (200x200mm), pas portrait', async () => {
      const response = await request(app)
        .get(`/api/books/book-test-4/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.text).toContain('--page-width-mm: 200mm');
      expect(response.text).toContain('--page-height-mm: 200mm');
    });

    it('cover-preview.html du format Luxe affiche le cadre dore (has-gold-frame) SUR LA PAGE ELLE-MEME, pas les autres formats', async () => {
      // La regle CSS .has-gold-frame (definition, dans <style>) est toujours
      // presente quel que soit le format — seule la classe REELLEMENT posee
      // sur <section class="..."> doit varier : on isole donc cet attribut
      // plutot que de chercher la sous-chaine dans tout le document (qui
      // matcherait aussi le commentaire/selecteur CSS statique).
      const sectionClassOf = (html) => (html.match(/<section class="([^"]*)"/) || [])[1] || '';

      const luxe = await request(app)
        .get(`/api/books/book-test-7/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');
      const standard = await request(app)
        .get(`/api/books/${BOOK_ID}/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');
      const livret = await request(app)
        .get(`/api/books/book-test-4/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');

      expect(sectionClassOf(luxe.text)).toContain('has-gold-frame');
      expect(sectionClassOf(standard.text)).not.toContain('has-gold-frame');
      expect(sectionClassOf(livret.text)).not.toContain('has-gold-frame');
    });

    it("refuse cover-preview.html du livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .get(`/api/books/${OTHER_BOOK_ID}/cover-preview.html`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(403);
    });

    it("refuse l'apercu HTML du livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .get(`/api/books/${OTHER_BOOK_ID}/preview.html`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(403);
    });

    it('GET preview.pdf delegue a pdfService et renvoie un PDF', async () => {
      const response = await request(app)
        .get(`/api/books/${BOOK_ID}/preview.pdf`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');

      const pdfService = require('../services/composition/pdfService');
      expect(pdfService.renderPdfFromPages).toHaveBeenCalled();
    });

    it('GET preview.pdf transmet a pdfService un tableau de pages = interieur + couverture (front + back)', async () => {
      const pdfService = require('../services/composition/pdfService');
      pdfService.renderPdfFromPages.mockClear();

      const interiorPagesBefore = supabaseMock.__table('book_pages').filter((p) => p.book_id === BOOK_ID);
      const bookRow = supabaseMock.__table('books').find((b) => b.id === BOOK_ID);

      await request(app)
        .get(`/api/books/${BOOK_ID}/preview.pdf`)
        .set('Authorization', 'Bearer valid-token');

      const callArgs = pdfService.renderPdfFromPages.mock.calls[0][0];
      // Le livre ENTIER, pas seulement ses pages sauvegardees : une page
      // laissee vierge n a pas de ligne en base et doit pourtant etre
      // imprimee. + 2 pour le recto et la 4e de couverture.
      expect(callArgs.pages).toHaveLength(bookRow.page_count + 2);
      expect(interiorPagesBefore.length).toBeLessThan(bookRow.page_count);
      expect(callArgs.pages[0].content.kind).toBe('front-cover');
      expect(callArgs.pages[callArgs.pages.length - 1].content.kind).toBe('back-cover');
    });
  });

  describe('GET /api/books/:bookId/pages/:pageIndex/preview.html — atelier', () => {
    it('refuse une requete sans header Authorization', async () => {
      const response = await request(app).get(`/api/books/book-test-5/pages/0/preview.html`);
      expect(response.status).toBe(401);
    });

    it("refuse le livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .get(`/api/books/${OTHER_BOOK_ID}/pages/0/preview.html`)
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(403);
    });

    it('refuse un pageIndex invalide', async () => {
      const response = await request(app)
        .get('/api/books/book-test-5/pages/-1/preview.html')
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(400);
    });

    it('une page jamais construite se rend comme une page vide (jamais une 404)', async () => {
      const response = await request(app)
        .get('/api/books/book-test-5/pages/1/preview.html')
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(200);
      expect(response.text).toContain('data-page-index="1"');
    });

    it('une page interieure du format Luxe porte le cadre dore discret (has-gold-frame), pas les autres formats', async () => {
      const luxe = await request(app)
        .get('/api/books/book-test-7/pages/0/preview.html')
        .set('Authorization', 'Bearer valid-token');
      // BOOK_ID (pas book-test-5/book-test-3 : mutes en luxe par les tests
      // POST /format plus haut dans ce fichier, meme etat mock partage sur
      // tout le fichier) — reste au format par defaut ("standard") tout du long.
      const notLuxe = await request(app)
        .get(`/api/books/${BOOK_ID}/pages/0/preview.html`)
        .set('Authorization', 'Bearer valid-token');

      expect(luxe.text).toContain('has-gold-frame');
      // Le SELECTEUR CSS .page.has-gold-frame reste toujours present dans
      // <style> (regle partagee) — c'est la classe posee sur <section>
      // qu'il ne faut pas trouver ici, d'ou la verification sur <body> seul.
      expect(notLuxe.text.slice(notLuxe.text.indexOf('<body>'))).not.toContain('has-gold-frame');
    });

    it('une page manuellement construite se rend avec son contenu reel (meme moteur que le PDF)', async () => {
      await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-5-photo', 'item-5-text'] });

      const response = await request(app)
        .get('/api/books/book-test-5/pages/0/preview.html')
        .set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(200);
      expect(response.text).toContain('https://cdn.test/5.jpg');
      expect(response.text).toContain('Un souvenir.');
    });
  });

  // Deplacement d'une page (glisser-deposer dans le filmstrip, 2026-09-13).
  // La mecanique de reindexage elle-meme est verifiee contre une vraie base
  // (bookContentService.movePage) ; ici on verrouille les GARDE-FOUS de la
  // route, seuls remparts contre un index invente par un appelant.
  describe('POST /api/books/:bookId/pages/move — atelier', () => {
    it('refuse une requete sans header Authorization', async () => {
      const response = await request(app)
        .post('/api/books/book-test-5/pages/move')
        .send({ fromIndex: 0, toIndex: 1 });
      expect(response.status).toBe(401);
    });

    it("refuse le livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .post(`/api/books/${OTHER_BOOK_ID}/pages/move`)
        .set('Authorization', 'Bearer valid-token')
        .send({ fromIndex: 0, toIndex: 1 });
      expect(response.status).toBe(403);
    });

    it('refuse une position hors des pages du livre (book.page_count)', async () => {
      const response = await request(app)
        .post('/api/books/book-test-5/pages/move')
        .set('Authorization', 'Bearer valid-token')
        .send({ fromIndex: 0, toIndex: 99 });
      expect(response.status).toBe(400);
    });

    it('refuse une position non entiere ou negative', async () => {
      for (const body of [{ fromIndex: -1, toIndex: 0 }, { fromIndex: 0, toIndex: 1.5 }, { fromIndex: 'a', toIndex: 0 }, {}]) {
        const response = await request(app)
          .post('/api/books/book-test-5/pages/move')
          .set('Authorization', 'Bearer valid-token')
          .send(body);
        expect(response.status).toBe(400);
      }
    });
  });

  describe('PUT /api/books/:bookId/pages/:pageIndex/manual — atelier', () => {
    it('refuse une requete sans header Authorization', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-5-photo', 'item-5-text'] });
      expect(response.status).toBe(401);
    });

    it("refuse le livre d'un autre proprietaire", async () => {
      const response = await request(app)
        .put(`/api/books/${OTHER_BOOK_ID}/pages/0/manual`)
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-5-photo', 'item-5-text'] });
      expect(response.status).toBe(403);
    });

    it('refuse un pageIndex hors des pages du livre (book.page_count)', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/99/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-5-photo', 'item-5-text'] });
      expect(response.status).toBe(400);
    });

    it('refuse un body sans layoutId/itemIds', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({});
      expect(response.status).toBe(400);
    });

    it('refuse un layoutId inconnu', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-inconnu', itemIds: ['item-5-photo', 'item-5-text'] });
      expect(response.status).toBe(400);
    });

    it('refuse un contenu qui ne correspond pas aux emplacements (texte dans un emplacement photo)', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-5-text', 'item-5-text'] });
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("refuse un itemId appartenant a un autre livre (jamais un plantage, jamais un contenu d'un autre livre)", async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-1', 'item-5-text'] });
      expect(response.status).toBe(400);
    });

    it('sauvegarde une page valide (photo + texte), toujours verrouillee (locked=true)', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-5-photo', 'item-5-text'] });

      expect(response.status).toBe(200);
      expect(response.body.locked).toBe(true);
      expect(response.body.layout_id).toBe('lay-mixte');
      expect(response.body.content.itemIds).toEqual(['item-5-photo', 'item-5-text']);
      expect(response.body.content.blocks).toHaveLength(1);
    });

    it('une page verrouillee manuellement survit a une recomposition automatique (POST /compose)', async () => {
      const saved = await request(app)
        .put('/api/books/book-test-5/pages/0/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-mixte', itemIds: ['item-5-photo', 'item-5-text'] });
      expect(saved.status).toBe(200);

      await request(app)
        .post('/api/books/book-test-5/compose')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      const pages = await request(app)
        .get('/api/books/book-test-5/pages')
        .set('Authorization', 'Bearer valid-token');

      const page0 = pages.body.find((page) => page.page_index === 0);
      expect(page0.locked).toBe(true);
      expect(page0.layout_id).toBe('lay-mixte');
      expect(page0.content.itemIds).toEqual(['item-5-photo', 'item-5-text']);
    });

    // Cahier des charges "PhotoSlot" (2026-09-10, Phase B) : ajustement
    // manuel (point focal/zoom) sauvegarde avec la page.
    it('sauvegarde photoAdjustments avec la page (focalX/focalY/zoom valides)', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/3/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({
          layoutId: 'lay-1',
          itemIds: ['item-5-photo'],
          photoAdjustments: { 'item-5-photo': { focalX: 0.2, focalY: 0.9, zoom: 1.8, fitMode: 'cover' } }
        });

      expect(response.status).toBe(200);
      expect(response.body.content.photoAdjustments).toEqual({
        'item-5-photo': { focalX: 0.2, focalY: 0.9, zoom: 1.8, fitMode: 'cover' }
      });
    });

    it('borne un zoom hors limites plutot que de le refuser (jamais bloquant)', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/3/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({
          layoutId: 'lay-1',
          itemIds: ['item-5-photo'],
          photoAdjustments: { 'item-5-photo': { zoom: 99 } }
        });

      expect(response.status).toBe(200);
      expect(response.body.content.photoAdjustments['item-5-photo'].zoom).toBe(2.5); // PHOTO_ZOOM_MAX
    });

    it('ignore silencieusement un itemId etranger a cette page dans photoAdjustments', async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/3/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({
          layoutId: 'lay-1',
          itemIds: ['item-5-photo'],
          photoAdjustments: { 'item-5-photo': { zoom: 1.2 }, 'item-etranger': { zoom: 2 } }
        });

      expect(response.status).toBe(200);
      expect(Object.keys(response.body.content.photoAdjustments)).toEqual(['item-5-photo']);
    });

    it("n'ajoute pas de champ photoAdjustments quand aucun n'est fourni (retro-compatible)", async () => {
      const response = await request(app)
        .put('/api/books/book-test-5/pages/3/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-1', itemIds: ['item-5-photo'] });

      expect(response.status).toBe(200);
      expect(response.body.content.photoAdjustments).toBeUndefined();
    });
  });

  describe('GET /api/books/:bookId/print-quality-check', () => {
    it('refuse une requete sans authentification', async () => {
      const response = await request(app).get('/api/books/book-test-5/print-quality-check');
      expect(response.status).toBe(401);
    });

    it('signale une photo basse resolution placee en FULL_PHOTO (grand cadre), jamais bloquant', async () => {
      await request(app)
        .put('/api/books/book-test-5/pages/5/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-1', itemIds: ['item-5-photo-lowres'] });

      const response = await request(app)
        .get('/api/books/book-test-5/print-quality-check')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      const flagged = response.body.warnings.find(
        (entry) => entry.pageIndex === 5 && entry.itemId === 'item-5-photo-lowres'
      );
      expect(flagged).toBeDefined();
      expect(['limite', 'insuffisant']).toContain(flagged.statut);
      expect(flagged.label.toLowerCase()).not.toContain('dpi'); // jamais le mot DPI affiche (§2)
      expect(response.body.hasWarnings).toBe(true);
      // Vignette necessaire a l'ecran recapitulatif (§2) — repli sur l'original.
      expect(flagged.thumbnailUrl).toBeTruthy();
    });

    it('ne signale pas une photo haute resolution dans le meme type de cadre', async () => {
      await request(app)
        .put('/api/books/book-test-5/pages/6/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-1', itemIds: ['item-5-photo-hires'] });

      const response = await request(app)
        .get('/api/books/book-test-5/print-quality-check')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      const flagged = response.body.warnings.find(
        (entry) => entry.pageIndex === 6 && entry.itemId === 'item-5-photo-hires'
      );
      expect(flagged).toBeUndefined();
    });

    // Cahier des charges v2, §4 : le statut est PERSISTE a l'ecriture, pas
    // seulement calcule a l'affichage.
    it('persiste content.photoFit a la sauvegarde de la page (statut par photo)', async () => {
      const saved = await request(app)
        .put('/api/books/book-test-5/pages/9/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-1', itemIds: ['item-5-photo-lowres'] });

      expect(saved.status).toBe(200);
      expect(saved.body.content.photoFit).toBeDefined();
      expect(saved.body.content.photoFit['item-5-photo-lowres'].statut).toBe('insuffisant');
      expect(typeof saved.body.content.photoFit['item-5-photo-lowres'].dpiEffectif).toBe('number');
    });

    it("n'ajoute pas de photoFit quand aucune photo n'est evaluable (pas de champ vide en base)", async () => {
      const saved = await request(app)
        .put('/api/books/book-test-5/pages/10/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({ layoutId: 'lay-1', itemIds: ['item-5-photo'] }); // item sans metadata width/height

      expect(saved.status).toBe(200);
      expect(saved.body.content.photoFit).toBeUndefined();
    });

    it('lit le zoom manuel stocke sans planter (formule verifiee separement dans photoQualityEngine.test.js)', async () => {
      await request(app)
        .put('/api/books/book-test-5/pages/7/manual')
        .set('Authorization', 'Bearer valid-token')
        .send({
          layoutId: 'lay-1',
          itemIds: ['item-5-photo-hires'],
          photoAdjustments: { 'item-5-photo-hires': { zoom: 2.5 } }
        });

      const response = await request(app)
        .get('/api/books/book-test-5/print-quality-check')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.warnings)).toBe(true);
    });
  });
});
