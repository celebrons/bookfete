// FILET PRINCIPAL DU REFACTORING — rendu du brouillon de chapitre.
//
// aiService.mistral est force a null : generateStructuredDraftFromContentPrompt
// sort immediatement et le pipeline bascule sur le fallback deterministe. Le HTML
// produit traverse alors la quasi-totalite des helpers de rendu du monolithe
// (cleanText, escapeHtml, splitDraftBody, formatParagraphs, renderAmorcePrompt,
// renderContributionSpotlight, renderPhotoGallery, folios, sanitizers...).
//
// Le snapshot doit rester IDENTIQUE apres extraction des modules.

const fixture = require('./fixtures/bookFixture');

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const bookFixture = require('./fixtures/bookFixture');
  const mock = createSupabaseMock(bookFixture.buildTables(), {
    userId: bookFixture.OWNER_ID,
    userEmail: bookFixture.OWNER_EMAIL
  });
  global.__supabaseMock = mock;
  return mock;
});

// Aucun client Mistral => chemin fallback deterministe, aucun appel reseau.
jest.mock('../services/aiService', () => ({ mistral: null }));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/books', require('../routes/books'));
  return app;
}

const AUTH = ['Authorization', 'Bearer valid-token'];

describe('POST /:id/chapters/:chapterId/generate-draft — rendu deterministe', () => {
  let app;
  let response;

  beforeAll(async () => {
    app = buildApp();
    response = await request(app)
      .post(`/api/books/${fixture.BOOK_ID}/chapters/${fixture.CHAPTER_ID}/generate-draft`)
      .set(...AUTH)
      .send({});
  });

  it('repond 200 avec un brouillon', () => {
    expect(response.status).toBe(200);
    expect(response.body.draft).toBeDefined();
  });

  it('utilise le mode fallback quand aucun client IA n est disponible', () => {
    expect(response.body.draft.generationMode).toBe('fallback');
  });

  it('incremente le compteur de generations', () => {
    expect(response.body.draft.generationCount).toBe(1);
    expect(response.body.draft.maxGenerations).toBe(3);
    expect(response.body.draft.status).toBe('draft');
  });

  it('produit un titre et un resume non vides', () => {
    expect(response.body.draft.title).toBeTruthy();
    expect(response.body.draft.summary).toBeTruthy();
  });

  it('joint un rapport de qualite', () => {
    expect(response.body.draft.aiQuality).toBeTruthy();
    expect(typeof response.body.draft.aiQuality.score).toBe('number');
  });

  describe('contenu du HTML genere', () => {
    let html;

    beforeAll(() => {
      html = response.body.draft.html;
    });

    it('est un fragment HTML non vide', () => {
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(500);
    });

    it('reprend le titre du chapitre', () => {
      expect(html).toContain('La cuisine du dimanche');
    });

    it('integre les contributions approuvees', () => {
      expect(html).toContain('Sophie Berger');
      expect(html).toContain('Karim Haddad');
    });

    it('exclut la contribution non approuvee', () => {
      expect(html).not.toContain('Elena Rossi');
      expect(html).not.toContain('ne doit pas apparaitre');
    });

    it('exclut les contributions systeme', () => {
      expect(html).not.toContain('__chapter_draft__');
      expect(html).not.toContain('__chapter_state__');
    });

    it('reference les photos des contributions', () => {
      expect(html).toContain('cdn.test.local/photos/cuisine.jpg');
    });

    it('ne laisse fuiter aucun placeholder de template non substitue', () => {
      expect(html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('[object Object]');
      expect(html).not.toContain('NaN');
    });

    it('produit un HTML equilibre en balises section/div', () => {
      const countTag = (tag) => (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
      const countClose = (tag) => (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
      ['section', 'div', 'p', 'article'].forEach((tag) => {
        expect(countTag(tag)).toBe(countClose(tag));
      });
    });

    it('correspond au rendu de reference (snapshot)', () => {
      expect(html).toMatchSnapshot();
    });
  });

  describe('garde-fous metier', () => {
    it('refuse un chapitre inexistant', async () => {
      const result = await request(app)
        .post(`/api/books/${fixture.BOOK_ID}/chapters/chapitre-inconnu/generate-draft`)
        .set(...AUTH)
        .send({});
      expect(result.status).toBe(404);
      expect(result.body.error).toBe('Chapitre introuvable');
    });

    it('refuse un livre qui n appartient pas a l utilisateur', async () => {
      const result = await request(app)
        .post(`/api/books/book-d-un-autre/chapters/${fixture.CHAPTER_ID}/generate-draft`)
        .set(...AUTH)
        .send({});
      expect(result.status).toBe(404);
      expect(result.body.error).toBe('Livre introuvable');
    });

    it('refuse la regeneration d un chapitre deja valide', async () => {
      const result = await request(app)
        .post(`/api/books/${fixture.BOOK_ID}/chapters/chapter-test-1/generate-draft`)
        .set(...AUTH)
        .send({});
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('Ce chapitre est deja valide definitivement');
    });

    it('refuse le mode apercu sur un chapitre non valide', async () => {
      const result = await request(app)
        .post(`/api/books/${fixture.BOOK_ID}/chapters/chapter-test-3/generate-draft`)
        .set(...AUTH)
        .send({ previewOnly: true });
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('Le mode apercu de regeneration est reserve aux chapitres valides');
    });

    it('autorise l apercu sur un chapitre valide sans modifier son etat', async () => {
      const result = await request(app)
        .post(`/api/books/${fixture.BOOK_ID}/chapters/chapter-test-1/generate-draft`)
        .set(...AUTH)
        .send({ previewOnly: true, allowValidatedRegeneration: true });

      expect(result.status).toBe(200);
      expect(result.body.previewOnly).toBe(true);
      expect(result.body.draft.status).toBe('validated');
      // Le compteur ne bouge pas en mode apercu
      expect(result.body.draft.generationCount).toBe(2);
    });

    it('refuse la regeneration reelle d un chapitre valide', async () => {
      const result = await request(app)
        .post(`/api/books/${fixture.BOOK_ID}/chapters/chapter-test-1/generate-draft`)
        .set(...AUTH)
        .send({ allowValidatedRegeneration: true, previewOnly: false });

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('apercu uniquement');
    });
  });
});
