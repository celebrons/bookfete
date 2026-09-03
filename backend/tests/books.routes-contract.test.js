// CONTRAT DE ROUTAGE — filet de securite du refactoring de routes/books.js.
//
// Ce test fige l'ensemble exact des routes exposees par le router books.
// Le decoupage du monolithe en sous-modules doit laisser cette liste INTACTE.
// Toute route ajoutee/supprimee/renommee fait echouer le test : c'est voulu.
//
// Mis a jour lors du retrait de la chaine IA (routes de generation de
// brouillon, prompt-admin) : seules les routes de CRUD livre et d'export
// PDF (non-IA, alimente par le contenu deja valide) restent.

jest.mock('../config/supabase', () => require('./helpers/supabaseMock').createSupabaseMock({}));

const { routeSignatures, listRoutes } = require('./helpers/listRoutes');

const EXPECTED_ROUTES = [
  'DELETE /:id',
  'GET /',
  'GET /:id',
  'GET /:id/export-final-pdf/:jobId/download/:kind',
  'GET /:id/export-final-pdf/:jobId/status',
  'POST /',
  'POST /:id/export-final-pdf',
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
});
