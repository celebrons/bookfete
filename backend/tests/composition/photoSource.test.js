// Quelle version d'une photo part vers le navigateur ?
//
// Le choix decide a lui seul de la bande passante consommee : 1,4 Mo pour
// l'original contre 0,3 Mo pour la version d'ecran, sur chaque page de
// chaque livre feuillete. Mais il ne doit JAMAIS degrader un fichier
// destine a l'impression — d'ou les deux familles de tests ci-dessous.
const photoSource = require('../../services/composition/photoSource');

const photo = (id, extras = {}) => ({
  id,
  kind: 'photo',
  url: `https://cdn.test/${id}-original.jpg`,
  metadata: { previewUrl: `https://cdn.test/${id}-preview.jpg`, ...extras }
});

describe('photoSource.pourLAffichage — affichage ecran', () => {
  it('sert la version d\'ecran a la place de l\'original', () => {
    const [resultat] = photoSource.pourLAffichage([photo('p1')]);
    expect(resultat.url).toBe('https://cdn.test/p1-preview.jpg');
  });

  it('garde l\'original quand aucune version d\'ecran n\'existe (photos d\'avant)', () => {
    const ancienne = { id: 'p2', kind: 'photo', url: 'https://cdn.test/p2.jpg', metadata: {} };
    const [resultat] = photoSource.pourLAffichage([ancienne]);
    expect(resultat.url).toBe('https://cdn.test/p2.jpg');
  });

  it('ne touche pas aux textes', () => {
    const texte = { id: 't1', kind: 'texte', text: 'Un souvenir.' };
    const [resultat] = photoSource.pourLAffichage([texte]);
    expect(resultat).toBe(texte);
  });

  it('renvoie le tableau d\'origine quand il n\'y a rien a changer', () => {
    const items = [{ id: 't1', kind: 'texte', text: 'x' }];
    expect(photoSource.pourLAffichage(items)).toBe(items);
  });

  it('ne modifie jamais l\'item d\'origine (pas d\'effet de bord)', () => {
    const original = photo('p3');
    photoSource.pourLAffichage([original]);
    expect(original.url).toBe('https://cdn.test/p3-original.jpg');
  });
});

describe('photoSource.pourLAffichage — fichiers a imprimer', () => {
  // Le PDF et le fichier d'impression choisissent deja leur source : une
  // seconde substitution par-dessus enverrait une image d'ecran au massicot.
  it('« telle-quelle » ne remplace RIEN', () => {
    const items = [photo('p1')];
    const resultat = photoSource.pourLAffichage(items, photoSource.SOURCE_TELLE_QUELLE);
    expect(resultat).toBe(items);
    expect(resultat[0].url).toBe('https://cdn.test/p1-original.jpg');
  });
});

describe('photoSource — robustesse', () => {
  it('accepte une entree absente ou incoherente sans jamais lever', () => {
    expect(() => photoSource.pourLAffichage(null)).not.toThrow();
    expect(() => photoSource.pourLAffichage(undefined)).not.toThrow();
    expect(photoSource.urlPourEcran(null)).toBeUndefined();
    expect(photoSource.urlPourEcran({ kind: 'photo' })).toBeUndefined();
  });
});
