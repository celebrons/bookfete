// Tests unitaires du calculateur de prix central (chantier "tarification
// dynamique", 2026-09-27, §23) — la SEULE fonction qui doit connaitre la
// formule commerciale. Toute autre route/composant qui a besoin d'un prix
// doit l'appeler, jamais la recalculer.

const { calculateBookPrice } = require('../../services/pricing/calculateBookPrice');

describe('calculateBookPrice — 18 valeurs exactes du cahier des charges', () => {
  const cas = [
    ['livret', 30, 2990], ['livret', 32, 3180], ['livret', 34, 3370],
    ['livret', 40, 3940], ['livret', 48, 4700], ['livret', 64, 6220],
    ['standard', 30, 3990], ['standard', 32, 4210], ['standard', 34, 4430],
    ['standard', 40, 5090], ['standard', 48, 5970], ['standard', 64, 7730],
    ['luxe', 30, 4990], ['luxe', 32, 5280], ['luxe', 34, 5570],
    ['luxe', 40, 6440], ['luxe', 48, 7600], ['luxe', 64, 9920]
  ];

  it.each(cas)('%s a %i pages -> %i centimes', (format, pageCount, expectedBookPriceCents) => {
    const result = calculateBookPrice({ format, pageCount });
    expect(result.bookPriceCents).toBe(expectedBookPriceCents);
    expect(result.format).toBe(format);
    expect(result.pageCount).toBe(pageCount);
  });
});

describe('calculateBookPrice — livraison France (§20)', () => {
  // 600/650 (plutot que les anciens 500/539) : tarifs reels releves auprès
  // de l'API Gelato le 2026-10-02 (voir pricingConfig.js) — l'ancien tarif
  // France etait sous son propre cout reel (5,99 € TTC), corrige au passage
  // du chantier international.
  it('livret : 6,00 €', () => {
    expect(calculateBookPrice({ format: 'livret', pageCount: 30 }).shippingPriceCents).toBe(600);
  });
  it('standard : 6,00 €', () => {
    expect(calculateBookPrice({ format: 'standard', pageCount: 30 }).shippingPriceCents).toBe(600);
  });
  it('luxe : 6,50 €', () => {
    expect(calculateBookPrice({ format: 'luxe', pageCount: 30 }).shippingPriceCents).toBe(650);
  });
  it('pays inconnu retombe sur la France (repli explicite, jamais un pays au hasard)', () => {
    const fr = calculateBookPrice({ format: 'standard', pageCount: 30, country: 'FR' });
    const inconnu = calculateBookPrice({ format: 'standard', pageCount: 30, country: 'ZZ' });
    expect(inconnu.shippingPriceCents).toBe(fr.shippingPriceCents);
    expect(inconnu.currency).toBe(fr.currency);
  });
});

describe('calculateBookPrice — total livre + livraison', () => {
  it('exemple du cahier des charges : Standard 34 pages = 44,30€ + 6,00€ = 50,30€', () => {
    const result = calculateBookPrice({ format: 'standard', pageCount: 34 });
    expect(result.bookPriceCents).toBe(4430);
    expect(result.shippingPriceCents).toBe(600);
    expect(result.totalPriceCents).toBe(5030);
  });
});

describe('calculateBookPrice — international (chantier 2026-10-02)', () => {
  it('France (EUR) reste la devise par defaut, comportement inchange', () => {
    const result = calculateBookPrice({ format: 'standard', pageCount: 30 });
    expect(result.currency).toBe('EUR');
    expect(result.bookPriceCents).toBe(3990);
  });

  it('Canada : prix du livre converti en CAD, livraison NATIVE (jamais convertie)', () => {
    const result = calculateBookPrice({ format: 'standard', pageCount: 30, country: 'CA' });
    expect(result.currency).toBe('CAD');
    // 3990 EUR cts * 1.5984 (taux fige, voir pricingConfig.js) = 6377.76 -> 6378
    expect(result.bookPriceCents).toBe(6378);
    // Tarif Gelato reel CAD, jamais une conversion du tarif EUR.
    expect(result.shippingPriceCents).toBe(1000);
    expect(result.totalPriceCents).toBe(7378);
  });

  it('Royaume-Uni : conversion EUR -> GBP appliquee au livre uniquement', () => {
    const result = calculateBookPrice({ format: 'livret', pageCount: 30, country: 'GB' });
    expect(result.currency).toBe('GBP');
    // 2990 * 0.85033 = 2542.4867 -> 2542
    expect(result.bookPriceCents).toBe(2542);
    expect(result.shippingPriceCents).toBe(400);
  });

  it('Maroc/Tunisie/Algerie restent en EUR (Gelato n\'accepte pas MAD/TND/DZD)', () => {
    const ma = calculateBookPrice({ format: 'standard', pageCount: 30, country: 'MA' });
    expect(ma.currency).toBe('EUR');
    expect(ma.bookPriceCents).toBe(3990);
    expect(ma.shippingPriceCents).toBe(2550);
  });
});

describe('calculateBookPrice — informations utiles a l\'interface', () => {
  it('additionalPages/additionalPageBlocks/additionalPagesPriceCents corrects', () => {
    const result = calculateBookPrice({ format: 'standard', pageCount: 34 });
    expect(result.basePriceCents).toBe(3990);
    expect(result.additionalPages).toBe(4);
    expect(result.additionalPageBlocks).toBe(2);
    expect(result.additionalPagesPriceCents).toBe(440);
  });

  it('a la pagination plancher (30), aucune page supplementaire', () => {
    const result = calculateBookPrice({ format: 'luxe', pageCount: 30 });
    expect(result.additionalPages).toBe(0);
    expect(result.additionalPageBlocks).toBe(0);
    expect(result.additionalPagesPriceCents).toBe(0);
    expect(result.bookPriceCents).toBe(result.basePriceCents);
  });

  it('porte une version de tarification figeable sur une commande (§19)', () => {
    const result = calculateBookPrice({ format: 'standard', pageCount: 30 });
    expect(result.pricingVersion).toBe('2026-09-01');
  });
});

describe('calculateBookPrice — bornes et cas limites', () => {
  it('format inconnu retombe sur standard, jamais d\'erreur ni NaN', () => {
    const result = calculateBookPrice({ format: 'CECI_NEXISTE_PAS', pageCount: 34 });
    expect(result.format).toBe('standard');
    expect(result.bookPriceCents).toBe(4430);
  });

  it('pagination sous le plancher (30) est ramenee au plancher, jamais un prix plus bas', () => {
    const result = calculateBookPrice({ format: 'standard', pageCount: 8 });
    expect(result.pageCount).toBe(30);
    expect(result.bookPriceCents).toBe(3990);
  });

  it('pagination au-dessus du plafond (200) est ramenee au plafond', () => {
    const result = calculateBookPrice({ format: 'standard', pageCount: 500 });
    expect(result.pageCount).toBe(200);
  });

  it('pageCount absent retombe sur la pagination de base du format', () => {
    const result = calculateBookPrice({ format: 'livret' });
    expect(result.pageCount).toBe(30);
    expect(result.bookPriceCents).toBe(2990);
  });
});
