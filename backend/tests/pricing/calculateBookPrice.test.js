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
  it('livret : 5,00 €', () => {
    expect(calculateBookPrice({ format: 'livret', pageCount: 30 }).shippingPriceCents).toBe(500);
  });
  it('standard : 5,00 €', () => {
    expect(calculateBookPrice({ format: 'standard', pageCount: 30 }).shippingPriceCents).toBe(500);
  });
  it('luxe : 5,39 €', () => {
    expect(calculateBookPrice({ format: 'luxe', pageCount: 30 }).shippingPriceCents).toBe(539);
  });
  it('pays inconnu retombe sur la France (seul pays configure pour l\'instant)', () => {
    const fr = calculateBookPrice({ format: 'standard', pageCount: 30, country: 'FR' });
    const inconnu = calculateBookPrice({ format: 'standard', pageCount: 30, country: 'ZZ' });
    expect(inconnu.shippingPriceCents).toBe(fr.shippingPriceCents);
  });
});

describe('calculateBookPrice — total livre + livraison', () => {
  it('exemple du cahier des charges : Standard 34 pages = 44,30€ + 5,00€ = 49,30€', () => {
    const result = calculateBookPrice({ format: 'standard', pageCount: 34 });
    expect(result.bookPriceCents).toBe(4430);
    expect(result.shippingPriceCents).toBe(500);
    expect(result.totalPriceCents).toBe(4930);
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
