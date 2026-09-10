// backend/services/printing/printFileStorage.js
//
// Heberge un fichier deja genere sur disque (PDF interieur — pdfService.js —
// ou fichier de couverture) dans le bucket Supabase Storage PUBLIC
// "print-files" (cree le 2026-09-09, voir memoire "gelato-integration-status"),
// pour obtenir une URL PUBLIQUE que Gelato peut aller recuperer lui-meme.
// Gelato ne propose pas d'upload direct de fichier a la creation d'une
// commande — uniquement une URL (voir gelatoClient.js) : ce module existe
// pour ca specifiquement, distinct de storageService.js (photos utilisateur,
// signature multer-file) qui n'est pas adapte a un Buffer local genere par
// notre propre pipeline.
//
// Fonction volontairement simple (pas de redimensionnement/traitement — ce
// sont des fichiers d'impression deja finalises) : lit un fichier local,
// l'uploade tel quel, retourne son URL publique.

const fsp = require('fs/promises');
const path = require('path');
const supabase = require('../../config/supabase');

const PRINT_FILES_BUCKET = 'print-files';

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

// uploadPath : chemin RELATIF dans le bucket (ex. "orders/<orderId>/interior.pdf")
// — a l'appelant de garantir l'unicite (typiquement en y incluant book.id +
// un timestamp/jobId, meme convention que PDF_EXPORT_DIR cote local).
async function uploadPrintFile(localFilePath, uploadPath) {
  const buffer = await fsp.readFile(localFilePath);
  const ext = path.extname(localFilePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

  const { error } = await supabase.storage
    .from(PRINT_FILES_BUCKET)
    .upload(uploadPath, buffer, { contentType, cacheControl: '3600', upsert: true });

  if (error) {
    throw new Error(`Upload fichier impression echoue (${uploadPath}): ${error.message}`);
  }

  const { data } = supabase.storage.from(PRINT_FILES_BUCKET).getPublicUrl(uploadPath);
  return data.publicUrl;
}

module.exports = {
  PRINT_FILES_BUCKET,
  uploadPrintFile
};
