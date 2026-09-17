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

// Supprime tous les fichiers d'impression d'une commande.
//
// Chaque envoi a l'imprimeur depose ~46 Mo sous orders/<id>/ et rien ne les
// effacait ensuite : supprimer une commande laissait son fichier derriere
// elle, indefiniment. Mesure le 2026-09-17 : 555 Mo de residus pour un seul
// livre teste, sur un palier gratuit Supabase de 1 Go.
//
// Best effort, JAMAIS bloquant : un echec de menage ne doit pas empecher
// l'utilisateur de supprimer sa commande. Le pire cas est un fichier
// orphelin, que scripts/nettoyer-fichiers-impression.js sait retrouver.
async function removePrintFilesForOrder(orderId) {
  const prefixe = "orders/" + orderId;
  try {
    const { data: fichiers, error } = await supabase.storage
      .from(PRINT_FILES_BUCKET)
      .list(prefixe, { limit: 200 });

    if (error || !Array.isArray(fichiers) || fichiers.length === 0) {
      return { removed: 0 };
    }

    const chemins = fichiers.map((f) => prefixe + "/" + f.name);
    const { error: erreurSuppression } = await supabase.storage
      .from(PRINT_FILES_BUCKET)
      .remove(chemins);

    if (erreurSuppression) {
      console.warn("Menage des fichiers d'impression impossible (" + prefixe + ") :", erreurSuppression.message);
      return { removed: 0 };
    }
    return { removed: chemins.length };
  } catch (err) {
    console.warn("Menage des fichiers d'impression impossible (" + prefixe + ") :", err.message);
    return { removed: 0 };
  }
}

module.exports = {
  PRINT_FILES_BUCKET,
  uploadPrintFile,
  removePrintFilesForOrder
};
