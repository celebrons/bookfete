// Le journal d'evenements ne doit JAMAIS faire echouer ce qu'il observe.
//
// Ajoute le 2026-09-18. Un journal est un temoin : s'il devient capable de
// casser l'action qu'il raconte, il coute plus qu'il ne rapporte. Une
// commande payee doit rester payee meme si son evenement ne s'ecrit pas —
// la meme regle que pour les emails transactionnels.
//
// Le cas le plus probable en vrai : la migration phase21 pas encore passee,
// donc la table absente. L'application doit continuer sans broncher.

let mockInserts = [];
let mockErreurInsert = null;

jest.mock('../config/supabase', () => ({
  from: () => ({
    insert: (ligne) => {
      mockInserts.push(ligne);
      // Imite le comportement d'un client Supabase : « thenable », mais sans
      // .catch() — c'est precisement ce qui avait masque une vraie erreur
      // ailleurs dans ce projet.
      return {
        then: (ok, ko) => {
          if (mockErreurInsert) { if (ko) ko(mockErreurInsert); return; }
          if (ok) ok({ data: [ligne], error: null });
        }
      };
    }
  })
}));

const { logEvent, environnement } = require('../services/events/eventLog');

describe('logEvent — un temoin qui ne casse rien', () => {
  beforeEach(() => {
    mockInserts = [];
    mockErreurInsert = null;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enregistre un evenement complet', () => {
    logEvent({
      type: 'pdf.ready',
      bookId: 'livre-1',
      orderId: 'commande-1',
      message: 'PDF final genere',
      metadata: { pages: 33 }
    });

    expect(mockInserts).toHaveLength(1);
    expect(mockInserts[0]).toMatchObject({
      type: 'pdf.ready',
      level: 'info',
      book_id: 'livre-1',
      order_id: 'commande-1',
      message: 'PDF final genere'
    });
    expect(mockInserts[0].metadata.pages).toBe(33);
  });

  it("ajoute toujours l'environnement d'origine", () => {
    // Indispensable depuis qu'on fait tourner plusieurs serveurs sur la MEME
    // base : sans cette information, impossible de savoir lequel a ecrit.
    logEvent({ type: 'status.changed' });
    expect(mockInserts[0].metadata.env).toBeTruthy();
  });

  it('ne leve pas quand la table est absente (migration pas passee)', () => {
    mockErreurInsert = { message: 'relation "app_events" does not exist' };
    expect(() => logEvent({ type: 'pdf.ready' })).not.toThrow();
  });

  it('ne leve pas quand le client de base explose', () => {
    const supabase = require('../config/supabase');
    jest.spyOn(supabase, 'from').mockImplementation(() => { throw new Error('base injoignable'); });
    expect(() => logEvent({ type: 'pdf.ready' })).not.toThrow();
  });

  it('ignore un evenement sans type plutot que d ecrire une ligne inutile', () => {
    logEvent({ message: 'sans type' });
    logEvent({});
    expect(mockInserts).toHaveLength(0);
  });

  it('ramene un niveau inconnu a info, plutot que de le refuser', () => {
    logEvent({ type: 'x', level: 'catastrophe' });
    expect(mockInserts[0].level).toBe('info');
  });

  it('accepte les trois niveaux prevus', () => {
    ['info', 'warn', 'error'].forEach((niveau) => logEvent({ type: 'x', level: niveau }));
    expect(mockInserts.map((i) => i.level)).toEqual(['info', 'warn', 'error']);
  });

  it('tronque un message trop long au lieu de le refuser', () => {
    logEvent({ type: 'x', message: 'a'.repeat(900) });
    expect(mockInserts[0].message.length).toBe(500);
  });

  it('retient QUI a agi', () => {
    logEvent({ type: 'gelato.submitted', actor: 'marie@exemple.fr' });
    expect(mockInserts[0].actor).toBe('marie@exemple.fr');
  });

  it('sans acteur, dit « systeme » plutot que de laisser un vide', () => {
    // Un vide laisserait croire a une information perdue ; « systeme » dit
    // qu'aucune personne n'est a l'origine — une tache automatique.
    logEvent({ type: 'pdf.ready' });
    expect(mockInserts[0].actor).toBe('systeme');
  });

  it("nomme l'environnement", () => {
    expect(typeof environnement()).toBe('string');
    expect(environnement().length).toBeGreaterThan(0);
  });
});
