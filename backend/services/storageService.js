const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const sizeOf = require('image-size');

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

const uploadFile = async (bucket, file, folder = '') => {
  try {
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${folder}/${uuidv4()}.${fileExt}`;

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

    return { success: true, url: publicUrl, fileName, ...(dimensions || {}) };
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