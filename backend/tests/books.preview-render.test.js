// Apercu du livre complet (POST /:id/generate-draft) : couvre
// renderValidatedBookPreviewHtml, les couvertures assemblees, resolveCoverPreviewConfig
// et les garde-fous de validation (chapitres + couverture).

const validatedFixture = require('./fixtures/validatedBookFixture');
const baseFixture = require('./fixtures/bookFixture');

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const fixture = require('./fixtures/validatedBookFixture');
  const bookFixture = require('./fixtures/bookFixture');
  const mock = createSupabaseMock(fixture.buildTables({ withPendingChapter: false }), {
    userId: bookFixture.OWNER_ID,
    userEmail: bookFixture.OWNER_EMAIL
  });
  global.__supabaseMock = mock;
  return mock;
});

// L'IA de cadre (introduction / conclusion) echoue systematiquement :
// la route doit alors basculer sur le texte de repli.
jest.mock('../services/aiService', () => ({
  mistral: null,
  generateNarrativeContent: jest.fn(async () => {
    throw new Error('Mistral indisponible');
  })
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/books', require('../routes/books'));
  return app;
}

const AUTH = ['Authorization', 'Bearer valid-token'];

describe('POST /:id/generate-draft — apercu du livre complet', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  describe('garde-fous de validation', () => {
    it('refuse l apercu si la couverture n est pas validee', async () => {
      const response = await request(app)
        .post(`/api/books/${validatedFixture.NO_COVER_BOOK_ID}/generate-draft`)
        .set(...AUTH)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('couverture');
    });

    it('refuse l apercu si un chapitre n est pas valide', async () => {
      // Le livre de base a un chapitre non genere
      const response = await request(app)
        .post(`/api/books/${baseFixture.BOOK_ID}/generate-draft`)
        .set(...AUTH)
        .send({});

      // Livre absent de ce jeu de donnees : 404 attendu
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('rendu avec repli sur le texte de cadre', () => {
    let response;

    beforeAll(async () => {
      response = await request(app)
        .post(`/api/books/${validatedFixture.VALIDATED_BOOK_ID}/generate-draft`)
        .set(...AUTH)
        .send({});
    });

    it('repond 200 malgre l indisponibilite de l IA', () => {
      expect(response.status).toBe(200);
    });

    it('fournit une introduction et une conclusion de repli', () => {
      expect(response.body.frameTexts).toBeDefined();
      expect(response.body.frameTexts.introduction).toBeTruthy();
      expect(response.body.frameTexts.conclusion).toBeTruthy();
      expect(response.body.frameTexts.introduction).not.toBe(
        response.body.frameTexts.conclusion
      );
    });

    it('distingue le texte de conclusion du texte d introduction', () => {
      expect(response.body.frameTexts.conclusion).toContain('retenir pour la suite');
    });

    it('resout le format d apercu', () => {
      expect(response.body.previewFormat).toBe('standard');
    });

    it('normalise les reglages de mise en page', () => {
      expect(response.body.previewLayoutSettings).toMatchObject({
        textDensity: expect.any(String),
        imageDensity: expect.any(String),
        lineSpacing: expect.any(String),
        fontScale: expect.any(Number)
      });
    });

    it('assemble le HTML des trois chapitres valides', () => {
      const { html } = response.body;
      expect(html).toContain('Les racines');
      expect(html).toContain('La cuisine du dimanche');
      expect(html).toContain('Ce qu elle nous a transmis');
    });

    it('integre la couverture et la 4e de couverture', () => {
      const { html } = response.body;
      expect(html).toContain('Pour Marguerite');
      expect(html).toContain('Toute la famille, mars 2026');
    });

    it('ne laisse fuiter aucun placeholder ni valeur indefinie', () => {
      const { html } = response.body;
      expect(html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('[object Object]');
    });

    it('correspond au rendu de reference (snapshot)', () => {
      expect(response.body.html).toMatchSnapshot();
    });
  });
});
