const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const sizeOf = require('image-size');
const sharp = require('sharp');

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

const uploadFile = async (bucket, file, folder = '') => {
  try {
    const fileExt = file.originalname.split('.').pop();
    const baseName = uuidv4();
    const fileName = `${folder}/${baseName}.${fileExt}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600'
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    const dimensions = probeImageDimensions(file.buffer);

    // Echec de generation d'une variante (format non reconnu par sharp,
    // etc.) : jamais bloquant, thumbnailUrl/previewUrl restent simplement
    // absents du resultat — l'appelant (routes/composition.js) omet alors le
    // champ correspondant dans metadata, et le frontend se replie
    // silencieusement sur l'URL originale (meme convention que
    // orientation/ratio/width/height, deja optionnels).
    const [thumbnailUrl, previewUrl] = await Promise.all([
      uploadResizedVariant(bucket, `${folder}/${baseName}_thumb.jpg`, file.buffer, THUMBNAIL_MAX_PX, THUMBNAIL_QUALITY),
      uploadResizedVariant(bucket, `${folder}/${baseName}_preview.jpg`, file.buffer, PREVIEW_MAX_PX, PREVIEW_QUALITY)
    ]);

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

module.exports = { uploadFile, deleteFile, getSignedUrl };
