// Suppression de compte — voir controllers/accountController.js.
//
// C'est l'operation la plus destructrice de l'application : elle efface des
// souvenirs, et rien ne les ramene. Les tests portent donc d'abord sur ce
// qui doit NE PAS arriver — supprimer le compte d'un autre, ou effacer le
// suivi d'un livre deja parti en fabrication.

const { __commandeEngageeEnProduction: engageeEnProduction } = require('../controllers/accountController');

describe('quelles commandes empechent une suppression de compte', () => {
  // Un brouillon n'engage rien : l'imprimeur ne l'a pas accepte, personne
  // n'attend de colis. C'est le cas de TOUS nos envois de test.
  it('un brouillon chez l\'imprimeur n\'empeche rien', () => {
    expect(engageeEnProduction({
      status: 'sent_to_printer',
      metadata: { gelatoOrderType: 'draft', gelatoOrderId: 'abc' }
    })).toBe(false);
  });

  // Le cas decisif : l'imprimeur a accepte la commande, le livre sera
  // fabrique et expedie. Son suivi doit survivre a l'envie de tout effacer.
  it('une vraie commande de production empeche la suppression', () => {
    expect(engageeEnProduction({
      status: 'sent_to_printer',
      metadata: { gelatoOrderType: 'order', gelatoOrderId: 'abc' }
    })).toBe(true);
  });

  // Filet de securite : nos metadonnees peuvent etre en retard (un brouillon
  // confirme depuis le tableau de bord Gelato devient une vraie commande sans
  // nous prevenir — vecu le 2026-09-18). Un statut avance ACCOMPAGNE d'un
  // identifiant imprimeur suffit donc a refuser.
  it('un statut avance avec un identifiant imprimeur suffit a refuser', () => {
    expect(engageeEnProduction({ status: 'printed', metadata: { gelatoOrderId: 'abc' } })).toBe(true);
    expect(engageeEnProduction({ status: 'shipped', metadata: { gelatoOrderId: 'abc' } })).toBe(true);
  });

  it('un statut avance SANS identifiant imprimeur n\'empeche rien', () => {
    // Rien n'est parti : le statut vient d'une manipulation locale.
    expect(engageeEnProduction({ status: 'printed', metadata: {} })).toBe(false);
  });

  it('une commande PDF payee n\'empeche rien : il n\'y a rien a livrer', () => {
    expect(engageeEnProduction({ status: 'pdf_ready', metadata: { stripePaymentStatus: 'paid' } })).toBe(false);
  });

  it('une commande en attente de paiement n\'empeche rien', () => {
    expect(engageeEnProduction({ status: 'awaiting_payment', metadata: {} })).toBe(false);
  });

  it('une commande vide ou absente ne fait jamais lever', () => {
    expect(() => engageeEnProduction(null)).not.toThrow();
    expect(engageeEnProduction(null)).toBe(false);
    expect(engageeEnProduction({})).toBe(false);
  });
});
