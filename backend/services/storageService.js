const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const sizeOf = require('image-size');
const sharp = require('../config/sharp');

// Sonde legere (pure JS, aucun binaire natif) les dimensions/orientation
// d'une image deja en memoire (multer memoryStorage — pas d'I/O supplementaire).
// Utilise par le moteur de mise en page (scoring, voir layoutScoring.js) comme
// facteur doux uniquement : ne bloque jamais l'upload si la sonde echoue
// (fichier non reconnu, corrompu...) — retourne simplement null dans ce cas.
function probeImageDimensions(buffer) {
  try {
    const { width, height } = sizeOf(buffer);
    if (!width || !height) return null;
    const orientation = width === height ? 'square' : width > height ? 'landscape' : 'portrait';
    return { width, height, orientation, ratio: Math.round((width / height) * 100) / 100 };
  } catch (_error) {
    return null;
  }
}

// Corrige l'orientation EXIF a l'upload (cahier des charges "PhotoSlot",
// 2026-09-10, §12) : une photo prise telephone/appareil en portrait est
// souvent stockee en pixels "paysage" + un tag EXIF Orientation indiquant
// la rotation a appliquer a l'affichage. sharp(...).rotate() (sans
// argument) applique cette rotation PHYSIQUEMENT aux pixels et remet le tag
// a 1 — necessaire car les derivees (thumbnail/preview ci-dessous,
// retaillees par sharp) ne respectent pas automatiquement l'EXIF d'origine
// une fois redimensionnees, contrairement a un <img> affiche brut.
//
// Ne reencode QUE si une correction est reellement necessaire (tag EXIF
// Orientation present et different de 1, sonde via sizeOf — image-size
// expose deja ce champ, aucune dependance supplementaire) : concilie ceci
// avec la garantie preexistante "l'original n'est jamais retouche" (voir
// storageService.test.js) pour le cas courant ou aucune rotation n'est
// necessaire — seules les photos qui en ont reellement besoin sont
// reencodees. Jamais bloquant : en cas d'echec (format non reconnu,
// fichier corrompu...), on retombe sur le buffer d'origine tel quel plutot
// que de faire echouer tout l'upload — meme philosophie que resizeImage
// ci-dessous.
async function normalizeOrientation(buffer) {
  try {
    const probe = sizeOf(buffer);
    if (!probe?.orientation || probe.orientation === 1) return buffer;
    return await sharp(buffer).rotate().toBuffer();
  } catch (_error) {
    return buffer;
  }
}

// HEIC/HEIF (format par defaut des photos iPhone, retour utilisateur,
// 2026-10-05 : plusieurs photos rejetees a l'upload avec "format non
// supporte"). Converti en JPEG ICI, inconditionnellement — jamais seulement
// quand capOriginalResolution redimensionne (une photo HEIC deja sous
// ORIGINAL_MAX_PX, ex. un export reduit, traverserait sinon tout le pipeline
// INCHANGEE et resterait stockee en HEIC : illisible par la plupart des
// navigateurs (Safari excepte) ET par Puppeteer, le moteur qui capture les
// pages pour le PDF/fichier imprimeur — l'upload semblerait reussir mais la
// photo n'apparaitrait nulle part ensuite).
//
// sharp.metadata() fait foi, jamais le Content-Type declare par le
// navigateur (deja peu fiable pour HEIC — beaucoup l'envoient en
// application/octet-stream, voir middleware/upload.js) ni l'extension du
// nom de fichier.
//
// .rotate() AVANT l'encodage JPEG, pour la meme raison que
// normalizeOrientation ci-dessus : sharp retire les metadonnees EXIF (dont
// l'orientation) par defaut a l'encodage — sans ce rotate ici, une photo
// prise en portrait ressortirait couchee, et normalizeOrientation() ne
// verrait plus jamais le tag puisqu'il aura deja disparu.
async function convertHeicToJpeg(buffer) {
  // Deux essais SEPARES, deliberement : si meme la lecture des metadonnees
  // echoue, le format est totalement inconnu (pas forcement du HEIC) — on
  // laisse alors le reste du pipeline (probeImageDimensions, plus bas dans
  // uploadFile) signaler l'erreur generique habituelle ("pas une image
  // valide"), jamais le message specifique HEIC ci-dessous qui serait
  // trompeur sur un fichier qui n'a jamais ete du HEIC.
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (_error) {
    return { buffer, converted: false };
  }
  if (metadata.format !== 'heif') return { buffer, converted: false };

  try {
    const jpeg = await sharp(buffer).rotate().jpeg({ quality: ORIGINAL_QUALITY }).toBuffer();
    return { buffer: jpeg, converted: true };
  } catch (error) {
    // Format CONFIRME heif, mais conversion impossible (variante non geree
    // par la version de libheif du serveur...) : jamais de store silencieux
    // d'un fichier illisible — l'appelant (uploadFile) renvoie une erreur
    // explicite plutot que de laisser deviner plus tard pourquoi la photo
    // n'apparait nulle part.
    //
    // Journalise (diagnostic, 2026-10-05 : premier vrai HEIC d'iPhone teste
    // en production, echoue alors qu'un conteneur heif de test — code AV1,
    // seul codec que ce serveur sait ENCODER, voir storageService.test.js —
    // passait) : seul un vrai message d'erreur libheif dira si c'est le
    // decodage HEVC qui manque, ou autre chose (variante de pixel format,
    // HEIC "live photo" multi-image, etc.).
    console.error('[convertHeicToJpeg] echec conversion heif->jpeg', {
      message: error.message,
      heifCompression: metadata.compression,
      heifChromaSubsampling: metadata.chromaSubsampling,
      heifPages: metadata.pages,
      width: metadata.width,
      height: metadata.height
    });
    return { buffer, converted: false, failed: true };
  }
}

