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
  // Rapporte une progression, comme le vrai rendu : c'est ce que la route
  // de statut doit republier au client. L impression compte des PHOTOS
  // chargees, la capture comptait des pages — la barre accepte les deux.
  renderPdfByPrinting: jest.fn(async ({ onProgress }) => {
    if (typeof onProgress === 'function') {
      onProgress({ phase: 'photos', done: 3, total: 12 });
    }
    return require('path').join(__dirname, 'fixtures', 'fake.pdf');
  }),
  // Toujours double, bien que la route ne s en serve plus : le fichier
  // d impression destine a Gelato passe encore par lui.
  renderPdfFromPages: jest.fn(async () => require('path').join(__dirname, 'fixtures', 'fake.pdf'))
}));

// L'email « PDF pret » est la contrepartie du message « vous pouvez fermer
// cette page » : on verifie qu'il part vraiment.
jest.mock('../services/email/transactionalEmails', () => ({
  envoyerPdfPret: jest.fn(async () => ({ sent: true })),
  envoyerCommandeConfirmee: jest.fn(async () => ({ sent: true })),
  envoyerPaiementRecu: jest.fn(async () => ({ sent: true })),
  envoyerEtapeFabrication: jest.fn(async () => ({ sent: true })),
  envoyerLienLivre: jest.fn(async () => ({ sent: true })),
  isEmailEnabled: jest.fn(() => true)
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

  it('le job se termine "ready" en utilisant le pipeline sans-IA (pdfService.renderPdfByPrinting)', async () => {
    const pdfService = require('../services/composition/pdfService');
    pdfService.renderPdfByPrinting.mockClear();

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
    expect(pdfService.renderPdfByPrinting).toHaveBeenCalledTimes(1);

    const callArgs = pdfService.renderPdfByPrinting.mock.calls[0][0];
    // Le format vient de book.print_format (resolveRenderFormat), jamais de
    // PREVIEW_FORMATS (perime, ex. livret 148x210mm au lieu de 170x170mm).
    expect(callArgs.format.formatId).toBe('standard');
    // UNE PAGE PAR FEUILLE. La mise en planches a ete essayee le 2026-09-19
    // puis retiree le jour meme : la couverture se retrouvait seule au milieu
    // d une feuille deux fois trop large et le livre ne ressemblait plus a ce
    // que l utilisateur avait compose. La page blanche apres la couverture
    // fait retomber les doubles pages en vis-a-vis dans un lecteur.
    expect(callArgs.spreadLayout).toBe(false);
    expect(callArgs.insertInsideCover).toBe(true);
  });
});

// Fabriquer un PDF prend plusieurs MINUTES (chaque page est capturee en
// haute resolution). L'interface affiche donc une barre d'avancement et
// invite l'utilisateur a fermer la page — deux promesses qui n'ont de sens
// que si le serveur publie une progression reelle et previent par email.
describe('Suivi de la fabrication du PDF', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  const lancerJob = async () => {
    const reponse = await request(app)
      .post(`/api/books/${BOOK_ID}/export-final-pdf`)
      .set('Authorization', 'Bearer valid-token')
      .send({ forceRegenerate: true });
    expect(reponse.status).toBe(202);
    return reponse.body.jobId;
  };

  const lireStatut = (jobId) => request(app)
    .get(`/api/books/${BOOK_ID}/export-final-pdf/${jobId}/status`)
    .set('Authorization', 'Bearer valid-token');

  it('un job qui demarre annonce deja une progression (la barre ne part pas de rien)', async () => {
    const jobId = await lancerJob();
    const statut = await lireStatut(jobId);

    expect(statut.status).toBe(200);
    expect(statut.body.progress).toEqual(expect.objectContaining({
      phase: expect.any(String),
      done: expect.any(Number),
      total: expect.any(Number),
      updatedAt: expect.any(String)
    }));
  });

  it('la progression rapportee par le rendu est republiee au client', async () => {
    const jobId = await lancerJob();
    await flushAsync();
    await flushAsync();

    const statut = await lireStatut(jobId);
    // 3 photos sur 12, exactement ce que le rendu a annonce.
    expect(statut.body.progress.phase).toBe('photos');
    expect(statut.body.progress.done).toBe(3);
    expect(statut.body.progress.total).toBe(12);
  });

  it('previent par email quand le PDF est pret', async () => {
    const emails = require('../services/email/transactionalEmails');
    emails.envoyerPdfPret.mockClear();

    const jobId = await lancerJob();
    await flushAsync();
    await flushAsync();
    await flushAsync();

    const statut = await lireStatut(jobId);
    expect(statut.body.status).toBe('ready');
    expect(emails.envoyerPdfPret).toHaveBeenCalledTimes(1);

    const argument = emails.envoyerPdfPret.mock.calls[0][0];
    // L'adresse du demandeur est retenue a la creation du job : sans elle,
    // un onglet ferme ne recevrait jamais rien.
    expect(argument.ownerEmail).toBe('organisateur@test.local');
    expect(argument.book.id).toBe(BOOK_ID);
  });

  it('un rendu qui n avance plus est declare echoue, pas laisse en cours', async () => {
    const jobId = await lancerJob();
    await flushAsync();

    // On simule une machine morte : le job n'a plus donne signe de vie
    // depuis longtemps. C'est le symptome signale (« bloque depuis 15
    // minutes ») : sans garde-fou, le client sonde un travail mort.
    const jobs = require('../routes/books').__pdfExportJobsForTests;
    const job = jobs.get(jobId);
    job.status = 'rendering';
    job.files = null;
    const vieux = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    job.createdAt = vieux;
    job.startedAt = vieux;
    job.progress = { phase: 'pages', done: 2, total: 40, updatedAt: vieux };
    jobs.set(jobId, job);

    const statut = await lireStatut(jobId);
    expect(statut.body.status).toBe('failed');
    expect(String(statut.body.error)).toMatch(/interrompue/i);
  });

  it('apres un enlisement, une relance repart sur un job NEUF', async () => {
    const jobId = await lancerJob();
    const jobs = require('../routes/books').__pdfExportJobsForTests;
    const job = jobs.get(jobId);
    job.status = 'rendering';
    const vieux = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    job.progress = { phase: 'pages', done: 2, total: 40, updatedAt: vieux };
    jobs.set(jobId, job);

    // Relance SANS forceRegenerate : c'est le chemin qui reutilisait le
    // job mort et laissait l'utilisateur tourner en rond.
    const relance = await request(app)
      .post(`/api/books/${BOOK_ID}/export-final-pdf`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(relance.status).toBe(202);
    expect(relance.body.jobId).not.toBe(jobId);
  });
});
