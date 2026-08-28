// Chemin de PRODUCTION du brouillon de chapitre : un client Mistral est present
// et le moteur de prompts renvoie une sortie fixe au format [OUVERTURE]/[CORPS]/[CODA].
// Couvre buildChapterBodyPromptVariables, buildDraftFromChapterSections,
// normalizeGeneratedDraft, ensureDraftPages et analyzeChapterDraftQuality.

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

// Client IA present mais jamais appele directement : promptEngine est mocke.
jest.mock('../services/aiService', () => ({ mistral: { chat: { complete: jest.fn() } } }));

jest.mock('../services/promptEngine', () => {
  const actual = jest.requireActual('../services/promptEngine');
  const mock = require('./helpers/promptEngineMock');
  return { ...actual, runPromptGeneration: mock.runPromptGeneration };
});

const promptEngineMock = require('./helpers/promptEngineMock');
const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/books', require('../routes/books'));
  return app;
}

const AUTH = ['Authorization', 'Bearer valid-token'];

describe('POST /:id/chapters/:chapterId/generate-draft — chemin IA', () => {
  let app;
  let response;
  let promptCalls;

  beforeAll(async () => {
    promptEngineMock.__reset();
    app = buildApp();
    response = await request(app)
      .post(`/api/books/${fixture.BOOK_ID}/chapters/${fixture.CHAPTER_ID}/generate-draft`)
      .set(...AUTH)
      .send({});
    promptCalls = [...promptEngineMock.__calls()];
  });

  it('repond 200', () => {
    expect(response.status).toBe(200);
  });

  it('appelle le moteur de prompts avec le type chapter_body', () => {
    expect(promptCalls).toHaveLength(1);
    expect(promptCalls[0].promptType).toBe('chapter_body');
    expect(promptCalls[0].variables).toBeDefined();
  });

  it('transmet les variables de contexte attendues au prompt', () => {
    const serialized = JSON.stringify(promptCalls[0].variables);
    expect(serialized).toContain('Marguerite');
    expect(serialized).toContain('La cuisine du dimanche');
  });

  it('marque le brouillon comme genere par prompt en base', () => {
    expect(response.body.draft.generationMode).toBe('single_pass_db_prompt');
  });

  it('conserve les trois sections structurees', () => {
    const { sections } = response.body.draft;
    expect(sections).toBeTruthy();
    expect(sections.ouverture).toContain('cumin');
    expect(sections.corps).toContain('feuilles de brick');
    expect(sections.coda).toContain('mettre la table');
  });

  it('integre le texte du modele dans le HTML final', () => {
    expect(response.body.draft.html).toContain('cumin');
    expect(response.body.draft.html).toContain('le grand');
  });

  it('produit un rapport de qualite complet', () => {
    const quality = response.body.draft.aiQuality;
    expect(typeof quality.score).toBe('number');
    expect(quality.score).toBeGreaterThanOrEqual(0);
    expect(quality.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(quality.issues)).toBe(true);
    expect(quality.metrics).toMatchObject({
      totalChars: expect.any(Number),
      pageLengths: expect.any(Array),
      fillerMatches: expect.any(Number),
      duplicateCount: expect.any(Number),
      lexicalRatio: expect.any(Number)
    });
  });

  it('penalise un texte trop court et le signale dans les issues', () => {
    // L'echantillon de test (~1500 caracteres) est sous le seuil de 3800 :
    // le bareme sature donc le score a 0 et liste les motifs.
    const quality = response.body.draft.aiQuality;
    expect(quality.metrics.totalChars).toBeLessThan(3800);
    expect(quality.issues.join(' ')).toContain('trop court');
    expect(quality.score).toBe(0);
  });

  it('decoupe le brouillon sur le nombre de pages attendu', () => {
    expect(response.body.draft.aiQuality.metrics.pageLengths).toHaveLength(8);
  });

  it('ne laisse aucun marqueur de section brut dans le HTML', () => {
    const { html } = response.body.draft;
    expect(html).not.toContain('[OUVERTURE]');
    expect(html).not.toContain('[CORPS]');
    expect(html).not.toContain('[CODA]');
  });

  it('ne laisse fuiter aucun placeholder ni valeur indefinie', () => {
    const { html } = response.body.draft;
    expect(html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('[object Object]');
  });

  it('correspond au rendu de reference (snapshot)', () => {
    expect(response.body.draft.html).toMatchSnapshot();
  });

  it('bascule en fallback si le moteur de prompts echoue', async () => {
    promptEngineMock.__failNext(new Error('Mistral indisponible'));

    const result = await request(app)
      .post(`/api/books/${fixture.BOOK_ID}/chapters/${fixture.CHAPTER_ID}/generate-draft`)
      .set(...AUTH)
      .send({});

    expect(result.status).toBe(200);
    expect(result.body.draft.generationMode).toBe('fallback');
    expect(result.body.draft.html.length).toBeGreaterThan(500);
  });
});
