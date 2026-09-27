// Regression : computeOrderPricing doit se baser sur book.page_count (la
// vraie valeur, obligatoire pour composer le livre — voir
// routes/composition.js) et non sur book.pages (colonne heritee de l'ancien
// flux IA, jamais mise a jour par le moteur de composition actuel). Avant
// ce correctif, le prix facture n'avait aucun rapport avec le livre reel.
//
// Couvre aussi la grille tarifaire centrale (services/pricing/pricingConfig.js
// — chantier "tarification dynamique", 2026-09-27) — remplace l'ancienne
// FORMAT_PRICING ad hoc (base + prix/page + plancher arbitraire) qui ne
// correspondait pas a la grille commerciale reelle (base a 30 pages + palier
// tous les 2 pages).

jest.mock('../config/supabase', () => {
  const { createSupabaseMock } = require('./helpers/supabaseMock');
  return createSupabaseMock({});
});

const { computeOrderPricing } = require('../routes/orders');

describe('routes/orders.computeOrderPricing', () => {
  it('type "print" : suit book.page_count (grille standard, 30 pages de base)', () => {
    const pricing = computeOrderPricing({ book: { page_count: 34 }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(4430); // 3990 + (4/2)*220
    expect(pricing.breakdown.pages).toBe(34);
    expect(pricing.breakdown.printFormat).toBe('standard');
  });

  it('plancher produit : un nombre de pages sous 30 est ramene a 30 (jamais un prix plus bas que le plancher produit)', () => {
    const pricing = computeOrderPricing({ book: { page_count: 8 }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(3990); // meme prix qu'a 30 pages, jamais moins
  });

  it('ignore totalement book.pages (colonne heritee, deconnectee) meme si elle est presente', () => {
    // page_count (reel) = 34 -> 4430 ; pages (heritee, ne devrait jamais etre lue) = 96 -> aurait donne un tout autre prix.
    const pricing = computeOrderPricing({ book: { page_count: 34, pages: 96 }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(4430);
  });

  it('book.page_count absent -> repli sur 64 pages (comportement inchange)', () => {
    const pricing = computeOrderPricing({ book: {}, type: 'print', quantity: 1 });
    expect(pricing.breakdown.pages).toBe(64);
    expect(pricing.unitCents).toBe(7730); // standard, 64 pages
  });

  it('type "pdf" : prix fixe (7,99€), independant du nombre de pages, sans livraison', () => {
    const pricing = computeOrderPricing({ book: { page_count: 200 }, type: 'pdf', quantity: 1 });
    expect(pricing.unitCents).toBe(799);
    expect(pricing.shippingCents).toBe(0);
    expect(pricing.totalCents).toBe(799);
  });

  it('type "pack" : prix impression + 20 EUR, livraison incluse au total', () => {
    const pricing = computeOrderPricing({ book: { page_count: 34 }, type: 'pack', quantity: 1 });
    expect(pricing.unitCents).toBe(4430 + 2000);
    expect(pricing.shippingCents).toBe(500);
    expect(pricing.totalCents).toBe(4430 + 2000 + 500);
  });

  it('multiplie unitCents par la quantite, mais PAS la livraison (un forfait par commande)', () => {
    const pricing = computeOrderPricing({ book: { page_count: 34 }, type: 'print', quantity: 3 });
    expect(pricing.shippingCents).toBe(500);
    expect(pricing.totalCents).toBe((4430 * 3) + 500);
  });
});

describe('routes/orders.computeOrderPricing — grille par format (18 valeurs du cahier des charges)', () => {
  const cas = [
    ['livret', 30, 2990], ['livret', 32, 3180], ['livret', 34, 3370],
    ['livret', 40, 3940], ['livret', 48, 4700], ['livret', 64, 6220],
    ['standard', 30, 3990], ['standard', 32, 4210], ['standard', 34, 4430],
    ['standard', 40, 5090], ['standard', 48, 5970], ['standard', 64, 7730],
    ['luxe', 30, 4990], ['luxe', 32, 5280], ['luxe', 34, 5570],
    ['luxe', 40, 6440], ['luxe', 48, 7600], ['luxe', 64, 9920]
  ];

  it.each(cas)('%s a %i pages -> %i centimes', (format, pageCount, expectedCents) => {
    const pricing = computeOrderPricing({ book: { page_count: pageCount, print_format: format }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(expectedCents);
    expect(pricing.breakdown.printFormat).toBe(format);
  });

  it('print_format inconnu/corrompu retombe sur standard (jamais d\'erreur, jamais NaN)', () => {
    const pricing = computeOrderPricing({ book: { page_count: 34, print_format: 'CECI_NEXISTE_PAS' }, type: 'print', quantity: 1 });
    expect(pricing.breakdown.printFormat).toBe('standard');
    expect(pricing.unitCents).toBe(4430);
  });

  it('type "pdf" reste un prix fixe, quel que soit le format', () => {
    const livret = computeOrderPricing({ book: { page_count: 34, print_format: 'livret' }, type: 'pdf', quantity: 1 });
    const luxe = computeOrderPricing({ book: { page_count: 34, print_format: 'luxe' }, type: 'pdf', quantity: 1 });
    expect(livret.unitCents).toBe(799);
    expect(luxe.unitCents).toBe(799);
  });
});

describe('routes/orders.computeOrderPricing — livraison France par format (§20)', () => {
  it('livret : 5,00 €', () => {
    const pricing = computeOrderPricing({ book: { page_count: 30, print_format: 'livret' }, type: 'print', quantity: 1 });
    expect(pricing.shippingCents).toBe(500);
  });
  it('standard : 5,00 €', () => {
    const pricing = computeOrderPricing({ book: { page_count: 30, print_format: 'standard' }, type: 'print', quantity: 1 });
    expect(pricing.shippingCents).toBe(500);
  });
  it('luxe : 5,39 €', () => {
    const pricing = computeOrderPricing({ book: { page_count: 30, print_format: 'luxe' }, type: 'print', quantity: 1 });
    expect(pricing.shippingCents).toBe(539);
  });
});

describe('routes/orders.computeOrderPricing — ajout/retrait de pages (§7/§8)', () => {
  it('ajouter 2 pages augmente le prix exactement du palier du format', () => {
    const avant = computeOrderPricing({ book: { page_count: 32, print_format: 'standard' }, type: 'print', quantity: 1 });
    const apres = computeOrderPricing({ book: { page_count: 34, print_format: 'standard' }, type: 'print', quantity: 1 });
    expect(avant.unitCents).toBe(4210);
    expect(apres.unitCents).toBe(4430);
    expect(apres.unitCents - avant.unitCents).toBe(220);
  });

  it('retirer 2 pages diminue le prix exactement du palier du format', () => {
    const avant = computeOrderPricing({ book: { page_count: 34, print_format: 'standard' }, type: 'print', quantity: 1 });
    const apres = computeOrderPricing({ book: { page_count: 32, print_format: 'standard' }, type: 'print', quantity: 1 });
    expect(avant.unitCents - apres.unitCents).toBe(220);
  });
});

describe('routes/orders.computeOrderPricing — changement de format (§9)', () => {
  it('Standard -> Luxe, meme pagination : seul le prix change', () => {
    const standard = computeOrderPricing({ book: { page_count: 34, print_format: 'standard' }, type: 'print', quantity: 1 });
    const luxe = computeOrderPricing({ book: { page_count: 34, print_format: 'luxe' }, type: 'print', quantity: 1 });
    expect(standard.breakdown.pages).toBe(34);
    expect(luxe.breakdown.pages).toBe(34);
    expect(luxe.unitCents - standard.unitCents).toBe(5570 - 4430);
  });

  it('Luxe -> Livret, meme pagination : seul le prix change', () => {
    const luxe = computeOrderPricing({ book: { page_count: 34, print_format: 'luxe' }, type: 'print', quantity: 1 });
    const livret = computeOrderPricing({ book: { page_count: 34, print_format: 'livret' }, type: 'print', quantity: 1 });
    expect(luxe.breakdown.pages).toBe(34);
    expect(livret.breakdown.pages).toBe(34);
    expect(livret.unitCents).toBe(3370);
  });

  it('changement de format a 30 pages (plancher)', () => {
    const cas = ['livret', 'standard', 'luxe'].map((format) => computeOrderPricing({
      book: { page_count: 30, print_format: format }, type: 'print', quantity: 1
    }).unitCents);
    expect(cas).toEqual([2990, 3990, 4990]);
  });

  it('changement de format a 64 pages', () => {
    const cas = ['livret', 'standard', 'luxe'].map((format) => computeOrderPricing({
      book: { page_count: 64, print_format: format }, type: 'print', quantity: 1
    }).unitCents);
    expect(cas).toEqual([6220, 7730, 9920]);
  });
});

describe('routes/orders.computeOrderPricing — total livre + livraison (§3)', () => {
  it('exemple du cahier des charges : Standard 34 pages = 44,30€ + 5,00€ = 49,30€', () => {
    const pricing = computeOrderPricing({ book: { page_count: 34, print_format: 'standard' }, type: 'print', quantity: 1 });
    expect(pricing.unitCents).toBe(4430);
    expect(pricing.shippingCents).toBe(500);
    expect(pricing.totalCents).toBe(4930);
  });
});
