// Regression test pour le bug "Aucun chapitre disponible pour generer le
// PDF final" : POST /:id/export-final-pdf s'appuyait encore sur le pipeline
// chapitres/brouillons legacy (loadOwnedBookChapterContext), qui echoue
// TOUJOURS pour un livre sans-IA (zero chapitre par construction). La route
// route desormais sur le meme pipeline que routes/composition.js:preview.pdf
// (bookContentService + coverComposer + pdfService), sans jamais regarder
// la table chapters. Voir memoire "collective-mode-status" / conversation
// du 2026-09-09 pour le contexte complet du bug (commande payee bloquee).

const BOOK_ID = 'pdf-book-1';
const OTHER_BOOK_ID = 'pdf-book-2';
const OWNER_ID = 'owner-test-1';

let supabaseMock;

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        {
          id: BOOK_ID,
          owner_id: OWNER_ID,
          title: 'Livre sans-IA sans chapitre',
          template_id: 'tpl-1',
          page_count: 24,
          collection_mode: 'solo',
          print_format: 'standard'
          // Pas de champ `chapters` — ce livre n'a JAMAIS eu de chapitre,
          // comme tout livre cree via le parcours sans-IA actuel.
        },
        { id: OTHER_BOOK_ID, owner_id: 'someone-else', title: "Livre d'un autre" }
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
        }
      ],
      book_content_items: [
        { id: 'item-1', book_id: BOOK_ID, source: 'upload', kind: 'photo', url: 'https://cdn.test/1.jpg', display_order: 0 }
      ],
      book_pages: [],
      orders: [
        {
          id: 'order-paid-1',
          owner_id: OWNER_ID,
          book_id: BOOK_ID,
          status: 'paid',
          type: 'pdf',
          metadata: {}
        }
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

const express = require('express');
const request = require('supertest');
const fs = require('fs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/books', require('../routes/books'));
  return app;
}

// Le job tourne en fire-and-forget (processPdfExportJob().catch(...)) : on
// laisse la microtask queue se vider avant d'interroger le statut, comme le
// ferait le polling reel du frontend (BookCheckoutLuxe.js) un instant plus tard.
function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('POST /api/books/:id/export-final-pdf — livre sans-IA (zero chapitre)', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
    supabaseMock = global.__supabaseMock;
    // fixture PDF factice pour que fs.existsSync(...) passe au telechargement
    const fixturesDir = require('path').join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
    const fakePdfPath = require('path').join(fixturesDir, 'fake.pdf');
    if (!fs.existsSync(fakePdfPath)) fs.writeFileSync(fakePdfPath, '%PDF-1.4 fake');
  });

  it('refuse une requete sans header Authorization', async () => {
    const response = await request(app).post(`/api/books/${BOOK_ID}/export-final-pdf`);
    expect(response.status).toBe(401);
  });

  it("refuse le livre d'un autre proprietaire", async () => {
    const response = await request(app)
      .post(`/api/books/${OTHER_BOOK_ID}/export-final-pdf`)
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(404);
  });

  it('renvoie 404 pour un livre inexistant', async () => {
    const response = await request(app)
      .post('/api/books/does-not-exist/export-final-pdf')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(404);
  });

  it("met en file un job PDF (202) SANS exiger de chapitre — regression du bug 'Aucun chapitre disponible'", async () => {
    const response = await request(app)
      .post(`/api/books/${BOOK_ID}/export-final-pdf`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.jobId).toEqual(expect.any(String));
    expect(response.body.status).toBe('queued');
  });

  it('le job se termine "ready" en utilisant le pipeline sans-IA (pdfService.renderPdfFromPages)', async () => {
    const pdfService = require('../services/composition/pdfService');
    pdfService.renderPdfFromPages.mockClear();

    const postResponse = await request(app)
      .post(`/api/books/${BOOK_ID}/export-final-pdf`)
      .set('Authorization', 'Bearer valid-token')
      .send({ forceRegenerate: true });

    expect(postResponse.status).toBe(202);
    const { jobId } = postResponse.body;

    await flushAsync();
    await flushAsync();

    const statusResponse = await request(app)
      .get(`/api/books/${BOOK_ID}/export-final-pdf/${jobId}/status`)
      .set('Authorization', 'Bearer valid-token');

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.status).toBe('ready');
    expect(pdfService.renderPdfFromPages).toHaveBeenCalledTimes(1);

    const callArgs = pdfService.renderPdfFromPages.mock.calls[0][0];
    // Le format vient de book.print_format (resolveRenderFormat), jamais de
    // PREVIEW_FORMATS (perime, ex. livret 148x210mm au lieu de 170x170mm).
    expect(callArgs.format.formatId).toBe('standard');
  });
});
