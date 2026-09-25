// La regle de parite d'un livre relie, eprouvee sur des cas concrets.
//
// Elle vient du premier vrai livre imprime (2026-09-25) : une photo posee
// sur une double page en etait ressortie en recto-verso. Voir
// services/composition/pageParity.js pour les trois faits qui l'etablissent.

const { isLeftPage, isRightPage, facingPageIndex, spreadPair, spreadCount } = require('../../services/composition/pageParity');

describe('pageParity — de quel cote se trouve une page', () => {
  it('la page 1 du livre est a DROITE, et elle est seule', () => {
    expect(isRightPage(0)).toBe(true);
    expect(isLeftPage(0)).toBe(false);
    expect(facingPageIndex(0)).toBeNull();
  });

  it('index pair a droite, index impair a gauche', () => {
    expect([0, 1, 2, 3, 4, 5].map(isLeftPage)).toEqual([false, true, false, true, false, true]);
  });

  it('les vis-a-vis reels sont (1,2), (3,4), (5,6)', () => {
    expect(facingPageIndex(1)).toBe(2);
    expect(facingPageIndex(2)).toBe(1);
    expect(facingPageIndex(3)).toBe(4);
    expect(facingPageIndex(4)).toBe(3);
    expect(facingPageIndex(5)).toBe(6);
  });

  it('le cas du livre « Voyage a Montreal » : 4 et 5 ne se font PAS face', () => {
    // C'est exactement le defaut constate sur le livre imprime : la photo
    // posee sur les index 4 et 5 est sortie en recto-verso.
    expect(facingPageIndex(4)).not.toBe(5);
    expect(facingPageIndex(4)).toBe(3);
  });

  it('spreadPair donne le vis-a-vis numero n, gauche puis droite', () => {
    expect(spreadPair(0)).toEqual({ left: null, right: 0 });
    expect(spreadPair(1)).toEqual({ left: 1, right: 2 });
    expect(spreadPair(2)).toEqual({ left: 3, right: 4 });
  });

  it('compte les vis-a-vis : le premier n a qu une page', () => {
    expect(spreadCount(0)).toBe(0);
    expect(spreadCount(1)).toBe(1);   // page 1 seule
    expect(spreadCount(3)).toBe(2);   // [1] puis [2,3]
    expect(spreadCount(30)).toBe(16); // [1] puis 14 vis-a-vis pleins, puis [30]
  });

  it('ne se laisse pas troubler par une entree absurde', () => {
    expect(facingPageIndex(null)).toBeNull();
    expect(facingPageIndex(-2)).toBeNull();
    expect(facingPageIndex('trois')).toBeNull();
  });
});