// Miniature (grille "Mes souvenirs") et version intermediaire (affichage
// dans l'atelier une fois une photo placee) : deux tailles, jamais
// l'original tel quel — voir ORIGINAL_MAX_PX ci-dessous pour ce que
// "l'original" designe desormais.
const THUMBNAIL_MAX_PX = 480;
const PREVIEW_MAX_PX = 1600;
const THUMBNAIL_QUALITY = 78;
const PREVIEW_QUALITY = 85;

// PLAFOND DE L'ORIGINAL STOCKE (retour utilisateur, 2026-09-29 : quota de
// stockage Supabase depasse, 83% du bucket photos venant des originaux).
//
// scripts/audit-egress.js (2026-09-20) etablit que RIEN dans ce pipeline ne
// demande jamais plus de 2600px de large a une photo : l'impression lit un
// transform 2600px, la lecture PDF un transform 2000px — le fichier
// "original" est aujourd'hui la SEULE consommation reelle des pixels
// au-dela de ca. Un appareil photo/telephone moderne peut deposer des
// fichiers de 6000-8000px (souvent 15-25 Mo) dont les 3/4 des pixels ne
// servent jamais a rien.
//
// 3000px laisse une marge confortable au-dessus du plus gros besoin reel
// (2600px) : aucun impact sur la qualite d'impression, seulement sur les
// photos deja plus grandes que necessaire. NE s'applique QU'AUX NOUVEAUX
// uploads (retour utilisateur) — les photos deja en ligne ne sont pas
// retouchees ici.
//
// Qualite elevee (92, contre 78/85 pour thumb/preview) : ce fichier reste
// la source du rendu final, pas un simple apercu ecran.
const ORIGINAL_MAX_PX = 3000;
const ORIGINAL_QUALITY = 92;

// Ne redimensionne/reencode QUE si la photo depasse reellement le plafond —
// une photo deja plus petite (cas frequent : la plupart des photos
// existantes, et beaucoup de telephones deja regles sur une resolution
// moderee) traverse cette fonction OCTET POUR OCTET, inchangee. Jamais
// bloquant : une sonde ou un redimensionnement impossible retombe sur le
// buffer d'origine plutot que de faire echouer l'upload.
async function capOriginalResolution(buffer, maxPx) {
  try {
    const probe = sizeOf(buffer);
    if (!probe?.width || !probe?.height) return { buffer, reencoded: false };
    if (probe.width <= maxPx && probe.height <= maxPx) return { buffer, reencoded: false };

    const redimensionne = await sharp(buffer)
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: ORIGINAL_QUALITY })
      .toBuffer();
    if (!redimensionne) return { buffer, reencoded: false };
    return { buffer: redimensionne, reencoded: true };
  } catch (_error) {
    return { buffer, reencoded: false };
  }
}

// Redimensionne (jamais d'agrandissement d'une photo deja plus petite que
// la cible, voir withoutEnlargement) une image en memoire vers une nouvelle
// image JPEG. Jamais bloquant : retourne null si sharp echoue (format non
// reconnu, fichier corrompu...) — meme philosophie que probeImageDimensions.
async function resizeImage(buffer, maxPx, quality) {
  try {
    return await sharp(buffer)
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  } catch (_error) {
    return null;
  }
}

// UN AN DE CACHE, ET C'EST VOLONTAIRE (2026-09-20).
//
// Ces fichiers sont IMMUABLES : leur nom porte un identifiant unique genere
// au depot, et modifier une photo cree un nouveau fichier plutot que d'en
// remplacer un. Rien ne peut donc changer derriere une URL donnee.
//
// Elles etaient pourtant servies avec max-age=3600. Revenir sur son livre
// le lendemain retelechargeait tout, et un simple aller-retour entre deux
// pages de l'atelier pouvait suffire. Sur une photothèque de 0,52 Go servie
// 5,5 Go en un mois, une bonne part venait de la : les memes images,
// encore et encore.
//
// Le drapeau immutable dit au navigateur de ne meme pas REVALIDER (pas de requete
// conditionnelle, pas de 304) tant que le cache est frais.
const CACHE_UN_AN = '31536000, immutable';

