// backend/config/sharp.js
//
// Reglages memoire de sharp, partages par TOUS les usages (upload de photos,
// rendu PDF, couverture Gelato). A importer a la place de `require('sharp')`.
//
// Pourquoi : l'instance d'hebergement (Render, offre gratuite) dispose de
// 512 Mo. Or traiter une photo moderne est couteux en memoire — une image de
// 24 Mpx decodee occupe ~70 Mo en bitmap, quel que soit le poids du fichier
// JPEG d'origine. Depasser la limite ne produit pas une erreur applicative :
// le processus est TUE, la requete en cours meurt sans reponse, et le
// navigateur affiche "Failed to fetch" (constate le 2026-09-12 sur un envoi
// de 40 photos, qui echouait a la 9e puis a la 33e — un rang variable, la
// signature typique d'une saturation de ressources et non d'une limite fixe).
//
// Deux reglages, tous deux orientes PIC MEMOIRE plutot que vitesse brute :
//
//   - cache(false) : par defaut sharp garde en memoire les donnees des
//     dernieres operations. Utile sur un serveur qui retraite les memes
//     images, inutile ici (chaque photo n'est traitee qu'une fois) et
//     directement pris sur les 512 Mo.
//
//   - concurrency(1) : par defaut libvips ouvre autant de fils qu'il y a de
//     coeurs, chacun allouant sa propre memoire de travail. Sur une machine
//     contrainte, c'est ce qui fait exploser le pic. Le cout en vitesse est
//     reel mais modere — et le rendu PDF, lui, tire deja son parallelisme du
//     niveau applicatif (l'encodage d'une page se fait pendant la capture de
//     la suivante, voir pdfService.capturePagesAsImages), pas des fils
//     internes de libvips.
//
// Ajustable par variables d'environnement si l'instance grossit un jour :
// SHARP_CONCURRENCY (entier) et SHARP_CACHE=1 pour reactiver le cache.

const sharp = require('sharp');

const concurrency = Number(process.env.SHARP_CONCURRENCY);
sharp.concurrency(Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 1);

if (process.env.SHARP_CACHE !== '1') {
  sharp.cache(false);
}

module.exports = sharp;
