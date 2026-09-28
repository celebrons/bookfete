describe('sellerIdentity', () => {
  const ENV_KEYS = ['INVOICE_SELLER_NAME', 'INVOICE_SELLER_SIRET', 'INVOICE_SELLER_ADDRESS', 'INVOICE_SELLER_EMAIL'];
  const sauvegarde = {};

  beforeEach(() => {
    jest.resetModules();
    ENV_KEYS.forEach((k) => { sauvegarde[k] = process.env[k]; delete process.env[k]; });
  });
  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (sauvegarde[k] === undefined) delete process.env[k]; else process.env[k] = sauvegarde[k];
    });
  });

  const charger = () => require('../../services/invoicing/sellerIdentity');

  it('sans variables posees : des placeholders explicites, jamais une valeur inventee', () => {
    const { sellerIdentity, isSellerIdentityComplete } = charger();
    const identite = sellerIdentity();
    expect(identite.name).toBe('[À COMPLÉTER]');
    expect(identite.siret).toBe('[À COMPLÉTER]');
    expect(identite.address).toBe('[À COMPLÉTER]');
    expect(identite.email).toBe('bonjour@celebrons.com');
    expect(identite.vatMention).toMatch(/293 B/);
    expect(isSellerIdentityComplete(identite)).toBe(false);
  });

  it('avec les trois variables posees : identite complete, mention TVA inchangee', () => {
    process.env.INVOICE_SELLER_NAME = 'Jean Dupont';
    process.env.INVOICE_SELLER_SIRET = '12345678900011';
    process.env.INVOICE_SELLER_ADDRESS = '1 rue de Paris, 75001 Paris';
    const { sellerIdentity, isSellerIdentityComplete } = charger();
    const identite = sellerIdentity();
    expect(identite.name).toBe('Jean Dupont');
    expect(identite.siret).toBe('12345678900011');
    expect(isSellerIdentityComplete(identite)).toBe(true);
  });
});