// Genere une variante redimensionnee et l'uploade sous son propre nom de
// fichier. Retourne son URL publique, ou null si le redimensionnement ou
// l'upload echoue — jamais bloquant pour l'upload de l'original.
async function uploadResizedVariant(bucket, fileName, originalBuffer, maxPx, quality) {
  const resized = await resizeImage(originalBuffer, maxPx, quality);
  if (!resized) return null;

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, resized, { contentType: 'image/jpeg', cacheControl: CACHE_UN_AN });
    if (error) return null;

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return publicUrl;
  } catch (_error) {
    return null;
  }
}

// Supprime un fichier a partir de son URL PUBLIQUE, telle que stockee dans
// book_content_items.url / metadata.thumbnailUrl / metadata.previewUrl.
// Forme attendue :
//   https://<projet>.supabase.co/storage/v1/object/public/<bucket>/<chemin>
//
// Best effort, JAMAIS bloquant : un fichier qu'on n'arrive pas a supprimer
// n'est qu'un octet de trop dans le stockage, alors qu'une erreur ici
// empecherait l'utilisateur de nettoyer ses propres photos. On ne fait donc
// jamais echouer l'appelant pour ca.
const deleteByPublicUrl = async (publicUrl) => {
  try {
    const marker = '/storage/v1/object/public/';
    const raw = String(publicUrl || '');
    const at = raw.indexOf(marker);
    if (at === -1) return false;

    const rest = raw.slice(at + marker.length);
    const slash = rest.indexOf('/');
    if (slash === -1) return false;

    const bucket = rest.slice(0, slash);
    // Les noms de fichiers sont des uuid, mais le chemin peut contenir des
    // caracteres encodes : on decode avant de le passer au SDK.
    const filePath = decodeURIComponent(rest.slice(slash + 1));
    if (!bucket || !filePath) return false;

    const { error } = await supabase.storage.from(bucket).remove([filePath]);
    return !error;
  } catch (_error) {
    return false;
  }
};

