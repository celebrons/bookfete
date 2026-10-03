// Purge des comptes anonymes abandonnes (plan de mise en production,
// "purge des comptes anonymes abandonnes") — voir
// services/accounts/anonymousPurge.js pour le pourquoi.
//
// Le point le plus important a verifier n'est pas que la purge marche :
// c'est qu'elle REFUSE de toucher a un compte dont un livre a une
// commande, meme non finalise, meme anonyme — orders.book_id n'a aucune
// contrainte de cle etrangere, donc rien d'autre ne protege ce cas.

const MAINTENANT = new Date('2026-10-04T12:00:00Z').getTime();

jest.useFakeTimers().setSystemTime(MAINTENANT);

jest.mock('../../services/storageService', () => ({
  deleteBookFolder: jest.fn(async () => ({ success: true, removed: 0 }))
}));
jest.mock('../../services/events/eventLog', () => ({
  logEvent: jest.fn()
}));

jest.mock('../../config/supabase', () => {
  const { createSupabaseMock } = require('../helpers/supabaseMock');
  const mock = createSupabaseMock({
    books: [],
    orders: [],
    profiles: []
  });
  mock.auth.admin = {
    listUsers: jest.fn(async () => ({ data: { users: [] }, error: null })),
    deleteUser: jest.fn(async () => ({ error: null }))
  };
  global.__purgeSupabaseMock = mock;
  return mock;
});

const storageService = require('../../services/storageService');
const { logEvent } = require('../../services/events/eventLog');
const { listAbandonedAnonymousAccounts, purgeAbandonedAnonymousAccounts } = require('../../services/accounts/anonymousPurge');

const joursAvant = (jours) => new Date(MAINTENANT - jours * 24 * 60 * 60 * 1000).toISOString();

function definirUtilisateurs(utilisateurs) {
  global.__purgeSupabaseMock.auth.admin.listUsers.mockImplementation(async ({ page }) => (
    page === 1 ? { data: { users: utilisateurs }, error: null } : { data: { users: [] }, error: null }
  ));
}

beforeEach(() => {
  jest.clearAllMocks();
  global.__purgeSupabaseMock.__table('books').length = 0;
  global.__purgeSupabaseMock.__table('orders').length = 0;
  global.__purgeSupabaseMock.__table('profiles').length = 0;
  storageService.deleteBookFolder.mockResolvedValue({ success: true, removed: 0 });
});

describe('listAbandonedAnonymousAccounts', () => {
  it('ne retient que les comptes anonymes crees il y a plus de X jours', async () => {
    definirUtilisateurs([
      { id: 'u-vieux', is_anonymous: true, created_at: joursAvant(10) },
      { id: 'u-recent', is_anonymous: true, created_at: joursAvant(2) },
      { id: 'u-pas-anonyme', is_anonymous: false, created_at: joursAvant(10) }
    ]);

    const candidats = await listAbandonedAnonymousAccounts({ jours: 7 });

    expect(candidats.map((c) => c.userId)).toEqual(['u-vieux']);
  });

  it('exclut explicitement (mais SIGNALE) un compte dont un livre a une commande', async () => {
    definirUtilisateurs([{ id: 'u-avec-commande', is_anonymous: true, created_at: joursAvant(30) }]);
    global.__purgeSupabaseMock.__table('books').push({ id: 'b1', owner_id: 'u-avec-commande', title: 'X' });
    global.__purgeSupabaseMock.__table('orders').push({ book_id: 'b1' });

    const candidats = await listAbandonedAnonymousAccounts({ jours: 7 });

    expect(candidats).toHaveLength(1);
    expect(candidats[0].excluPourCommande).toBe(true);
  });
});

describe('purgeAbandonedAnonymousAccounts', () => {
  it('supprime les photos, le livre, le profil puis le compte — dans cet ordre', async () => {
    definirUtilisateurs([{ id: 'u-abandon', is_anonymous: true, created_at: joursAvant(30) }]);
    global.__purgeSupabaseMock.__table('books').push({ id: 'b1', owner_id: 'u-abandon', title: 'Brouillon' });
    global.__purgeSupabaseMock.__table('profiles').push({ id: 'u-abandon', email: null });

    const resultat = await purgeAbandonedAnonymousAccounts({ jours: 7, actorEmail: 'patron@bookipix.test' });

    expect(resultat).toEqual({ removed: 1, userIds: ['u-abandon'] });
    expect(storageService.deleteBookFolder).toHaveBeenCalledWith('contribution-photos', 'b1');
    expect(global.__purgeSupabaseMock.__table('books')).toHaveLength(0);
    expect(global.__purgeSupabaseMock.__table('profiles')).toHaveLength(0);
    expect(global.__purgeSupabaseMock.auth.admin.deleteUser).toHaveBeenCalledWith('u-abandon');
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'admin.anonymous_accounts.purged',
      actor: 'patron@bookipix.test'
    }));
  });

  it('NE SUPPRIME JAMAIS un compte dont un livre a une commande, meme abandonne depuis longtemps', async () => {
    definirUtilisateurs([{ id: 'u-proteger', is_anonymous: true, created_at: joursAvant(90) }]);
    global.__purgeSupabaseMock.__table('books').push({ id: 'b1', owner_id: 'u-proteger', title: 'A proteger' });
    global.__purgeSupabaseMock.__table('orders').push({ book_id: 'b1' });

    const resultat = await purgeAbandonedAnonymousAccounts({ jours: 7 });

    expect(resultat).toEqual({ removed: 0, userIds: [] });
    expect(storageService.deleteBookFolder).not.toHaveBeenCalled();
    expect(global.__purgeSupabaseMock.__table('books')).toHaveLength(1);
    expect(global.__purgeSupabaseMock.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('un compte sans aucun livre se supprime quand meme (profil + compte)', async () => {
    definirUtilisateurs([{ id: 'u-vide', is_anonymous: true, created_at: joursAvant(30) }]);

    const resultat = await purgeAbandonedAnonymousAccounts({ jours: 7 });

    expect(resultat).toEqual({ removed: 1, userIds: ['u-vide'] });
    expect(global.__purgeSupabaseMock.auth.admin.deleteUser).toHaveBeenCalledWith('u-vide');
  });
});
