// Tests de gelatoOrderService.js — le point d'entree d'une VRAIE commande
// payee vers Gelato (argent + production reelle en jeu si le mode global
// est 'production', voir services/settings/appMode.js). Tout ce qui parle
// reseau (Gelato, Supabase Storage) est mocke ; seule la logique
// d'orchestration/idempotence/mode brouillon-vs-reel est testee ici.

jest.mock('../../services/composition/bookContentService', () => ({
  listPagesForRender: jest.fn(async () => ([{ page_index: 0, layout_id: null, content: { kind: 'photo', blocks: [] } }])),
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
jest.mock('../../services/settings/appMode', () => ({
  getAppModeSync: jest.fn(() => 'test')
}));

const bookContentService = require('../../services/composition/bookContentService');
const gelatoClient = require('../../services/printing/gelatoClient');
const { uploadPrintFile } = require('../../services/printing/printFileStorage');
const { getAppModeSync } = require('../../services/settings/appMode');
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
  afterEach(() => {
    jest.clearAllMocks();
    getAppModeSync.mockReturnValue('test');
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

  it('soumet en orderType "draft" par defaut (mode test)', async () => {
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

  // L'ENVOI REUSSI FAIT AVANCER LA COMMANDE (2026-09-20).
  // Avant, seules les metadonnees changeaient : la commande restait
  // affichee « Payee » alors que le livre etait deja chez l'imprimeur.
  it('passe la commande a « Envoye imprimeur » quand l\'envoi reussit', async () => {
    const updateSpy = jest.fn();

    await submitPrintOrderToGelato({
      db: makeDb(updateSpy),
      book,
      order: { ...baseOrder, status: 'paid' }
    });

    expect(updateSpy.mock.calls[0][0].status).toBe('sent_to_printer');
  });

  it('ne fait jamais RECULER une commande deja plus avancee', async () => {
    const updateSpy = jest.fn();

    await submitPrintOrderToGelato({
      db: makeDb(updateSpy),
      book,
      order: { ...baseOrder, status: 'shipped' }
    });

    // Les metadonnees sont bien ecrites, mais le statut n'est pas touche.
    expect(updateSpy.mock.calls[0][0].status).toBeUndefined();
    expect(updateSpy.mock.calls[0][0].metadata.gelatoOrderId).toBe('gelato-order-fake-1');
  });

  it('soumet en orderType "order" reel uniquement si le mode global est "production"', async () => {
    getAppModeSync.mockReturnValue('production');
    const updateSpy = jest.fn();

    const result = await submitPrintOrderToGelato({ db: makeDb(updateSpy), book, order: baseOrder });

    expect(result.gelatoOrderType).toBe('order');
    const payloadSent = gelatoClient.createOrder.mock.calls[0][0];
    expect(payloadSent.orderType).toBe('order');
  });

  it('une valeur de mode inattendue (ni "test" ni "production") reste en brouillon — jamais d activation implicite', async () => {
    getAppModeSync.mockReturnValue('autre-chose');
    const updateSpy = jest.fn();

    const result = await submitPrintOrderToGelato({ db: makeDb(updateSpy), book, order: baseOrder });

    expect(result.gelatoOrderType).toBe('draft');
  });

  it('un livre sans page interieure produit une erreur geree (pas de throw), enregistree en metadata', async () => {
    bookContentService.listPagesForRender.mockResolvedValueOnce([]);
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

  // CORRECTIF 2026-09-30 : createOrder reussit (une VRAIE commande existe
  // desormais chez Gelato) mais l'ecriture Supabase qui suit echoue. Avant
  // ce correctif, le bloc catch n'enregistrait que gelatoError — perdant la
  // trace du gelatoOrderId — si bien qu'une nouvelle tentative repartait de
  // zero et en creait une SECONDE chez Gelato (un vrai doublon facture des
  // que le mode global est 'production').
  it('createOrder reussit mais l ecriture Supabase echoue juste apres : le gelatoOrderId est quand meme retenu, un retry ne cree pas de doublon', async () => {
    const updateSpy = jest.fn();
    let appelNumero = 0;
    const db = {
      from: () => ({
        update: (payload) => ({
          eq: () => {
            appelNumero += 1;
            updateSpy(payload);
            if (appelNumero === 1) {
              return Promise.reject(new Error('Supabase indisponible'));
            }
            return Promise.resolve({ data: null, error: null });
          }
        })
      })
    };

    const result = await submitPrintOrderToGelato({ db, book, order: baseOrder });

    expect(result.error).toBe('Supabase indisponible');
    expect(result.gelatoOrderId).toBe('gelato-order-fake-1');
    expect(gelatoClient.createOrder).toHaveBeenCalledTimes(1);

    // Le deuxieme appel (celui du bloc catch, qui a reussi) a bien
    // enregistre l'id de la commande Gelato reellement creee.
    const catchMetadata = updateSpy.mock.calls[1][0].metadata;
    expect(catchMetadata.gelatoOrderId).toBe('gelato-order-fake-1');
    expect(catchMetadata.gelatoOrderType).toBe('draft');
    expect(catchMetadata.gelatoError).toBe('Supabase indisponible');

    // La preuve que ca empeche vraiment un doublon : rejouer la soumission
    // avec la metadata desormais persistee doit la traiter comme deja
    // envoyee, sans rappeler Gelato.
    gelatoClient.createOrder.mockClear();
    const retry = await submitPrintOrderToGelato({
      db,
      book,
      order: { ...baseOrder, metadata: catchMetadata }
    });
    expect(retry.skipped).toBe(true);
    expect(gelatoClient.createOrder).not.toHaveBeenCalled();
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

    // Premiere vraie commande vers le Canada (2026-10-05) rejetee par
    // Gelato ("Field is required") : ce champ manquait completement ici.
    it('transmet state quand il est fourni (Canada/US/Australie)', () => {
      const mapped = mapShippingAddress({ ...baseOrder.shipping_address, country: 'Canada', state: 'QC' }, 'marie@test.local');
      expect(mapped.state).toBe('QC');
      expect(mapped.country).toBe('CA');
    });

    it('state reste absent (jamais une chaine vide) quand il n est pas fourni', () => {
      const mapped = mapShippingAddress(baseOrder.shipping_address, 'marie@test.local');
      expect(mapped.state).toBeUndefined();
    });
  });
});
