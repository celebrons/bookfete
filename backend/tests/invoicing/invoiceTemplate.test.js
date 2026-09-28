const { renderInvoiceHtml } = require('../../services/invoicing/invoiceTemplate');

const BASE = {
  invoiceNumber: 'F-2026-000001',
  issuedAt: '2026-09-28T10:00:00.000Z',
  seller: {
    name: 'Jean Dupont', siret: '12345678900011', address: '1 rue de Paris, 75001 Paris',
    email: 'bonjour@celebrons.com', vatMention: 'TVA non applicable, art. 293 B du CGI', statusMention: 'Micro-entreprise'
  },
  buyer: { name: 'Marie Curie', email: 'marie@example.com', address: { line1: '2 rue de Lyon', postalCode: '69001', city: 'Lyon', country: 'France' } },
  order: { orderNumber: 'CMD-260927-ABC-123', paidAt: '2026-09-27T21:24:59.000Z' },
  lineItems: [
    { label: 'Livre photo imprimé', detail: 'Standard · 34 pages', quantity: 1, unitCents: 4430, amountCents: 4430 },
    { label: 'Livraison', detail: null, quantity: 1, unitCents: 500, amountCents: 500 }
  ],
  totals: { totalCents: 4930 }
};

describe('renderInvoiceHtml', () => {
  it('contient toutes les mentions legales obligatoires', () => {
    const html = renderInvoiceHtml(BASE);
    expect(html).toContain('F-2026-000001');
    expect(html).toContain('12345678900011');
    expect(html).toContain('TVA non applicable, art. 293 B du CGI');
    expect(html).toContain('CMD-260927-ABC-123');
    expect(html).toContain('49,30 €'); // total
    expect(html).toContain('44,30 €'); // ligne produit
    expect(html).toContain('Marie Curie');
    expect(html).toContain('Lyon');
  });

  it('echappe le HTML dans les champs utilisateur (nom acheteur)', () => {
    const html = renderInvoiceHtml({
      ...BASE,
      buyer: { ...BASE.buyer, name: '<script>alert(1)</script>' }
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sans adresse acheteur (commande PDF) : ne plante pas, section adresse absente', () => {
    const html = renderInvoiceHtml({
      ...BASE,
      buyer: { name: 'Marie Curie', email: 'marie@example.com', address: null },
      lineItems: [{ label: 'Livre photo — version PDF', detail: null, quantity: 1, unitCents: 799, amountCents: 799 }],
      totals: { totalCents: 799 }
    });
    expect(html).toContain('Marie Curie');
    expect(html).toContain('7,99 €');
  });
});
