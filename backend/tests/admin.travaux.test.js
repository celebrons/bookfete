// Voir et arreter les travaux longs depuis l'espace d'administration.
//
// Demande du 2026-09-19 : « voir toutes les demandes de generation de PDF ou
// a Gelato, leur statut (en cours, bloquee, echouee, reussie) et pouvoir les
// arreter / nettoyer ».
//
// C'est le premier endroit de cet espace qui AGIT au lieu de seulement lire.
// Ces tests gardent donc deux choses : que la lecture dit la verite, et que
// les actions restent fermees a qui n'a pas le droit d'entrer.

const OWNER_ID = 'owner-test-1';
const ADMIN = 'proprietaire@test.local';

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  const mock = createSupabaseMock(
    {
      books: [
        { id: 'livre-1', owner_id: OWNER_ID, title: 'Voyage à Montréal', page_count: 30, print_format: 'standard' }
      ],
      orders: []
    },
    { userId: OWNER_ID, userEmail: ADMIN }
  );
  global.__supabaseMock = mock;
  return mock;
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => global.__supabaseMock
}));

// Les deux sources de travaux. `mock` en prefixe : jest l'exige pour toute
// variable citee depuis une fabrique de mock.
const mockCancel = jest.fn(() => ({ arrete: true, navigateursTues: 1 }));
const mockPurge = jest.fn(() => ({ oubliees: 3 }));
const mockRelease = jest.fn(() => ({ relache: true }));

jest.mock('../routes/books', () => {
  const express = require('express');
  const routeur = express.Router();
  routeur.listPdfExportJobs = () => [];
  return Object.assign(routeur, {
    listPdfExportJobs: () => ([
      {
        genre: 'pdf',
        id: 'job-en-cours',
        bookId: 'livre-1',
        demandeur: 'client@test.local',
        etat: 'en cours',
        bloquee: false,
        arretable: true,
        creeLe: new Date().toISOString(),
        avancement: { phase: 'photos', done: 12, total: 54 }
      },
      {
        genre: 'pdf',
        id: 'job-bloque',
        bookId: 'livre-1',
        demandeur: 'client@test.local',
        etat: 'bloquee',
        bloquee: true,
        arretable: true,
        creeLe: new Date(Date.now() - 3600000).toISOString()
      },
      {
        genre: 'pdf',
        id: 'job-fini',
        bookId: 'livre-1',
        etat: 'reussie',
        bloquee: false,
        arretable: false,
        creeLe: new Date(Date.now() - 7200000).toISOString(),
        fichier: { nom: 'livre.pdf', mo: 31 }
      }
    ]),
    cancelPdfExportJob: mockCancel,
    purgePdfExportJobs: mockPurge,
    countActivePdfJobs: () => 1
  });
});

jest.mock('../routes/orders', () => {
  const express = require('express');
  const routeur = express.Router();
  return Object.assign(routeur, {
    listGelatoSubmissions: () => ([{
      genre: 'gelato',
      id: 'commande-9',
      orderId: 'commande-9',
      bookId: 'livre-1',
      demandeur: 'client@test.local',
      etat: 'bloquee',
      bloquee: true,
      arretable: true,
      creeLe: new Date(Date.now() - 5400000).toISOString()
    }]),
    releaseGelatoSubmission: mockRelease
  });
});

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/admin'));
  return app;
}

describe('Travaux en cours, vus de l administration', () => {
  let app;
  const environnementInitial = { ...process.env };

  beforeAll(() => {
    process.env.ADMIN_EMAILS = ADMIN;
    app = buildApp();
  });

  afterAll(() => {
    process.env = { ...environnementInitial };
  });

  beforeEach(() => {
    mockCancel.mockClear();
    mockPurge.mockClear();
    mockRelease.mockClear();
  });

  const commeAdmin = (chemin, methode = 'get') => request(app)[methode](chemin)
    .set('Authorization', 'Bearer valid-token');

  it('montre les fabrications ET les envois dans une seule liste', async () => {
    const reponse = await commeAdmin('/api/admin/jobs');

    expect(reponse.status).toBe(200);
    const genres = reponse.body.travaux.map((t) => t.genre);
    expect(genres).toContain('pdf');
    expect(genres).toContain('gelato');
  });

  it('donne le titre du livre, pas seulement son identifiant', async () => {
    const reponse = await commeAdmin('/api/admin/jobs');

    // Une liste d'identifiants ne sert a rien : c'est le titre qu'on cherche.
    const travail = reponse.body.travaux.find((t) => t.id === 'job-en-cours');
    expect(travail.livre).toBe('Voyage à Montréal');
  });

  it('compte separement ce qui est bloque', async () => {
    const reponse = await commeAdmin('/api/admin/jobs');

    // Deux bloquees : une fabrication enlisee et un verrou d'envoi oublie.
    expect(reponse.body.resume.bloquees).toBe(2);
    expect(reponse.body.resume.reussies).toBe(1);
  });

  it('arrete une fabrication', async () => {
    const reponse = await commeAdmin('/api/admin/jobs/pdf/job-en-cours/stop', 'post');

    expect(reponse.status).toBe(200);
    expect(reponse.body.arrete).toBe(true);
    expect(mockCancel).toHaveBeenCalledWith('job-en-cours');
  });

  it('refuse d arreter une fabrication deja terminee, sans mentir', async () => {
    mockCancel.mockReturnValueOnce({ arrete: false, raison: 'deja terminee' });

    const reponse = await commeAdmin('/api/admin/jobs/pdf/job-fini/stop', 'post');

    expect(reponse.status).toBe(409);
    expect(reponse.body.raison).toBe('deja terminee');
  });

  it('relache le verrou d un envoi a l imprimeur', async () => {
    const reponse = await commeAdmin('/api/admin/jobs/gelato/commande-9/stop', 'post');

    expect(reponse.status).toBe(200);
    expect(mockRelease).toHaveBeenCalledWith('commande-9');
  });

  it('nettoie les demandes terminees', async () => {
    const reponse = await commeAdmin('/api/admin/jobs/cleanup', 'post');

    expect(reponse.status).toBe(200);
    expect(reponse.body.oubliees).toBe(3);
  });

  it('reste ferme a qui n est pas administrateur', async () => {
    process.env.ADMIN_EMAILS = 'quelqu.un.dautre@test.local';
    delete process.env.ADMIN_ACCESS_CODE;

    // 404 et non 403 : on ne confirme pas l'existence de cet espace.
    expect((await commeAdmin('/api/admin/jobs')).status).toBe(404);
    expect((await commeAdmin('/api/admin/jobs/pdf/x/stop', 'post')).status).toBe(404);
    expect((await commeAdmin('/api/admin/jobs/cleanup', 'post')).status).toBe(404);
    // Et surtout : rien n'a ete execute.
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockPurge).not.toHaveBeenCalled();

    process.env.ADMIN_EMAILS = ADMIN;
  });
});
