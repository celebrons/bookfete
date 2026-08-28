// CONTRAT DE ROUTAGE — filet de securite du refactoring de routes/books.js.
//
// Ce test fige l'ensemble exact des routes exposees par le router books.
// Le decoupage du monolithe en sous-modules doit laisser cette liste INTACTE.
// Toute route ajoutee/supprimee/renommee fait echouer le test : c'est voulu.

jest.mock('../config/supabase', () => require('./helpers/supabaseMock').createSupabaseMock({}));

const { routeSignatures, listRoutes } = require('./helpers/listRoutes');

const EXPECTED_ROUTES = [
  'DELETE /:id',
  'GET /',
  'GET /:id',
  'GET /:id/export-final-pdf/:jobId/download/:kind',
  'GET /:id/export-final-pdf/:jobId/status',
  'GET /:id/prompt-admin/:promptKey',
  'POST /',
  'POST /:id/chapters/:chapterId/finalize-draft',
  'POST /:id/chapters/:chapterId/generate-draft',
  'POST /:id/chapters/:chapterId/save-draft',
  'POST /:id/export-final-pdf',
  'POST /:id/generate-draft',
  'POST /:id/prompt-admin/:promptKey/publish',
  'POST /:id/prompt-admin/:promptKey/test',
  'PUT /:id'
];

describe('routes/books — contrat de routage', () => {
  let router;

  beforeAll(() => {
    router = require('../routes/books');
  });

  it('expose exactement les memes routes qu avant refactoring', () => {
    expect(routeSignatures(router)).toEqual(EXPECTED_ROUTES);
  });

  it('protege toutes les routes par le middleware authenticate', () => {
    const unprotected = listRoutes(router).filter(
      (route) => !route.handlerNames.includes('authenticate')
    );
    expect(unprotected).toEqual([]);
  });

  it('reserve les routes prompt-admin au middleware ensurePromptAdmin', () => {
    const promptAdminRoutes = listRoutes(router).filter((route) =>
      route.path.includes('/prompt-admin')
    );
    expect(promptAdminRoutes).toHaveLength(3);
    promptAdminRoutes.forEach((route) => {
      expect(route.handlerNames).toContain('ensurePromptAdmin');
    });
  });
});