const uploadFile = async (bucket, file, folder = '') => {
  try {
    const baseName = uuidv4();

    // HEIC/HEIF d'abord (voir convertHeicToJpeg ci-dessus) : convertit (et
    // oriente) inconditionnellement, AVANT le reste du pipeline, qui continue
    // ensuite a ignorer completement ce cas.
    const heicResult = await convertHeicToJpeg(file.buffer);
    if (heicResult.failed) {
      return {
        success: false,
        invalidContent: true,
        error: "Cette photo (HEIC/HEIF) n'a pas pu être convertie. Essayez de l'exporter en JPEG depuis votre téléphone, puis réessayez."
      };
    }

    // Buffer orientation-corrige (voir normalizeOrientation ci-dessus — deja
    // fait par convertHeicToJpeg si la photo etait HEIC), puis plafonne a
    // ORIGINAL_MAX_PX si necessaire (voir capOriginalResolution) — c'est CE
    // buffer final qui devient "l'original" stocke, et c'est lui qui
    // alimente la sonde de dimensions + les deux derivees juste en dessous —
    // un seul point de correction, tout le reste du pipeline en herite.
    const orienteBuffer = heicResult.converted ? heicResult.buffer : await normalizeOrientation(file.buffer);
    const { buffer: originalBuffer, reencoded: redimensionne } = await capOriginalResolution(orienteBuffer, ORIGINAL_MAX_PX);
    // L'extension/le type MIME stockes doivent suivre les VRAIS octets,
    // qu'ils aient change pour la taille (redimensionne) ou pour le format
    // (heicResult.converted) — l'un ou l'autre suffit.
    const reencoded = redimensionne || heicResult.converted;

    // VALIDATION REELLE DU CONTENU (plan de mise en production, "protection
    // des uploads") : jusqu'ici, seul l'EN-TETE Content-Type declare par le
    // navigateur etait verifie (middleware/upload.js) — un fichier quelconque
    // envoye avec `Content-Type: image/jpeg` passait ce filtre sans
    // probleme, puis partait vers le stockage tel quel (confirme par un test
    // qui l'acceptait explicitement comme "jamais bloquant"). On decode
    // vraiment les octets ICI, avant tout envoi au stockage — jamais apres,
    // ce qui aurait laisse un fichier invalide deja stocke.
    const dimensionsReelles = probeImageDimensions(originalBuffer);
    if (!dimensionsReelles) {
      // `invalidContent` distingue une FAUTE DU CLIENT (400) d'une panne de
      // stockage reelle (500) — voir les appelants (routes/composition.js,
      // routes/collective.js).
      return {
        success: false,
        invalidContent: true,
        error: "Le fichier envoye n'est pas une image valide (contenu illisible)."
      };
    }

    // Reencode en JPEG uniquement si la photo depassait le plafond (voir
    // capOriginalResolution) : l'extension/le type MIME doivent alors suivre
    // les VRAIS octets stockes, jamais ceux du fichier d'origine — un .png
    // dont le contenu est en realite du JPEG casserait sa lecture ailleurs.
    const fileExt = reencoded ? 'jpg' : file.originalname.split('.').pop();
    const contentType = reencoded ? 'image/jpeg' : file.mimetype;
    const fileName = `${folder}/${baseName}.${fileExt}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, originalBuffer, {
        contentType,
        cacheControl: CACHE_UN_AN
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    // Echec de generation d'une variante (format non reconnu par sharp,
    // etc.) : jamais bloquant, thumbnailUrl/previewUrl restent simplement
    // absents du resultat — l'appelant (routes/composition.js) omet alors le
    // champ correspondant dans metadata, et le frontend se replie
    // silencieusement sur l'URL originale (meme convention que
    // orientation/ratio/width/height, deja optionnels).
    // SEQUENTIEL, et non Promise.all : les deux variantes decodent chacune
    // l'image entiere (~70 Mo en bitmap pour une photo de 24 Mpx). Les lancer
    // ensemble doublait le pic memoire et faisait TUER le processus sur une
    // instance de 512 Mo — le navigateur affichait alors "Failed to fetch",
    // a un rang variable selon le poids des photos (constate le 2026-09-12 :
    // echec a la 9e photo, puis a la 33e sur un second essai).
    // Le gain de vitesse du parallelisme etait marginal ici (l'envoi vers le
    // stockage domine), le cout en memoire ne l'etait pas.
    const thumbnailUrl = await uploadResizedVariant(bucket, `${folder}/${baseName}_thumb.jpg`, originalBuffer, THUMBNAIL_MAX_PX, THUMBNAIL_QUALITY);
    const previewUrl = await uploadResizedVariant(bucket, `${folder}/${baseName}_preview.jpg`, originalBuffer, PREVIEW_MAX_PX, PREVIEW_QUALITY);

    return {
      success: true,
      url: publicUrl,
      fileName,
      ...dimensionsReelles,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(previewUrl ? { previewUrl } : {})
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const deleteFile = async (bucket, fileName) => {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([fileName]);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Supprime TOUT un dossier d'un coup (les photos d'un livre vivent sous
// <bucket>/<bookId>/..., voir uploadFile ci-dessus) — plutot que de
// supprimer fichier par fichier a partir des URL de book_content_items.
//
// Pourquoi ca compte (retour utilisateur, plan de mise en production —
// "purge des comptes anonymes abandonnes") : une suppression de LIGNES
// (books, book_content_items...) ne touche jamais au stockage — ce sont
// deux systemes distincts chez Supabase. Jusqu'ici, supprimer un livre
// (nettoyage des brouillons, compte abandonne) laissait ses photos
// orphelines dans le bucket, pour toujours. Lister le DOSSIER directement
// retrouve aussi les fichiers qu'une ligne DB supprimee ou jamais ecrite
// ne permettrait plus de retrouver par leur URL.
//
// Best effort, jamais bloquant : voir deleteByPublicUrl ci-dessus pour la
// meme regle.
const deleteBookFolder = async (bucket, bookId) => {
  try {
    const { data: fichiers, error } = await supabase.storage.from(bucket).list(String(bookId));
    if (error || !fichiers?.length) return { success: true, removed: 0 };

    const chemins = fichiers.map((f) => `${bookId}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(bucket).remove(chemins);
    if (removeError) return { success: false, removed: 0, error: removeError.message };
    return { success: true, removed: chemins.length };
  } catch (error) {
    return { success: false, removed: 0, error: error.message };
  }
};

const getSignedUrl = async (bucket, fileName, expiresIn = 3600) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileName, expiresIn);

    if (error) throw error;
    return { success: true, url: data.signedUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  uploadFile,
  deleteFile,
  deleteByPublicUrl,
  deleteBookFolder,
  getSignedUrl,
  // Exportes pour scripts/plafonner-photos-existantes.js (retour utilisateur,
  // 2026-09-29) : reutilise EXACTEMENT la meme logique/les memes constantes
  // que les nouveaux uploads, plutot que de la dupliquer et risquer un
  // desalignement futur entre les deux.
  capOriginalResolution,
  ORIGINAL_MAX_PX,
  ORIGINAL_QUALITY
};
