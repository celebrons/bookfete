// Lignes de facture : deduites de ce qui a REELLEMENT ete facture
// (unit_cents/quantity/total_cents), jamais recalculees depuis la grille
// tarifaire courante — voir invoiceService.js.

const { buildLineItems } = require('../../services/invoicing/invoiceService');

describe('buildLineItems', () => {
  it('commande PDF : une seule ligne, pas de livraison', () => {
    const lignes = buildLineItems({
      type: 'pdf', quantity: 1, unit_cents: 799, total_cents: 799,
      book_title: 'Voyage à Montréal'
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0].label).toBe('Livre photo — version PDF');
    expect(lignes[0].detail).toContain('Voyage à Montréal');
    expect(lignes[0].amountCents).toBe(799);
  });

  it('commande impression : ligne produit + ligne livraison, qui s additionnent au total reel', () => {
    const lignes = buildLineItems({
      type: 'print', quantity: 1, unit_cents: 4430, total_cents: 4930,
      snapshot: { printFormat: 'standard', pages: 34, title: 'Portugal 2025' }
    });
    expect(lignes).toHaveLength(2);
    expect(lignes[0].label).toBe('Livre photo imprimé');
    expect(lignes[0].detail).toContain('Standard');
    expect(lignes[0].detail).toContain('34 pages');
    expect(lignes[0].amountCents).toBe(4430);
    expect(lignes[1].label).toBe('Livraison');
    expect(lignes[1].amountCents).toBe(500);
    const total = lignes.reduce((s, l) => s + l.amountCents, 0);
    expect(total).toBe(4930);
  });

  it('quantite > 1 : le montant produit tient compte de la quantite', () => {
    const lignes = buildLineItems({
      type: 'print', quantity: 3, unit_cents: 4430, total_cents: 4430 * 3 + 500,
      snapshot: { printFormat: 'luxe', pages: 40 }
    });
    expect(lignes[0].quantity).toBe(3);
    expect(lignes[0].amountCents).toBe(4430 * 3);
    expect(lignes[1].amountCents).toBe(500);
  });

  it('pack : libelle dedie, meme logique de livraison', () => {
    const lignes = buildLineItems({
      type: 'pack', quantity: 1, unit_cents: 4706, total_cents: 5206,
      snapshot: { printFormat: 'standard', pages: 34 }
    });
    expect(lignes[0].label).toContain('pack');
    expect(lignes[1].amountCents).toBe(500);
  });

  it('pas de livraison detectee (total = produit exactement) : aucune ligne livraison ajoutee', () => {
    const lignes = buildLineItems({ type: 'print', quantity: 1, unit_cents: 4430, total_cents: 4430 });
    expect(lignes).toHaveLength(1);
  });

  it('les lignes s additionnent TOUJOURS exactement au total reel, meme si les champs de detail manquent', () => {
    const lignes = buildLineItems({ type: 'print', quantity: 2, unit_cents: 1000, total_cents: 2600 });
    const total = lignes.reduce((s, l) => s + l.amountCents, 0);
    expect(total).toBe(2600);
  });
});
