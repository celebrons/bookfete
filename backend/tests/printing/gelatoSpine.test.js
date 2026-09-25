// Le dos du livre : ce qu'on y ecrit, et surtout quand on n'y ecrit rien.

const {
  construireSvgDuDos,
  leDosPeutPorterDuTexte,
  encrePourLeFond,
  raccourcir,
  LARGEUR_MINIMALE_MM
} = require('../../services/printing/gelatoSpine');

const PX_PAR_MM = (96 / 25.4) * 3;
const dos = (extra = {}) => construireSvgDuDos({
  largeurMm: 6, hauteurMm: 280, pxParMm: PX_PAR_MM, fond: '#b8975a',
  titre: 'Voyage a Montreal', date: '2025', ...extra
});

describe('gelatoSpine — un dos ne se signe que s il en a la place', () => {
  it('un livre rigide a 6 mm de dos des 30 pages : il porte le titre', () => {
    // Cote reelle demandee a Gelato le 2026-09-25.
    expect(leDosPeutPorterDuTexte(6)).toBe(true);
    expect(dos()).toContain('Voyage a Montreal');
    expect(dos()).toContain('2025');
  });

  it('un livre souple de 30 pages n a que 2,88 mm : le dos reste muet', () => {
    // Un texte y serait tranche par le pli ou deborderait sur les plats.
    expect(leDosPeutPorterDuTexte(2.88)).toBe(false);
    const svg = dos({ largeurMm: 2.88 });
    expect(svg).not.toContain('<text');
    // ... mais la bande de couleur, elle, reste : le dos garde sa couleur.
    expect(svg).toContain('fill="#b8975a"');
  });

  it('le seuil ne bouge pas en silence', () => {
    expect(LARGEUR_MINIMALE_MM).toBe(6);
    expect(leDosPeutPorterDuTexte(LARGEUR_MINIMALE_MM - 0.01)).toBe(false);
  });
});

describe('gelatoSpine — l encre se deduit du fond, jamais du gout', () => {
  it('encre claire sur un fond sombre', () => {
    expect(encrePourLeFond('#2f4739')).toBe('#fffdf7');
  });

  it('encre sombre sur un fond clair', () => {
    expect(encrePourLeFond('#e8e0cd')).toBe('#2a2119');
  });

  it('le SVG porte bien l encre deduite, pas une couleur fixe', () => {
    expect(dos({ fond: '#2f4739' })).toContain('fill="#fffdf7"');
    expect(dos({ fond: '#f2ece0' })).toContain('fill="#2a2119"');
  });
});

describe('gelatoSpine — un titre trop long ne deborde pas', () => {
  it('coupe et pose des points de suspension', () => {
    const court = raccourcir('Voyage a Montreal', 240, 3.1);
    expect(court).toBe('Voyage a Montreal');

    const long = raccourcir('a'.repeat(400), 240, 3.1);
    expect(long.length).toBeLessThan(400);
    expect(long.endsWith('…')).toBe(true);
  });

  it('ne rend jamais une chaine vide, meme si la place manque totalement', () => {
    // Un dos sans titre du tout vaudrait mieux que rien ; mais tant qu il y
    // a un titre, on en montre quelque chose plutot que de le faire
    // disparaitre sans explication.
    const reste = raccourcir('Un titre', 1, 3);
    expect(reste.length).toBeGreaterThan(0);
    expect(reste.endsWith('…')).toBe(true);
  });

  it('un titre vide ne produit aucune ligne de texte', () => {
    const svg = dos({ titre: '', date: '' });
    expect(svg).not.toContain('<text');
  });
});

describe('gelatoSpine — la geometrie', () => {
  it('ecrit A PLAT : largeur = longueur du dos, hauteur = son epaisseur', () => {
    // L appelant pivote ensuite d un quart de tour (gelatoCoverComposer).
    const svg = dos({ largeurMm: 6, hauteurMm: 280 });
    expect(svg).toContain(`width="${Math.round(280 * PX_PAR_MM)}"`);
    expect(svg).toContain(`height="${Math.round(6 * PX_PAR_MM)}"`);
  });

  it('l annee est calee en fin de bande : au PIED du dos une fois pivote', () => {
    expect(dos()).toContain('text-anchor="end"');
  });

  it('le titre est centre', () => {
    expect(dos()).toContain('text-anchor="middle"');
  });

  it('echappe ce qui casserait le SVG', () => {
    const svg = dos({ titre: 'Marie & <Paul>' });
    expect(svg).toContain('Marie &amp; &lt;Paul&gt;');
    expect(svg).not.toContain('<Paul>');
  });
});
