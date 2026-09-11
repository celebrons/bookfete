// Traduction de l'etat reel d'une commande Gelato en statut Celebrons
// (2026-09-11). L'exigence centrale testee ici : ne JAMAIS ecraser un statut
// sur une valeur inconnue — un libelle manquant est acceptable, un statut
// faux ne l'est pas (voir l'entete de gelatoTracking.js).

const {
  mapGelatoStatus,
  extractTracking,
  readGelatoFulfillmentStatus
} = require('../../services/printing/gelatoTracking');

describe('mapGelatoStatus', () => {
  it.each([
    ['draft', 'print_queued'],
    ['created', 'sent_to_printer'],
    ['passed', 'sent_to_printer'],
    ['printed', 'printed'],
    ['shipped', 'shipped'],
    ['delivered', 'delivered'],
    ['canceled', 'cancelled'],
    ['failed', 'failed']
  ])('%s -> %s', (raw, expected) => {
    expect(mapGelatoStatus(raw)).toBe(expected);
  });

  it('absorbe les variantes d\'ecriture (casse, underscore, tiret, espace)', () => {
    expect(mapGelatoStatus('IN_PRODUCTION')).toBe('printed');
    expect(mapGelatoStatus('in-production')).toBe('printed');
    expect(mapGelatoStatus('In Production')).toBe('printed');
    expect(mapGelatoStatus('Shipped')).toBe('shipped');
  });

  it('valeur inconnue -> null (l\'appelant garde le statut courant, jamais d\'ecrasement)', () => {
    expect(mapGelatoStatus('un_statut_que_gelato_inventera_demain')).toBeNull();
    expect(mapGelatoStatus('')).toBeNull();
    expect(mapGelatoStatus(null)).toBeNull();
    expect(mapGelatoStatus(undefined)).toBeNull();
  });
});

describe('extractTracking', () => {
  it('lit le suivi porte par l\'expedition', () => {
    const tracking = extractTracking({
      shipment: { shipmentMethodName: 'Colissimo', trackingCode: 'AB123', trackingUrl: 'https://suivi.test/AB123' }
    });
    expect(tracking).toEqual({ carrier: 'Colissimo', code: 'AB123', url: 'https://suivi.test/AB123' });
  });

  it('retombe sur le suivi porte par un article quand l\'expedition ne le porte pas', () => {
    const tracking = extractTracking({
      items: [{ fulfillments: [{ carrierName: 'DHL', trackingNumber: 'ZZ999', trackingUrl: 'https://dhl.test/ZZ999' }] }]
    });
    expect(tracking).toEqual({ carrier: 'DHL', code: 'ZZ999', url: 'https://dhl.test/ZZ999' });
  });

  it('information partielle : renvoie ce qui existe, null pour le reste', () => {
    expect(extractTracking({ shipment: { trackingCode: 'SEUL' } })).toEqual({
      carrier: null, code: 'SEUL', url: null
    });
  });

  it('aucune information de suivi -> que des null, jamais une exception', () => {
    expect(extractTracking({})).toEqual({ carrier: null, code: null, url: null });
    expect(() => extractTracking(null)).not.toThrow();
    expect(() => extractTracking({ items: 'pas un tableau' })).not.toThrow();
  });
});

describe('readGelatoFulfillmentStatus', () => {
  it('prefere le statut global de la commande', () => {
    expect(readGelatoFulfillmentStatus({ fulfillmentStatus: 'shipped', items: [{ fulfillmentStatus: 'printed' }] }))
      .toBe('shipped');
  });

  it('retombe sur le statut du premier article si la commande n\'en porte pas', () => {
    expect(readGelatoFulfillmentStatus({ items: [{ fulfillmentStatus: 'printed' }] })).toBe('printed');
  });

  it('renvoie la chaine BRUTE, jamais traduite', () => {
    expect(readGelatoFulfillmentStatus({ fulfillmentStatus: 'in_production' })).toBe('in_production');
  });

  it('reponse vide/inattendue -> null, jamais une exception', () => {
    expect(readGelatoFulfillmentStatus({})).toBeNull();
    expect(() => readGelatoFulfillmentStatus(null)).not.toThrow();
  });
});
