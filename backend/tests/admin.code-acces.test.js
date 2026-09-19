// Le code de consultation de l'espace d'administration.
//
// Demande du 2026-09-19 : « ouvrir la page admin a tous les utilisateurs, ca
// me permettra de voir la page quel que soit le compte de test utilise,
// protege-la par un mot de passe si tu veux ».
//
// Cet espace montre les livres, les contenus et les ADRESSES de tout le
// monde. Le code n'est donc pas une formalite : c'est la seule chose qui
// separe ces donnees de n'importe quel visiteur inscrit. Ces tests gardent
// les quatre regles qui comptent.

const { isAdminUser, codeDemande } = require('../middleware/requireAdmin');

const CODE = 'code-de-consultation-2026';
const utilisateur = { email: 'nimporte.qui@test.local' };
const requete = (code) => ({ headers: code ? { 'x-admin-code': code } : {} });

describe("Code d'acces a l'espace d'administration", () => {
  const environnementInitial = { ...process.env };

  afterEach(() => {
    process.env = { ...environnementInitial };
  });

  it('ouvre a un compte quelconque qui presente le bon code', () => {
    process.env.ADMIN_EMAILS = '';
    process.env.ADMIN_ACCESS_CODE = CODE;

    expect(isAdminUser(utilisateur, requete(CODE))).toBe(true);
  });

  it('reste ferme sans code, ou avec le mauvais', () => {
    process.env.ADMIN_EMAILS = '';
    process.env.ADMIN_ACCESS_CODE = CODE;

    expect(isAdminUser(utilisateur, requete(null))).toBe(false);
    expect(isAdminUser(utilisateur, requete('presque-le-bon-code'))).toBe(false);
    // Un prefixe correct ne doit rien ouvrir : c'est le propre d'une
    // comparaison a temps constant sur la valeur entiere.
    expect(isAdminUser(utilisateur, requete(CODE.slice(0, -1)))).toBe(false);
  });

  it('refuse un code trop court, meme fourni correctement', () => {
    process.env.ADMIN_EMAILS = '';
    // Quatre caracteres se devinent en quelques minutes. Un code trop court
    // est IGNORE : la porte reste fermee au lieu de donner une illusion de
    // protection.
    process.env.ADMIN_ACCESS_CODE = '1234';

    expect(isAdminUser(utilisateur, requete('1234'))).toBe(false);
    expect(codeDemande()).toBe(false);
  });

  it('n ouvre jamais a un compte anonyme, meme avec le bon code', () => {
    process.env.ADMIN_EMAILS = '';
    process.env.ADMIN_ACCESS_CODE = CODE;

    // On veut toujours savoir QUI a consulte quoi : le journal des evenements
    // enregistre l'adresse du consultant, et un compte anonyme n'en a pas.
    expect(isAdminUser({ is_anonymous: true }, requete(CODE))).toBe(false);
    expect(isAdminUser({ email: '' }, requete(CODE))).toBe(false);
  });

  it('sans code configure, rien ne change : la liste d adresses decide seule', () => {
    process.env.ADMIN_EMAILS = 'patron@celebrons.fr';
    delete process.env.ADMIN_ACCESS_CODE;

    expect(codeDemande()).toBe(false);
    expect(isAdminUser({ email: 'patron@celebrons.fr' }, requete(null))).toBe(true);
    expect(isAdminUser(utilisateur, requete('peu importe'))).toBe(false);
  });

  it('une liste vide ET pas de code ferment l espace', () => {
    process.env.ADMIN_EMAILS = '';
    delete process.env.ADMIN_ACCESS_CODE;

    // Une variable oubliee doit fermer la porte, jamais l'ouvrir.
    expect(isAdminUser({ email: 'patron@celebrons.fr' }, requete(null))).toBe(false);
  });
});
