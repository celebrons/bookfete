// backend/services/composition/photoSource.js
//
// QUELLE IMAGE ENVOYER AU NAVIGATEUR POUR CE RENDU ?
//
// Chaque photo existe en trois exemplaires depuis son depot (voir
// storageService.js) : l'ORIGINAL, une PREVIEW de 1600 px et une VIGNETTE de
// 480 px. Mesure du 2026-09-20 sur des photos reelles de 3024x4032 :
//
//   original          1,34 a 1,68 Mo
//   preview  1600 px  0,28 a 0,40 Mo
//   vignette  480 px  0,02 a 0,03 Mo
//
// L'atelier et l'apercu final affichaient l'ORIGINAL sur chaque page. Une
// page de 21 x 28 cm fait au mieux 800 px de large a l'ecran : on
// telechargeait donc 1,4 Mo pour en afficher l'equivalent de 0,05. Parcourir
// un livre de 30 pages coutait 76 Mo au lieu de 16 — et c'est le geste le
// plus frequent de toute l'application, bien avant la commande.
//
// C'est ce qui a mis l'hebergement au-dessus de son quota : 5,5 Go servis
// pour 0,52 Go stockes, soit toute la photothèque livree dix fois.
//
// CE QUI N'EST PAS CONCERNE : le PDF et le fichier d'impression. Ces deux-la
// choisissent deja leur source (pdfService.allegerLesPhotos demande une
// version redimensionnee a 2000 px pour la lecture, et garde l'original pour
// le massicot). Ils passent donc `telle-quelle` et ce module ne touche a
// rien — deux mecanismes qui se superposeraient finiraient par se
// contredire.
//
// REPLI SYSTEMATIQUE SUR L'ORIGINAL : les photos deposees avant l'existence
// des derivees n'ont pas de `previewUrl`. Elles continuent de s'afficher,
// simplement sans l'economie. Jamais d'image manquante.

const SOURCE_ECRAN = 'ecran';
const SOURCE_TELLE_QUELLE = 'telle-quelle';

/**
 * @param {object} item - book_content_item
 * @returns {string} l'URL a mettre dans le HTML pour un affichage ECRAN
 */
function urlPourEcran(item) {
  if (item?.kind !== 'photo') return item?.url;
  return item?.metadata?.previewUrl || item?.url;
}

/**
 * Remplace l'URL de chaque photo par sa version d'ecran.
 *
 * Renvoie le tableau d'origine TEL QUEL quand il n'y a rien a changer : les
 * appelants comparent parfois les items par reference, et recopier sans
 * raison creerait des differences invisibles a debusquer.
 *
 * @param {Array} items
 * @param {string} source - 'ecran' (defaut) ou 'telle-quelle'
 */
function pourLAffichage(items, source = SOURCE_ECRAN) {
  if (source === SOURCE_TELLE_QUELLE) return items;
  if (!Array.isArray(items)) return items;

  let uneSeuleChangee = false;
  const resultat = items.map((item) => {
    const url = urlPourEcran(item);
    if (!url || url === item?.url) return item;
    uneSeuleChangee = true;
    return { ...item, url };
  });

  return uneSeuleChangee ? resultat : items;
}

module.exports = {
  pourLAffichage,
  urlPourEcran,
  SOURCE_ECRAN,
  SOURCE_TELLE_QUELLE
};
