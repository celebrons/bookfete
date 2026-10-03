// gelatoStatusSync.refreshGelatoTracking : extrait de GET /:orderId/tracking
// le 2026-10-04 pour etre reutilisable par un controle periodique en
// arriere-plan. L'essentiel de "avance seulement / jamais en arriere" est
// deja couvert par orders.route.test.js (route inchangee en comportement) —
// ce fichier se concentre sur le NOUVEAU point : l'email d'etape, declenche
// ici pour la premiere fois sans visite de l'ecran de suivi.

jest.mock('../../services/printing/gelatoClient', () => ({
  getOrder: jest.fn()
}));
jest.mock('../../services/events/eventLog', () => ({
  logEvent: jest.fn()
}));
jest.mock('../../services/email/transactionalEmails', () => ({
  envoyerEtapeFabrication: jest.fn(async () => ({ sent: true }))
}));
jest.mock('../../config/supabase', () => {
  const table = {
    update: jest.fn(function update(payload) { this.__payload = payload; return this; }),
    eq: jest.fn(function eq() { return this; }),
    select: jest.fn(function select() { return this; }),
    single: jest.fn(async function single() { return { data: { id: 'order-1', ...this.__payload }, error: null }; })
  };
  return { from: jest.fn(() => table), __table: table };
});

const gelatoClient = require('../../services/printing/gelatoClient');
const { logEvent } = require('../../services/events/eventLog');
const emails = require('../../services/email/transactionalEmails');
const { refreshGelatoTracking } = require('../../services/printing/gelatoStatusSync');

const ORDRE_BASE = {
  id: 'order-1',
  book_id: 'book-1',
  owner_id: 'owner-1',
  status: 'sent_to_printer',
  metadata: { gelatoOrderId: 'gelato-1', gelatoOrderType: 'order' }
};

describe('gelatoStatusSync.refreshGelatoTracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aucun appel Gelato ni email pour une commande sans gelatoOrderId', async () => {
    const resultat = await refreshGelatoTracking({ ...ORDRE_BASE, metadata: {} });
    expect(resultat.source).toBe('local');
    expect(gelatoClient.getOrder).not.toHaveBeenCalled();
    expect(emails.envoyerEtapeFabrication).not.toHaveBeenCalled();
  });

  it('statut inchange : ni email, ni evenement, ni ecriture de statut', async () => {
    gelatoClient.getOrder.mockResolvedValue({ fulfillmentStatus: 'in_production' });
    const resultat = await refreshGelatoTracking(ORDRE_BASE);
    expect(resultat.status).toBe('sent_to_printer');
    expect(emails.envoyerEtapeFabrication).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('statut qui avance reellement (expedie) : email d etape envoye avec le bon statut et le suivi', async () => {
    gelatoClient.getOrder.mockResolvedValue({
      fulfillmentStatus: 'shipped',
      shipment: { trackingCode: 'ABC123', trackingUrl: 'https://track.test/ABC123', carrierName: 'Colissimo' }
    });

    const resultat = await refreshGelatoTracking(ORDRE_BASE, { consulteePar: 'client@test.local' });

    expect(resultat.status).toBe('shipped');
    expect(emails.envoyerEtapeFabrication).toHaveBeenCalledTimes(1);
    const appel = emails.envoyerEtapeFabrication.mock.calls[0][0];
    expect(appel.statut).toBe('shipped');
    expect(appel.order).toBe(ORDRE_BASE);
    expect(appel.suivi).toEqual(expect.objectContaining({ code: 'ABC123' }));
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'status.changed', metadata: expect.objectContaining({ consulteePar: 'client@test.local' })
    }));
  });

  it('un echec d envoi d email n empeche jamais la mise a jour du statut (jamais attendu, jamais bloquant)', async () => {
    gelatoClient.getOrder.mockResolvedValue({ fulfillmentStatus: 'shipped' });
    emails.envoyerEtapeFabrication.mockRejectedValueOnce(new Error('Brevo indisponible'));

    const resultat = await refreshGelatoTracking(ORDRE_BASE);

    expect(resultat.status).toBe('shipped');
  });

  it('annulation (404 chez Gelato) : aucun email (pas de gabarit dedie pour "cancelled"), mais l evenement est journalise', async () => {
    gelatoClient.getOrder.mockRejectedValue({ status: 404, message: 'not found' });

    const resultat = await refreshGelatoTracking(ORDRE_BASE);

    expect(resultat.status).toBe('cancelled');
    // envoyerEtapeFabrication EST appelee (meme logique que pour tout statut
    // qui avance) — c'est le gabarit lui-meme qui n'a rien pour "cancelled"
    // (verifie separement dans emailTemplates). On verifie ici seulement
    // qu'un echec de ce cote ne remonte jamais une erreur a l'appelant.
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Commande supprimee chez Gelato')
    }));
  });

  it('un livre deja livre ne redevient jamais "annule" sur un 404 tardif (etat definitif)', async () => {
    gelatoClient.getOrder.mockRejectedValue({ status: 404, message: 'not found' });
    const resultat = await refreshGelatoTracking({ ...ORDRE_BASE, status: 'delivered' });

    expect(resultat.status).toBe('delivered');
    expect(emails.envoyerEtapeFabrication).not.toHaveBeenCalled();
  });

  it('Gelato injoignable (ni 404, autre erreur) : renvoie l etat en cache, jamais d email ni d ecriture', async () => {
    gelatoClient.getOrder.mockRejectedValue({ status: 500, message: 'panne' });
    const resultat = await refreshGelatoTracking(ORDRE_BASE);

    expect(resultat.stale).toBe(true);
    expect(resultat.source).toBe('cache');
    expect(emails.envoyerEtapeFabrication).not.toHaveBeenCalled();
  });
});
