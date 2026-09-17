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

// Pagination Gelato : ce qu'on DECLARE et ce que le FICHIER doit contenir.
//
// Etabli le 2026-09-17 sur un refus de commande — la seule source qui fasse
// foi ici. Avec pageCount = 30, Gelato repond :
//
//   « Product requires exactly 33 page(s), while file(s) contain 35 page(s) »
//
// Donc : fichier = pageCount + 3 (1 couverture enveloppante + pageCount + 2
// pages interieures). Les 2 gardes ne sont PAS comptees dans le declare.
//
// Le gabarit telechargeable induit en erreur : son champ « pages » designe le
// cahier interieur (32 pour 30 pages composees), pas le pageCount de l'API.
// Une premiere lecture de ce gabarit nous avait fait declarer 32 au lieu de
// 30 — ces tests existent pour que la confusion ne revienne pas.
describe('Pagination Gelato', () => {
  const {
    resolveGelatoPageCount,
    interiorPagesForGelato,
    totalFilePagesForGelato,
    GELATO_ENDPAPER_PAGES
  } = require('../../services/printing/gelatoCatalog');

  it('on declare le nombre de pages COMPOSEES, gardes non comprises', () => {
    expect(resolveGelatoPageCount(30, 'luxe')).toBe(30);
  });

  it('le cahier interieur ajoute les deux gardes', () => {
    expect(GELATO_ENDPAPER_PAGES).toBe(2);
    expect(interiorPagesForGelato(30)).toBe(32);
  });

  it('le cas reel du refus : 30 declarees -> 33 pages exigees dans le fichier', () => {
    expect(totalFilePagesForGelato(resolveGelatoPageCount(30, 'luxe'))).toBe(33);
  });

  it('le fichier fait toujours pageCount + 3', () => {
    [28, 30, 40, 64].forEach((declare) => {
      expect(totalFilePagesForGelato(declare)).toBe(declare + 3);
    });
  });

  it('respecte toujours le plancher et le pas du produit', () => {
    expect(resolveGelatoPageCount(0, 'standard')).toBe(28);
    expect(resolveGelatoPageCount(29, 'luxe')).toBe(30);
    expect(resolveGelatoPageCount(9999, 'standard')).toBe(200);
  });
});
