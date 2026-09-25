// backend/services/printing/gelatoSpine.js
//
// LE DOS DU LIVRE : le titre et l'annee, sur la bande de couleur.
//
// Jusqu'au 2026-09-25, le dos etait un aplat de couleur, sans rien —
// explicitement note « passe 1 » dans gelatoCoverComposer.js, en attendant
// de savoir ce que l'imprimeur rendait vraiment. Le premier livre recu a
// tranche : « il y a assez d'espace pour mettre le titre et la date sur la
// bande doree, meme avec 30 pages ».
//
// COMBIEN DE PLACE, AU JUSTE ? Cotes reelles demandees a Gelato le
// 2026-09-25, pour du 21x28 :
//
//            30 p    40 p    60 p    100 p
//   rigide   6,00    6,00    9,00    11,00  mm
//   souple   2,88    3,65    5,20     8,30  mm
//
// Un livre rigide a donc 6 mm de dos des la pagination minimale : de quoi
// poser une ligne. Un livre souple de 30 pages n'a que 2,9 mm — un texte
// y serait tranche par le pli ou deborderait sur les plats. D'ou un seuil,
// et non une regle unique : le dos se signe quand il peut, il reste muet
// quand il ne peut pas.
//
// COMMENT C'EST DESSINE. Le texte est ecrit HORIZONTALEMENT dans une bande
// de la longueur du dos, puis l'image est pivotee d'un quart de tour par
// l'appelant. Ecrire directement dans une bande haute et etroite obligerait
// a poser une rotation SVG et a calculer la ligne de base a la main, pour
// exactement le meme resultat — avec une occasion de plus de se tromper.
//
// SENS DE LECTURE : de haut en bas, livre debout. C'est la convention des
// livres modernes, francais comme anglo-saxons : le titre se lit sans effort
// quand l'ouvrage est pose a plat, couverture vers le ciel.

const { contrastRatio } = require('../composition/typographySystem');

// En deca, on ne signe pas le dos. Voir le tableau ci-dessus : 6 mm est
// exactement ce que donne un livre rigide au minimum de pages, et c'est
// aussi le plancher en dessous duquel la derive de reliure (+/- 1 a 2 mm
// sur un dos colle) mangerait une partie des lettres.
const LARGEUR_MINIMALE_MM = 6;

// Marge laissee en tete et en pied du dos. Un titre qui court jusqu'aux
// coins tombe dans la zone de pliage du carton.
const MARGE_BOUT_MM = 18;

const ENCRE_CLAIRE = '#fffdf7';
const ENCRE_SOMBRE = '#2a2119';

/** Le dos est-il assez large pour porter du texte ? */
function leDosPeutPorterDuTexte(largeurMm) {
  return Number(largeurMm) >= LARGEUR_MINIMALE_MM;
}

/**
 * Couleur d'encre lisible sur le fond du dos.
 * Jamais choisie par l'utilisateur : deduite du contraste reel, exactement
 * comme le titre de couverture (voir coverTheme.applyCoverColor).
 */
function encrePourLeFond(fond) {
  const surSombre = contrastRatio(ENCRE_CLAIRE, fond) > contrastRatio(ENCRE_SOMBRE, fond);
  return surSombre ? ENCRE_CLAIRE : ENCRE_SOMBRE;
}

function echapper(valeur) {
  return String(valeur || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Raccourcit un titre trop long pour la place disponible.
 * La largeur d'un caractere est estimee, pas mesuree : on ne dispose pas du
 * moteur de rendu ici. L'estimation est VOLONTAIREMENT large (0,62 em pour
 * une serif, qui tourne plutot autour de 0,5) — mieux vaut un titre coupe
 * un mot trop tot qu'un titre qui deborde sur les plats.
 */
function raccourcir(texte, longueurDisponibleMm, tailleMm) {
  const propre = String(texte || '').trim();
  if (!propre) return '';
  const largeurCaractere = tailleMm * 0.62;
  const maxCaracteres = Math.max(4, Math.floor(longueurDisponibleMm / largeurCaractere));
  if (propre.length <= maxCaracteres) return propre;
  return `${propre.slice(0, maxCaracteres - 1).trimEnd()}…`;
}

/**
 * SVG du dos, ecrit a plat : largeur = LONGUEUR du dos, hauteur = sa
 * largeur. L'appelant pivote ensuite d'un quart de tour.
 *
 * @param {object} input
 * @param {number} input.largeurMm  largeur du dos (l'epaisseur du livre)
 * @param {number} input.hauteurMm  hauteur du dos (celle du livre)
 * @param {number} input.pxParMm    meme echelle que le reste de la couverture
 * @param {string} input.fond       couleur de la bande
 * @param {string} [input.titre]
 * @param {string} [input.date]     l'annee, posee au PIED du dos
 * @returns {string} SVG
 */
function construireSvgDuDos({ largeurMm, hauteurMm, pxParMm, fond, titre, date }) {
  const largeurPx = Math.round(hauteurMm * pxParMm); // a plat : la longueur
  const hauteurPx = Math.round(largeurMm * pxParMm); // a plat : l'epaisseur
  const fondSur = fond || '#8f8a7c';

  const fragments = [
    `<rect width="100%" height="100%" fill="${echapper(fondSur)}"/>`
  ];

  if (leDosPeutPorterDuTexte(largeurMm)) {
    const encre = encrePourLeFond(fondSur);
    // La lettre occupe un peu plus de la moitie de l'epaisseur du dos : le
    // reste fait les deux marges laterales, celles qui encaissent la derive
    // de reliure.
    const tailleMm = largeurMm * 0.52;
    const taillePx = tailleMm * pxParMm;
    const margeePx = MARGE_BOUT_MM * pxParMm;
    const disponibleMm = Math.max(10, hauteurMm - MARGE_BOUT_MM * 2);

    const anneePropre = String(date || '').trim();
    // L'annee est posee au pied. Le titre garde tout le reste, moins un
    // blanc de respiration, pour qu'ils ne puissent jamais se toucher.
    const placeAnneeMm = anneePropre ? anneePropre.length * tailleMm * 0.62 + 10 : 0;
    const titrePropre = raccourcir(titre, disponibleMm - placeAnneeMm, tailleMm);

    // Ligne de base : le texte est centre sur l'epaisseur du dos.
    const ligneBase = hauteurPx / 2 + taillePx * 0.35;
    const police = "Georgia, 'Times New Roman', 'DejaVu Serif', serif";

    if (titrePropre) {
      fragments.push(
        `<text x="${largeurPx / 2}" y="${ligneBase}" font-family="${police}" font-size="${taillePx.toFixed(1)}"`
        + ` fill="${encre}" text-anchor="middle" letter-spacing="${(taillePx * 0.06).toFixed(2)}">${echapper(titrePropre)}</text>`
      );
    }
    if (anneePropre) {
      // A plat, le PIED du dos est la fin de la bande : l'annee y est calee
      // a droite, et se retrouve en bas une fois l'image pivotee.
      fragments.push(
        `<text x="${largeurPx - margeePx}" y="${ligneBase}" font-family="${police}" font-size="${(taillePx * 0.82).toFixed(1)}"`
        + ` fill="${encre}" text-anchor="end" letter-spacing="${(taillePx * 0.05).toFixed(2)}">${echapper(anneePropre)}</text>`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeurPx}" height="${hauteurPx}">${fragments.join('')}</svg>`;
}

module.exports = {
  construireSvgDuDos,
  leDosPeutPorterDuTexte,
  encrePourLeFond,
  raccourcir,
  LARGEUR_MINIMALE_MM
};
