// Suivi de trafic (2026-10-06, IP ajoutee le 2026-10-07) : comme le journal
// d'evenements, une visite non enregistree ne doit jamais devenir une erreur
// visible par le visiteur (meme regle que logEvent/transactionalEmails).
// Verifie aussi que seul un CHEMIN est conserve (jamais un domaine ni une
// query string qui pourrait porter un jeton/identifiant), et que l'IP,
// seule donnee personnelle du lot, est anonymisee passe un delai.

let mockInsertedRows = [];
let mockInsertErreur = null;
let mockSelectResult = { data: [], error: null };
let mockUpdatedRows = [];
let mockUpdateResult = { data: [], error: null };

jest.mock('../config/supabase', () => ({
  from: jest.fn(() => ({
    insert: jest.fn((ligne) => {
      mockInsertedRows.push(ligne);
      return mockInsertErreur ? Promise.reject(mockInsertErreur) : Promise.resolve({ data: [ligne], error: null });
    }),
    select: jest.fn(function select() { return this; }),
    gte: jest.fn(function gte() { return this; }),
    lt: jest.fn(function lt() { return this; }),
    not: jest.fn(function not() { return this; }),
    order: jest.fn(function order() { return this; }),
    limit: jest.fn(async function limit() { return mockSelectResult; }),
    update: jest.fn(function update(valeurs) { mockUpdatedRows.push(valeurs); return this; }),
    then: function then(resolve) { resolve(mockUpdateResult); }
  }))
}));

const { recordPageView, pageViewsSummary, purgeOldIps } = require('../services/analytics/pageViews');

describe('recordPageView', () => {
  beforeEach(() => {
    mockInsertedRows = [];
    mockInsertErreur = null;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('enregistre un chemin simple', async () => {
    await recordPageView({ path: '/tarifs' });
    expect(mockInsertedRows).toHaveLength(1);
    expect(mockInsertedRows[0]).toEqual({ path: '/tarifs', referrer: null, ip: null });
  });

  it('enregistre l IP fournie', async () => {
    await recordPageView({ path: '/', ip: '203.0.113.42' });
    expect(mockInsertedRows[0].ip).toBe('203.0.113.42');
  });

  it('ne garde QUE le chemin : jamais le domaine ni la query string (identifiants eventuels)', async () => {
    await recordPageView({ path: 'https://bookipix.com/book/abc?token=secret123' });
    expect(mockInsertedRows[0].path).toBe('/book/abc');
  });

  it('le referrer ne garde que l ORIGINE du site externe, jamais son chemin (ex. une recherche Google sensible)', async () => {
    await recordPageView({ path: '/', referrer: 'https://www.google.com/search?q=une+recherche+privee' });
    expect(mockInsertedRows[0].referrer).toBe('https://www.google.com');
  });

  it('un referrer a schema exotique (appli mobile) est garde tel quel plutot que perdu', async () => {
    await recordPageView({ path: '/', referrer: 'android-app://com.google.android.gm' });
    expect(mockInsertedRows[0].referrer).toBe('android-app://com.google.android.gm');
  });

  it('chemin absent -> repli sur "/"', async () => {
    await recordPageView({});
    expect(mockInsertedRows[0].path).toBe('/');
  });

  it('ne leve jamais, meme si l insertion echoue', async () => {
    mockInsertErreur = new Error('relation "page_views" does not exist');
    await expect(recordPageView({ path: '/' })).resolves.toBeUndefined();
  });
});

describe('pageViewsSummary', () => {
  afterEach(() => { mockSelectResult = { data: [], error: null }; });

  it('agrege total, par jour, pages, provenances et IP les plus frequentes, + visites recentes', async () => {
    // Deja dans l'ordre que la vraie requete renverrait (created_at
    // descendant, .order() applique cote base) : le mock de .order() ne
    // trie pas lui-meme, la fixture doit donc deja etre dans cet ordre.
    mockSelectResult = {
      data: [
        { path: '/tarifs', referrer: 'https://www.google.com', ip: '198.51.100.9', created_at: '2026-10-06T09:00:00.000Z' },
        { path: '/', referrer: 'https://www.google.com', ip: '203.0.113.1', created_at: '2026-10-05T11:00:00.000Z' },
        { path: '/', referrer: null, ip: '203.0.113.1', created_at: '2026-10-05T10:00:00.000Z' }
      ],
      error: null
    };

    const resume = await pageViewsSummary({ days: 30 });

    expect(resume.total).toBe(3);
    expect(resume.byDay).toEqual([
      { date: '2026-10-05', count: 2 },
      { date: '2026-10-06', count: 1 }
    ]);
    expect(resume.topPaths[0]).toEqual({ key: '/', count: 2 });
    expect(resume.topReferrers.find((r) => r.key === '(direct)').count).toBe(1);
    expect(resume.topReferrers.find((r) => r.key === 'https://www.google.com').count).toBe(2);
    expect(resume.topIps.find((i) => i.key === '203.0.113.1').count).toBe(2);
    expect(resume.recent).toHaveLength(3);
    expect(resume.recent[0]).toEqual({
      path: '/tarifs', referrer: 'https://www.google.com', ip: '198.51.100.9', createdAt: '2026-10-06T09:00:00.000Z'
    });
  });

  it('une erreur de lecture remonte (l appelant — la route admin — sait deja la traduire)', async () => {
    mockSelectResult = { data: null, error: { message: 'relation "page_views" does not exist' } };
    await expect(pageViewsSummary()).rejects.toBeTruthy();
  });
});

describe('purgeOldIps', () => {
  beforeEach(() => {
    mockUpdatedRows = [];
    mockUpdateResult = { data: [], error: null };
  });

  it('efface uniquement l IP des visites anciennes, jamais le reste', async () => {
    mockUpdateResult = { data: [{ id: '1' }, { id: '2' }], error: null };
    const resultat = await purgeOldIps({ jours: 90 });
    expect(mockUpdatedRows[0]).toEqual({ ip: null });
    expect(resultat).toEqual({ anonymized: 2 });
  });

  it('une erreur remonte plutot que d etre avalee (travail planifie, pas un geste utilisateur)', async () => {
    mockUpdateResult = { data: null, error: { message: 'base injoignable' } };
    await expect(purgeOldIps()).rejects.toBeTruthy();
  });
});
