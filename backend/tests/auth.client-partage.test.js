// Le client partage du backend ne doit JAMAIS porter de session.
//
// Defaut vecu le 2026-09-21 : « new row violates row-level security policy
// for table books » a la creation d'un livre, alors que le meme code
// marchait la veille.
//
// `authController.login` appelait `signInWithPassword` sur le client PARTAGE
// du backend. supabase-js retient alors cette session sur le client et
// envoie, pour TOUTES les requetes suivantes, le jeton de cette personne.
// Le serveur cessait d'agir au nom du service et agissait au nom du dernier
// connecte — donc soumis a RLS, et incapable de creer un livre pour
// quelqu'un d'autre, jusqu'au redemarrage.
//
// Le defaut existait depuis toujours. Il etait INVISIBLE tant que `books`
// n'avait aucune politique : c'est l'activation de RLS (phase22) qui l'a
// revele, des semaines plus tard, sous la forme d'un message qui ne
// designait pas sa cause.
//
// Ces tests verrouillent les deux moities du correctif.

describe('config/supabase — le client partage', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SUPABASE_URL = 'https://exemple.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_pour_les_tests';
  });

  it('est construit en refusant toute persistance de session', () => {
    let optionsVues = null;
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: (_url, _cle, options) => {
        optionsVues = options;
        return { marqueur: 'client-partage' };
      }
    }));

    require('../config/supabase');

    expect(optionsVues?.auth?.persistSession).toBe(false);
    expect(optionsVues?.auth?.autoRefreshToken).toBe(false);
  });
});

describe('controllers/authController — les operations de connexion', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SUPABASE_URL = 'https://exemple.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_pour_les_tests';
  });

  // LE TEST QUI COMPTE : la connexion ne doit pas toucher au client partage.
  it('ouvrent une session sur un client A PART, jamais sur le client partage', async () => {
    const clientPartage = {
      auth: {
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn()
      },
      from: jest.fn(() => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) })
      }))
    };

    const clientsCrees = [];
    jest.doMock('../config/supabase', () => clientPartage);
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => {
        const client = {
          auth: {
            signInWithPassword: jest.fn(async () => ({
              data: { user: { id: 'u1', email: 'a@b.fr' }, session: { access_token: 'jeton' } },
              error: null
            })),
            signUp: jest.fn(),
            signOut: jest.fn(async () => ({ error: null }))
          }
        };
        clientsCrees.push(client);
        return client;
      }
    }));

    const authController = require('../controllers/authController');
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json() { return this; }
    };

    await authController.login({ body: { email: 'a@b.fr', password: 'secret' } }, res);

    // Le client partage n'a pas ete touche.
    expect(clientPartage.auth.signInWithPassword).not.toHaveBeenCalled();
    // Un client jetable, lui, a bien servi.
    expect(clientsCrees.length).toBeGreaterThan(0);
    expect(clientsCrees[0].auth.signInWithPassword).toHaveBeenCalled();
  });
});
