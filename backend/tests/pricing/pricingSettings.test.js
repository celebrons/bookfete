// Tarifs des livres, modifiables depuis l'espace admin (2026-10-07) : meme
// schema qu'appMode.test.js — lecture en memoire synchrone (code chaud,
// calculateBookPrice tourne sur chaque commande) + ecriture en base avec
// validation + journalisation.

jest.mock('../../config/supabase', () => {
  const table = {
    select: jest.fn(function select() { return this; }),
    eq: jest.fn(function eq() { return this; }),
    single: jest.fn(async () => ({ data: null, error: new Error('relation does not exist') })),
    upsert: jest.fn(async () => ({ data: null, error: null }))
  };
  return { from: jest.fn(() => table), __table: table };
});

jest.mock('../../services/events/eventLog', () => ({
  logEvent: jest.fn()
}));

const supabase = require('../../config/supabase');
const { logEvent } = require('../../services/events/eventLog');

describe('services/pricing/pricingSettings', () => {
  let pricingSettings;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.doMock('../../config/supabase', () => supabase);
    jest.doMock('../../services/events/eventLog', () => ({ logEvent }));
    pricingSettings = require('../../services/pricing/pricingSettings');
  });

  describe('getPricingConfigSync / getPdfPriceCentsSync / getPackDiscountPercentSync', () => {
    it('demarre sur les tarifs par defaut (ceux de pricingConfig.js) avant tout rafraichissement', () => {
      const config = pricingSettings.getPricingConfigSync();
      expect(config.livret.basePriceCents).toBe(2990);
      expect(config.standard.basePriceCents).toBe(3990);
      expect(config.luxe.basePriceCents).toBe(4990);
      expect(pricingSettings.getPdfPriceCentsSync()).toBe(799);
      expect(pricingSettings.getPackDiscountPercentSync()).toBe(10);
    });

    it('basePages et les couts Gelato restent ceux de pricingConfig.js, jamais ecrases', () => {
      const config = pricingSettings.getPricingConfigSync();
      expect(config.standard.basePages).toBe(30);
      expect(config.standard.gelatoCostCents).toBe(1196);
    });

    it('getPricingSettings() lit la base et met a jour le cache synchrone', async () => {
      supabase.__table.single.mockResolvedValueOnce({
        data: { config: { formats: { standard: { basePriceCents: 4200, pricePer2PagesCents: 230 } }, pdfPriceCents: 850, packDiscountPercent: 15 } },
        error: null
      });
      await pricingSettings.getPricingSettings();
      expect(pricingSettings.getPricingConfigSync().standard.basePriceCents).toBe(4200);
      expect(pricingSettings.getPdfPriceCentsSync()).toBe(850);
      expect(pricingSettings.getPackDiscountPercentSync()).toBe(15);
    });

    it('repli sur les defauts si la table est absente (erreur Supabase)', async () => {
      supabase.__table.single.mockResolvedValueOnce({ data: null, error: new Error('relation does not exist') });
      await pricingSettings.getPricingSettings();
      expect(pricingSettings.getPdfPriceCentsSync()).toBe(799);
    });

    it('un format manquant en base retombe sur son propre defaut, jamais sur une valeur inventee', async () => {
      supabase.__table.single.mockResolvedValueOnce({
        data: { config: { formats: { standard: { basePriceCents: 4200, pricePer2PagesCents: 230 } }, pdfPriceCents: 799, packDiscountPercent: 10 } },
        error: null
      });
      await pricingSettings.getPricingSettings();
      const config = pricingSettings.getPricingConfigSync();
      expect(config.livret.basePriceCents).toBe(2990); // inchange, absent de la base
      expect(config.standard.basePriceCents).toBe(4200); // repris de la base
    });

    it('une valeur negative ou non entiere en base retombe sur le defaut plutot que de corrompre le prix', async () => {
      supabase.__table.single.mockResolvedValueOnce({
        data: { config: { formats: { standard: { basePriceCents: -500, pricePer2PagesCents: 12.5 } }, pdfPriceCents: 799, packDiscountPercent: 10 } },
        error: null
      });
      await pricingSettings.getPricingSettings();
      const config = pricingSettings.getPricingConfigSync();
      expect(config.standard.basePriceCents).toBe(3990);
      expect(config.standard.pricePer2PagesCents).toBe(220);
    });

    it('une remise au-dela de 100% est ramenee a 100, jamais refusee', async () => {
      supabase.__table.single.mockResolvedValueOnce({
        data: { config: { formats: {}, pdfPriceCents: 799, packDiscountPercent: 250 } },
        error: null
      });
      await pricingSettings.getPricingSettings();
      expect(pricingSettings.getPackDiscountPercentSync()).toBe(100);
    });
  });

  describe('setPricingSettings', () => {
    it('ecrit en base, met a jour le cache immediatement, et journalise', async () => {
      const config = await pricingSettings.setPricingSettings({
        formats: { livret: { basePriceCents: 3100, pricePer2PagesCents: 195 } },
        pdfPriceCents: 820,
        packDiscountPercent: 12
      }, 'admin@bookipix.com');

      expect(supabase.__table.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'global', updated_by: 'admin@bookipix.com' }),
        expect.objectContaining({ onConflict: 'id' })
      );
      // Le cache est deja a jour, sans attendre le prochain rafraichissement.
      expect(pricingSettings.getPricingConfigSync().livret.basePriceCents).toBe(3100);
      expect(pricingSettings.getPdfPriceCentsSync()).toBe(820);
      expect(config.pdfPriceCents).toBe(820);
      expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'pricing.updated', level: 'warn', actor: 'admin@bookipix.com'
      }));
    });

    it('un format absent de la mise a jour garde sa valeur actuelle, jamais remise au defaut', async () => {
      await pricingSettings.setPricingSettings({
        formats: { standard: { basePriceCents: 4500, pricePer2PagesCents: 240 } },
        pdfPriceCents: 799,
        packDiscountPercent: 10
      }, 'admin@bookipix.com');
      expect(pricingSettings.getPricingConfigSync().standard.basePriceCents).toBe(4500);

      // Deuxieme appel ne touchant que "livret" : "standard" doit rester a 4500.
      await pricingSettings.setPricingSettings({
        formats: { livret: { basePriceCents: 3000, pricePer2PagesCents: 190 } },
        pdfPriceCents: 799,
        packDiscountPercent: 10
      }, 'admin@bookipix.com');
      expect(pricingSettings.getPricingConfigSync().standard.basePriceCents).toBe(4500);
      expect(pricingSettings.getPricingConfigSync().livret.basePriceCents).toBe(3000);
    });

    it('propage une erreur d ecriture plutot que de la masquer (un prix doit etre fiable)', async () => {
      supabase.__table.upsert.mockResolvedValueOnce({ data: null, error: new Error('base injoignable') });
      await expect(pricingSettings.setPricingSettings({}, 'admin@bookipix.com')).rejects.toThrow('base injoignable');
    });
  });
});
