// Un PDF deja fabrique doit survivre a un redemarrage du serveur.
//
// Le 2026-09-19 : PDF pret a 12:06:02, service redemarre a 12:09:01 pour un
// deploiement, et le bouton « telecharger » ne faisait plus rien. Les jobs
// d'export vivent en memoire — le redemarrage les avait tous effaces, alors
// que le fichier etait toujours sur le disque. Cliquer relancait une
// fabrication de deux minutes au lieu de servir le fichier existant.
//
// Un deploiement, un plantage ou la veille automatique suffisent a
// reproduire ca. Ces tests gardent la seule chose qui compte : le fichier
// est retrouve, et il n'est retrouve que pour son proprietaire.

const os = require('os');
const path = require('path');
const fs = require('fs');

const BOOK_ID = 'livre-pdf-disque';
const AUTRE_LIVRE = 'livre-d-un-autre';
const OWNER_ID = 'owner-test-1';
const JOB_ID = 'job1234567890abcdef';

// Un dossier a nous, vide : on ne veut pas fouiller le vrai tmp du projet.
const mockDossier = fs.mkdtempSync(path.join(os.tmpdir(), 'celebrons-pdf-'));

jest.mock('../services/composition/pdfService', () => ({
  PDF_PREVIEW_DIR: mockDossier,
  resolveBrowserPath: jest.fn(async () => '/faux/chrome'),
  renderPdfByPrinting: jest.fn(async () => '/faux/rendu.pdf'),
  renderPdfFromPages: jest.fn(async () => '/faux/rendu.pdf'),
  renderPdfFromHtml: jest.fn(async () => '/faux/rendu.pdf'),
  capturePagesAsImages: jest.fn(async () => []),
  nombreDeRendusEnFile: jest.fn(() => 0),
  SCREENSHOT_SCALE: 2
}));

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        { id: BOOK_ID, owner_id: OWNER_ID, title: 'Portugal 2025', page_count: 30, print_format: 'standard' },
        { id: AUTRE_LIVRE, owner_id: 'quelqu-un-d-autre', title: 'Pas a vous', page_count: 30, print_format: 'standard' }
      ],
      orders: [{
        id: 'commande-1',
        owner_id: OWNER_ID,
        book_id: BOOK_ID,
        order_number: 'CMD-PDF-1',
        status: 'print_queued',
        type: 'pack',
        metadata: { pdfJobId: JOB_ID, pdfCompletedAt: new Date().toISOString() }
      }]
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

describe('Un PDF fabrique avant un redemarrage reste telechargeable', () => {
  let app;
  let fichier;

  beforeAll(() => {
    // Le nom porte l'identifiant du job : c'est ce qui permet de rattacher le
    // fichier a la demande, sans registre ni table.
    fichier = path.join(mockDossier, `portugal-2025-${JOB_ID}-livre-final-1789819534860.pdf`);
    fs.writeFileSync(fichier, '%PDF-1.4\n% faux PDF de test\n%%EOF\n');

    const booksRoutes = require('../routes/books');
    app = express();
    app.use(express.json());
    app.use('/api/books', booksRoutes);
  });

  afterAll(() => {
    try { fs.rmSync(mockDossier, { recursive: true, force: true }); } catch (_e) { /* deja parti */ }
  });

  const telecharger = (bookId, jobId) => request(app)
    .get(`/api/books/${bookId}/export-final-pdf/${jobId}/download/final`)
    .set('Authorization', 'Bearer valid-token');

  it('sert le fichier au lieu de relancer une fabrication', async () => {
    const reponse = await telecharger(BOOK_ID, JOB_ID);

    expect(reponse.status).toBe(200);
    expect(reponse.headers['content-type']).toMatch(/application\/pdf/);
    // Le nom rendu au client est lisible : pas d'identifiant technique.
    expect(reponse.headers['content-disposition']).toContain('portugal-2025-livre-final.pdf');
    expect(reponse.headers['content-disposition']).not.toContain(JOB_ID);
  });

  it('ne relance surtout pas un rendu pour ca', async () => {
    const pdfService = require('../services/composition/pdfService');
    pdfService.renderPdfByPrinting.mockClear();

    await telecharger(BOOK_ID, JOB_ID);

    expect(pdfService.renderPdfByPrinting).not.toHaveBeenCalled();
  });

  it('ne sert rien pour le livre de quelqu un d autre', async () => {
    const reponse = await telecharger(AUTRE_LIVRE, JOB_ID);
    expect(reponse.status).toBe(404);
  });

  it('retombe sur le PDF de SA commande si l identifiant a vieilli', async () => {
    // Un onglet garde parfois un identifiant perime. La commande, elle, sait
    // lequel est le bon : on sert le PDF du client plutot que de lui opposer
    // une erreur qu il ne peut pas comprendre.
    const reponse = await telecharger(BOOK_ID, 'jobquinexistepas000');

    expect(reponse.status).toBe(200);
    expect(reponse.headers['content-disposition']).toContain('portugal-2025-livre-final.pdf');
  });

  it('ne sert jamais le PDF d un autre proprietaire', async () => {
    // Le seul refus qui compte vraiment. La recherche sur disque se fait
    // APRES verification de la propriete du livre — jamais avant.
    const reponse = await telecharger(AUTRE_LIVRE, 'jobquinexistepas000');
    expect(reponse.status).toBe(404);
  });
});
