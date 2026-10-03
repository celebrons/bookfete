// Mode global test/production : lecture en memoire (synchrone, pour le code
// chaud) + ecriture en base avec garde-fou (pas de passage en production
// sans les cles live configurees) + journalisation.

jest.mock('../../config/supabase', () => {
  const table = {
    select: jest.fn(function select() { return this; }),
    eq: jest.fn(function eq() { return this; }),
    single: jest.fn(async () => ({ data: { mode: 'test' }, error: null })),
    upsert: jest.fn(async () => ({ data: null, error: null }))
  };
  return { from: jest.fn(() => table), __table: table };
});

jest.mock('../../services/events/eventLog', () => ({
  logEvent: jest.fn()
}));

const supabase = require('../../config/supabase');
const { logEvent } = require('../../services/events/eventLog');

describe('services/settings/appMode', () => {
  let appMode;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Repris apres resetModules : jest.mock() ci-dessus reste actif par
    // module-id, mais il faut re-requerir pour obtenir une instance fraiche
    // du cache en memoire (cachedMode est un etat de module).
    jest.doMock('../../config/supabase', () => supabase);
    jest.doMock('../../services/events/eventLog', () => ({ logEvent }));
    appMode = require('../../services/settings/appMode');
    delete process.env.STRIPE_SECRET_KEY_LIVE;
    delete process.env.STRIPE_WEBHOOK_SECRET_LIVE;
    delete process.env.GELATO_API_KEY;
  });

  describe('getAppModeSync / getAppMode', () => {
    it('demarre sur "test" avant tout rafraichissement', () => {
      expect(appMode.getAppModeSync()).toBe('test');
    });

    it('getAppMode() lit la base et met a jour le cache synchrone', async () => {
      supabase.__table.single.mockResolvedValueOnce({ data: { mode: 'production' }, error: null });
      expect(await appMode.getAppMode()).toBe('production');
      expect(appMode.getAppModeSync()).toBe('production');
    });

    it('repli sur "test" si la table est absente (erreur Supabase)', async () => {
      supabase.__table.single.mockResolvedValueOnce({ data: null, error: new Error('relation does not exist') });
      expect(await appMode.getAppMode()).toBe('test');
    });

    it('repli sur "test" pour une valeur en base ni test ni production', async () => {
      supabase.__table.single.mockResolvedValueOnce({ data: { mode: 'autre-chose' }, error: null });
      expect(await appMode.getAppMode()).toBe('test');
    });
  });

  describe('missingLiveRequirements', () => {
    it('liste les trois exigences quand rien n est configure', () => {
      expect(appMode.missingLiveRequirements()).toHaveLength(3);
    });

    it('ne reste vide que les trois correctement configurees', () => {
      process.env.STRIPE_SECRET_KEY_LIVE = 'sk_live_abc';
      process.env.STRIPE_WEBHOOK_SECRET_LIVE = 'whsec_abc';
      process.env.GELATO_API_KEY = 'une-cle';
      expect(appMode.missingLiveRequirements()).toEqual([]);
    });

    it('signale une cle Stripe live de forme suspecte (ne commence pas par sk_live_)', () => {
      process.env.STRIPE_SECRET_KEY_LIVE = 'sk_test_oups';
      process.env.STRIPE_WEBHOOK_SECRET_LIVE = 'whsec_abc';
      process.env.GELATO_API_KEY = 'une-cle';
      expect(appMode.missingLiveRequirements()).toEqual(
        expect.arrayContaining([expect.stringContaining('Stripe live')])
      );
    });
  });

  describe('setAppMode', () => {
    it('refuse un mode invalide', async () => {
      await expect(appMode.setAppMode('yolo', 'a@b.fr')).rejects.toThrow(/Mode invalide/);
      expect(supabase.__table.upsert).not.toHaveBeenCalled();
    });

    it('bascule vers "test" sans aucune exigence (toujours permis)', async () => {
      await appMode.setAppMode('test', 'admin@bookipix.com');
      expect(supabase.__table.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'global', mode: 'test', updated_by: 'admin@bookipix.com' }),
        expect.objectContaining({ onConflict: 'id' })
      );
      expect(appMode.getAppModeSync()).toBe('test');
      expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'app.mode.test_restored', level: 'info', actor: 'admin@bookipix.com'
      }));
    });

    it('refuse de basculer en production si des cles live manquent, sans ecrire en base', async () => {
      await expect(appMode.setAppMode('production', 'admin@bookipix.com')).rejects.toMatchObject({
        status: 400,
        missing: expect.arrayContaining([expect.stringContaining('Stripe'), expect.stringContaining('Gelato')])
      });
      expect(supabase.__table.upsert).not.toHaveBeenCalled();
      expect(appMode.getAppModeSync()).toBe('test');
    });

    it('bascule en production quand tout est configure, et journalise en "warn"', async () => {
      process.env.STRIPE_SECRET_KEY_LIVE = 'sk_live_abc';
      process.env.STRIPE_WEBHOOK_SECRET_LIVE = 'whsec_abc';
      process.env.GELATO_API_KEY = 'une-cle';

      await appMode.setAppMode('production', 'admin@bookipix.com');

      expect(supabase.__table.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'global', mode: 'production', updated_by: 'admin@bookipix.com' }),
        expect.objectContaining({ onConflict: 'id' })
      );
      expect(appMode.getAppModeSync()).toBe('production');
      expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'app.mode.production_activated', level: 'warn', actor: 'admin@bookipix.com'
      }));
    });

    it('le cache est mis a jour immediatement, sans attendre le prochain rafraichissement', async () => {
      process.env.STRIPE_SECRET_KEY_LIVE = 'sk_live_abc';
      process.env.STRIPE_WEBHOOK_SECRET_LIVE = 'whsec_abc';
      process.env.GELATO_API_KEY = 'une-cle';
      // La base dit toujours 'test' dans ce mock (single() non reconfigure) :
      // si le cache n'etait mis a jour qu'au prochain refresh, ce test le
      // verrait encore a 'test' juste apres l'appel.
      await appMode.setAppMode('production', 'admin@bookipix.com');
      expect(appMode.getAppModeSync()).toBe('production');
    });
  });
});
