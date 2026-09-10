// Tests de gelatoOrderService.js — le point d'entree d'une VRAIE commande
// payee vers Gelato (argent + production reelle en jeu si GELATO_LIVE_ORDERS
// est active). Tout ce qui parle reseau (Gelato, Supabase Storage) est
// mocke ; seule la logique d'orchestration/idempotence/mode brouillon-vs-reel
// est testee ici.

jest.mock('../../services/composition/bookContentService', () => ({
  listPages: jest.fn(async () => ([{ page_index: 0, layout_id: null, content: { kind: 'photo', blocks: [] } }])),
  listContentItems: jest.fn(async () => ([]))
}));
jest.mock('../../services/composition/templateCatalog', () => ({
  listActiveLayouts: jest.fn(async () => ([])),
  getTemplateById: jest.fn(async () => null)
}));
jest.mock('../../services/printing/gelatoPrintFile', () => ({
  buildGelatoPrintReadyPdf: jest.fn(async ({ outputPath }) => ({
    outputPath,
    totalPages: 33,
    coverSizeMm: { width: 478, height: 326 },
    interiorSizeMm: { width: 216, height: 286 },
    realInteriorPages: 28,
    paddedInteriorPages: 4
  }))
}));
jest.mock('../../services/printing/printFileStorage', () => ({
  uploadPrintFile: jest.fn(async (_localPath, remotePath) => `https://cdn.test/print-files/${remotePath}`)
}));
jest.mock('../../services/printing/gelatoClient', () => ({
  buildOrderPayload: jest.requireActual('../../services/printing/gelatoClient').buildOrderPayload,
  createOrder: jest.fn(async () => ({ id: 'gelato-order-fake-1' }))
}));

const bookContentService = require('../../services/composition/bookContentService');
const gelatoClient = require('../../services/printing/gelatoClient');
const { uploadPrintFile } = require('../../services/printing/printFileStorage');
const { submitPrintOrderToGelato, mapShippingAddress } = require('../../services/printing/gelatoOrderService');

function makeDb(updateSpy) {
  return {
    from: () => ({
      update: (payload) => ({
        eq: () => {
          updateSpy(payload);
          return Promise.resolve({ data: null, error: null });
        }
      })
    })
  };
}

const book = {
  id: 'book-1',
  title: 'Mon livre',
  template_id: null,
  print_format: 'luxe'
};

const baseOrder = {
  id: 'order-1',
  order_number: 'CMD-260910-ABC-123',
  type: 'print',
  quantity: 1,
  metadata: {},
  shipping_address: {
    fullName: 'Marie Curie',
    line1: '1 rue Pierre',
    line2: '',
    postalCode: '75005',
    city: 'Paris',
    country: 'France',
    phone: '0600000000'
  }
};

describe('gelatoOrderService', () => {
  const originalEnv = process.env.GELATO_LIVE_ORDERS;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalEnv === undefined) delete process.env.GELATO_LIVE_ORDERS;
    else process.env.GELATO_LIVE_ORDERS = originalEnv;
  });

  it('ignore une commande deja soumise (idempotence) — ne genere rien, ne rappelle pas Gelato', async () => {
    const updateSpy = jest.fn();
    const order = { ...baseOrder, metadata: { gelatoOrderId: 'deja-la' } };

    const result = await submitPrintOrderToGelato({ db: makeDb(updateSpy), book, order });

    expect(result).toEqual({ skipped: true, reason: 'already_submitted', gelatoOrderId: 'deja-la' });
    expect(gelatoClient.createOrder).not.toHaveBeenCalled();
    expect(uploadPrintFile).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('soumet en orderType "draft" par defaut (GELATO_LIVE_ORDERS absent)', async () => {
    delete process.env.GELATO_LIVE_ORDERS;
    const updateSpy = jest.fn();

    const result = await submitPrintOrderToGelato({ db: makeDb(updateSpy), book, order: baseOrder });

    expect(result.error).toBeUndefined();
    expect(result.gelatoOrderType).toBe('draft');
    expect(gelatoClient.createOrder).toHaveBeenCalledTimes(1);
    const payloadSent = gelatoClient.createOrder.mock.calls[0][0];
    expect(payloadSent.orderType).toBe('draft');

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const savedMetadata = updateSpy.mock.calls[0][0].metadata;
    expect(savedMetadata.gelatoOrderId).toBe('gelato-order-fake-1');
    expect(savedMetadata.gelatoOrderType).toBe('draft');
  });

  it('soumet en orderType "order" reel uniquement si GELATO_LIVE_ORDERS=1', async () => {
    process.env.GELATO_LIVE_ORDERS = '1';
    const updateSpy = jest.fn();

    const result = await submitPrintOrderToGelato({ db: makeDb(updateSpy), book, order: baseOrder });

    expect(result.gelatoOrderType).toBe('order');
    const payloadSent = gelatoClient.createOrder.mock.calls[0][0];
    expect(payloadSent.orderType).toBe('order');
  });

  it('une valeur autre que "1" (ex. "true", "yes") reste en brouillon — jamais d activation implicite', async () => {
    process.env.GELATO_LIVE_ORDERS = 'true';
    const updateSpy = jest.fn();

    const result = await submitPrintOrderToGelato({ db: makeDb(updateSpy), book, order: baseOrder });

    expect(result.gelatoOrderType).toBe('draft');
  });

  it('un livre sans page interieure produit une erreur geree (pas de throw), enregistree en metadata', async () => {
    bookContentService.listPages.mockResolvedValueOnce([]);
    const updateSpy = jest.fn();

    const result = await submitPrintOrderToGelato({ db: makeDb(updateSpy), book, order: baseOrder });

    expect(result.error).toMatch(/aucune page/i);
    expect(gelatoClient.createOrder).not.toHaveBeenCalled();
    const savedMetadata = updateSpy.mock.calls[0][0].metadata;
    expect(savedMetadata.gelatoError).toMatch(/aucune page/i);
  });

  it('une erreur Gelato (createOrder rejette) est capturee, jamais propagee — enregistree en metadata.gelatoError', async () => {
    gelatoClient.createOrder.mockRejectedValueOnce(new Error('Gelato API 500'));
    const updateSpy = jest.fn();

    const result = await submitPrintOrderToGelato({ db: makeDb(updateSpy), book, order: baseOrder });

    expect(result.error).toBe('Gelato API 500');
    const savedMetadata = updateSpy.mock.calls[0][0].metadata;
    expect(savedMetadata.gelatoError).toBe('Gelato API 500');
    expect(savedMetadata.gelatoOrderId).toBeUndefined();
  });

  describe('mapShippingAddress', () => {
    it('coupe le nom complet au premier espace (prenom / nom)', () => {
      const mapped = mapShippingAddress(baseOrder.shipping_address, 'marie@test.local');
      expect(mapped.firstName).toBe('Marie');
      expect(mapped.lastName).toBe('Curie');
      expect(mapped.country).toBe('FR');
      expect(mapped.email).toBe('marie@test.local');
    });

    it('repli sur un nom/prenom par defaut si fullName est vide (jamais un champ Gelato vide)', () => {
      const mapped = mapShippingAddress({ ...baseOrder.shipping_address, fullName: '' }, undefined);
      expect(mapped.firstName).toBeTruthy();
      expect(mapped.lastName).toBeTruthy();
    });
  });
});
