// Regression : computeOrderPricing doit se baser sur book.page_count (la
// vraie valeur, obligatoire pour composer le livre — voir
// routes/composition.js) et non sur book.pages (colonne heritee de l'ancien
// flux IA, jamais mise a jour par le moteur de composition actuel). Avant
// ce correctif, le prix facture n'avait aucun rapport avec le livre reel.
//
// Couvre aussi FORMAT_PRICING (grille par type d'album, books.print_format)
// — tous les tests ci-dessous qui ne fixent pas print_format exercent
// implicitement le repli sur 'standard' (comportement inchange).

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  return createSupabaseMock({});
});

const { computeOrderPricing } = require('../routes/orders');

describe('routes/orders.computeOrderPricing', () => {
  it('type "print" : suit book.page_count (49 EUR + 0.85 EUR/page)', () => {
    const pricing = computeOrderPricing({ book: { page_count: 24 }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(6940); // 4900 + 24*85
    expect(pricing.breakdown.pages).toBe(24);
  });

  it('type "print" : plancher a 69 EUR meme pour un tres petit nombre de pages', () => {
    const pricing = computeOrderPricing({ book: { page_count: 8 }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(6900);
  });

  it('ignore totalement book.pages (colonne heritee, deconnectee) meme si elle est presente', () => {
    // page_count (reel) = 24 -> 6940 ; pages (heritee, ne devrait jamais etre lue) = 96 -> aurait donne 12760.
    const pricing = computeOrderPricing({ book: { page_count: 24, pages: 96 }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(6940);
  });

  it('book.page_count absent -> repli sur 64 pages (comportement inchange)', () => {
    const pricing = computeOrderPricing({ book: {}, type: 'print', quantity: 1 });
    expect(pricing.breakdown.pages).toBe(64);
    expect(pricing.unitCents).toBe(10340); // 4900 + 64*85
  });

  it('type "pdf" : prix fixe, independant du nombre de pages', () => {
    const pricing = computeOrderPricing({ book: { page_count: 200 }, type: 'pdf', quantity: 1 });
    expect(pricing.unitCents).toBe(3900);
  });

  it('type "pack" : prix impression + 20 EUR', () => {
    const pricing = computeOrderPricing({ book: { page_count: 24 }, type: 'pack', quantity: 1 });
    expect(pricing.unitCents).toBe(6940 + 2000);
  });

  it('multiplie correctement par la quantite', () => {
    const pricing = computeOrderPricing({ book: { page_count: 24 }, type: 'print', quantity: 3 });
    expect(pricing.totalCents).toBe(6940 * 3);
  });
});

describe('routes/orders.computeOrderPricing — grille par type d\'album (FORMAT_PRICING)', () => {
  it('livret : moins cher, plancher a 49 EUR', () => {
    const pricing = computeOrderPricing({ book: { page_count: 24, print_format: 'livret' }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(4900); // 3400 + 24*60 = 4840, plancher 4900
    expect(pricing.breakdown.printFormat).toBe('livret');
  });

  it('livret : au-dessus du plancher pour un livre plus epais', () => {
    const pricing = computeOrderPricing({ book: { page_count: 64, print_format: 'livret' }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(7240); // 3400 + 64*60
  });

  it('luxe : plus cher, jamais confondu avec standard', () => {
    const pricing = computeOrderPricing({ book: { page_count: 24, print_format: 'luxe' }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(10020); // 6900 + 24*130
    expect(pricing.breakdown.printFormat).toBe('luxe');
  });

  it('standard explicite donne exactement le meme prix qu\'absent (repli identique au choix assume)', () => {
    const explicit = computeOrderPricing({ book: { page_count: 24, print_format: 'standard' }, type: 'print', quantity: 1 });
    const absent = computeOrderPricing({ book: { page_count: 24 }, type: 'print', quantity: 1 });
    expect(explicit.unitCents).toBe(absent.unitCents);
  });

  it('print_format inconnu/corrompu retombe sur standard (jamais d\'erreur, jamais NaN)', () => {
    const pricing = computeOrderPricing({ book: { page_count: 24, print_format: 'CECI_NEXISTE_PAS' }, type: 'print', quantity: 1 });
    expect(pricing.breakdown.printFormat).toBe('standard');
    expect(pricing.unitCents).toBe(6940);
  });

  it('type "pdf" reste un prix fixe, quel que soit le format', () => {
    const livret = computeOrderPricing({ book: { page_count: 24, print_format: 'livret' }, type: 'pdf', quantity: 1 });
    const luxe = computeOrderPricing({ book: { page_count: 24, print_format: 'luxe' }, type: 'pdf', quantity: 1 });
    expect(livret.unitCents).toBe(3900);
    expect(luxe.unitCents).toBe(3900);
  });
});
