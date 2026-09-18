// Le PDF n'est accessible qu'a qui l'a ACHETE.
//
// Demande du 2026-09-18 : « jamais afficher de PDF si le client ne l'a pas
// choisi ! s'il choisit uniquement l'impression, pas de PDF ».
//
// Ce n'etait pas qu'un probleme d'affichage. hasOrderPdfAccess ne regardait
// que le PAIEMENT, jamais le type de commande — donc une commande `print`
// payee ouvrait l'acces au PDF : generation, statut, telechargement. Un
// acheteur a 108 EUR repartait avec le fichier vendu 39 EUR, et le
// supplement du pack (+20 EUR) ne correspondait plus a rien.
//
// Nos trois formules : `pdf` (le fichier seul), `print` (le livre imprime
// seul), `pack` (les deux).
//
// A ne pas confondre avec le fichier d'IMPRESSION envoye a Gelato : un autre
// objet, produit par services/printing/gelatoPrintFile.js, qui ne passe pas
// par ces routes et reste disponible pour toute commande imprimee.

const OWNER_ID = 'owner-test-1';
const BOOK_PDF = 'book-pdf';
const BOOK_PRINT = 'book-print';
const BOOK_PACK = 'book-pack';

const livre = (id) => ({
  id,
  owner_id: OWNER_ID,
  title: 'Livre',
  template_id: 'tpl-1',
  page_count: 30,
  collection_mode: 'solo',
  print_format: 'standard'
});

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [livre(BOOK_PDF), livre(BOOK_PRINT), livre(BOOK_PACK)],
      book_templates: [{
        id: 'tpl-1', slug: 'elegance', label: 'Elegance', active: true, sort_order: 1,
        allowed_layouts: ['FULL_PHOTO'], design_tokens: { slotsPerPage: 3 }
      }],
      layout_definitions: [{
        id: 'lay-1', slug: 'FULL_PHOTO', label: 'Photo pleine page', kind: 'photo',
        active: true, min_items: 1, max_items: 1, capacity: { slots: [{ type: 'photo' }] }
      }],
      book_content_items: [
        { id: 'item-1', book_id: BOOK_PDF, source: 'upload', kind: 'photo', url: 'https://cdn.test/1.jpg', display_order: 0 },
        { id: 'item-2', book_id: BOOK_PRINT, source: 'upload', kind: 'photo', url: 'https://cdn.test/2.jpg', display_order: 0 },
        { id: 'item-3', book_id: BOOK_PACK, source: 'upload', kind: 'photo', url: 'https://cdn.test/3.jpg', display_order: 0 }
      ],
      book_pages: [],
      orders: [
        // Les trois sont PAYEES : seul le type les distingue.
        { id: 'cmd-pdf', owner_id: OWNER_ID, book_id: BOOK_PDF, status: 'paid', type: 'pdf', metadata: {} },
        { id: 'cmd-print', owner_id: OWNER_ID, book_id: BOOK_PRINT, status: 'paid', type: 'print', metadata: {} },
        { id: 'cmd-pack', owner_id: OWNER_ID, book_id: BOOK_PACK, status: 'paid', type: 'pack', metadata: {} }
      ]
    },
    { userId: OWNER_ID, userEmail: 'organisateur@test.local' }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('../services/composition/pdfService', () => ({
  resolveBrowserPath: jest.fn(() => '/fake/chrome'),
  renderPdfFromHtml: jest.fn(async () => require('path').join(__dirname, 'fixtures', 'fake.pdf')),
  renderPdfFromPages: jest.fn(async () => require('path').join(__dirname, 'fixtures', 'fake.pdf'))
}));

jest.mock('../services/email/transactionalEmails', () => ({
  envoyerPdfPret: jest.fn(async () => ({ sent: true })),
  isEmailEnabled: jest.fn(() => false)
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/books', require('../routes/books'));
  return app;
}

describe('Acces au PDF selon le TYPE de commande', () => {
  let app;

  beforeAll(() => { app = buildApp(); });

  const demanderExport = (bookId) => request(app)
    .post(`/api/books/${bookId}/export-final-pdf`)
    .set('Authorization', 'Bearer valid-token')
    .send({ forceRegenerate: true });

  it('une commande PDF payee ouvre bien l acces', async () => {
    const reponse = await demanderExport(BOOK_PDF);
    expect(reponse.status).toBe(202);
  });

  it('une commande PACK payee ouvre bien l acces — le PDF est compris', async () => {
    const reponse = await demanderExport(BOOK_PACK);
    expect(reponse.status).toBe(202);
  });

  it('une commande IMPRESSION payee ne donne AUCUN acces au PDF', async () => {
    const reponse = await demanderExport(BOOK_PRINT);

    expect(reponse.status).toBe(403);
    expect(String(reponse.body.error)).toMatch(/paiement/i);
  });

  it('le telechargement est refuse lui aussi, pas seulement la generation', async () => {
    const reponse = await request(app)
      .get(`/api/books/${BOOK_PRINT}/export-final-pdf/nimporte-quel-job/download/final`)
      .set('Authorization', 'Bearer valid-token');

    // 403 (pas d'acces) ou 404 (aucun job) : jamais un fichier.
    expect([403, 404]).toContain(reponse.status);
    expect(reponse.headers['content-type']).not.toMatch(/application\/pdf/);
  });
});
