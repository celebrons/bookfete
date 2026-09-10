const {
  GELATO_PRODUCT_MAP,
  resolveGelatoProduct,
  isValidGelatoPageCount,
  clampToValidGelatoPageCount
} = require('../../services/printing/gelatoCatalog');

describe('gelatoCatalog', () => {
  it('a un mapping pour les 3 formats, avec un productUid non vide', () => {
    ['livret', 'standard', 'luxe'].forEach((formatId) => {
      const product = GELATO_PRODUCT_MAP[formatId];
      expect(product).toBeDefined();
      expect(typeof product.productUid).toBe('string');
      expect(product.productUid.length).toBeGreaterThan(0);
    });
  });

  it('livret et standard sont en couverture souple, luxe en rigide', () => {
    expect(GELATO_PRODUCT_MAP.livret.coverType).toBe('soft');
    expect(GELATO_PRODUCT_MAP.standard.coverType).toBe('soft');
    expect(GELATO_PRODUCT_MAP.luxe.coverType).toBe('hard');
  });

  it('standard et luxe partagent le meme gabarit (21x28cm), seule la couverture differe', () => {
    expect(GELATO_PRODUCT_MAP.standard.trimWidthMm).toBe(GELATO_PRODUCT_MAP.luxe.trimWidthMm);
    expect(GELATO_PRODUCT_MAP.standard.trimHeightMm).toBe(GELATO_PRODUCT_MAP.luxe.trimHeightMm);
    expect(GELATO_PRODUCT_MAP.standard.catalogUid).not.toBe(GELATO_PRODUCT_MAP.luxe.catalogUid);
  });

  it('resolveGelatoProduct retombe sur standard pour un format inconnu', () => {
    expect(resolveGelatoProduct('n-importe-quoi')).toBe(GELATO_PRODUCT_MAP.standard);
    expect(resolveGelatoProduct(undefined)).toBe(GELATO_PRODUCT_MAP.standard);
  });

  describe('isValidGelatoPageCount', () => {
    it('accepte les bornes exactes et les paliers pairs entre les deux', () => {
      expect(isValidGelatoPageCount(28, 'standard')).toBe(true);
      expect(isValidGelatoPageCount(200, 'standard')).toBe(true);
      expect(isValidGelatoPageCount(64, 'standard')).toBe(true);
    });

    it('refuse en dessous du minimum, au dessus du maximum, et les nombres impairs', () => {
      expect(isValidGelatoPageCount(16, 'standard')).toBe(false);
      expect(isValidGelatoPageCount(202, 'standard')).toBe(false);
      expect(isValidGelatoPageCount(29, 'standard')).toBe(false);
    });
  });

  describe('clampToValidGelatoPageCount', () => {
    it('remonte au plancher (28) toute valeur trop basse, sans jamais descendre en dessous', () => {
      expect(clampToValidGelatoPageCount(16, 'standard')).toBe(28);
      expect(clampToValidGelatoPageCount(0, 'standard')).toBe(28);
    });

    it('plafonne au maximum (200)', () => {
      expect(clampToValidGelatoPageCount(9999, 'standard')).toBe(200);
    });

    it('arrondit toujours vers le haut au palier pair suivant, jamais vers le bas (pas de perte de contenu)', () => {
      expect(clampToValidGelatoPageCount(29, 'standard')).toBe(30);
      expect(clampToValidGelatoPageCount(45, 'standard')).toBe(46);
    });

    it('ne change rien pour une valeur deja valide', () => {
      expect(clampToValidGelatoPageCount(64, 'standard')).toBe(64);
    });
  });
});
