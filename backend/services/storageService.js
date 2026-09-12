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

// Miniature (grille "Mes souvenirs") et version intermediaire (affichage
// dans l'atelier une fois une photo placee) : deux tailles, jamais
// l'original. L'original uploade par uploadFile() n'est JAMAIS retouche —
// il reste la seule source pour le rendu PDF final (pageRenderer.js/
// pdfService.js continuent de lire book_content_items.url, inchange).
const THUMBNAIL_MAX_PX = 480;
const PREVIEW_MAX_PX = 1600;
const THUMBNAIL_QUALITY = 78;
const PREVIEW_QUALITY = 85;

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

// Genere une variante redimensionnee et l'uploade sous son propre nom de
// fichier. Retourne son URL publique, ou null si le redimensionnement ou
// l'upload echoue — jamais bloquant pour l'upload de l'original.
async function uploadResizedVariant(bucket, fileName, originalBuffer, maxPx, quality) {
  const resized = await resizeImage(originalBuffer, maxPx, quality);
  if (!resized) return null;

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, resized, { contentType: 'image/jpeg', cacheControl: '3600' });
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
    const fileExt = file.originalname.split('.').pop();
    const baseName = uuidv4();
    const fileName = `${folder}/${baseName}.${fileExt}`;

    // Buffer orientation-corrige (voir normalizeOrientation ci-dessus) :
    // c'est CELUI-LA qui devient "l'original" stocke, et c'est CELUI-LA qui
    // alimente la sonde de dimensions + les deux derivees juste en dessous
    // — un seul point de correction, tout le reste du pipeline en herite.
    const originalBuffer = await normalizeOrientation(file.buffer);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, originalBuffer, {
        contentType: file.mimetype,
        cacheControl: '3600'
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    const dimensions = probeImageDimensions(originalBuffer);

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
      ...(dimensions || {}),
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

module.exports = { uploadFile, deleteFile, deleteByPublicUrl, getSignedUrl };
