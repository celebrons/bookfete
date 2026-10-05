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
// Lit un fichier local, l'uploade tel quel, retourne son URL publique — SAUF
// pour un PDF qui depasse MAX_SAFE_PDF_BYTES (voir compressPdfIfTooLarge),
// seul cas ou ce module retouche le fichier.

const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../../config/supabase');

const execFileAsync = promisify(execFile);

const PRINT_FILES_BUCKET = 'print-files';

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

// Premiere commande REELLE en echec, 2026-10-05 : "The object exceeded the
// maximum allowed size" — le bucket print-files (comme tout bucket de ce
// projet Supabase) est plafonne a 50 Mo PAR LE PROJET, pas juste par le
// bucket (verifie : impossible de relever cette limite via l'API, meme a
// 60 Mo, la demande elle-meme est refusee). Un livre de 36 pages (format
// livret) a produit un PDF de 62,7 Mo — rare, mais pas improbable des que
// beaucoup de photos haute resolution s'accumulent.
//
// 45 Mo (pas 50) : marge de securite, le fichier compresse n'a pas besoin
// de coller au plus pres de la limite.
const MAX_SAFE_PDF_BYTES = 45 * 1024 * 1024;

// Ghostscript -dPDFSETTINGS=/prepress : preset DESTINE a l'impression
// professionnelle (cible 300dpi), pas /ebook ou /screen (penses pour un
// ecran, visiblement plus degradants).
//
// PREMIER ESSAI (le meme jour) avec /printer rejete par Gelato : "ICC
// profile is not valid... syntaxiquement incorrect", sur TOUTES les pages
// du fichier compresse. Cause identifiee : /printer a pour
// ColorConversionStrategy par defaut UseDeviceIndependentColor (/prepress
// et /screen, eux, par defaut LeaveColorUnchanged) — cette conversion
// deforme ou reconstruit mal le profil ICC d'origine. Les deux options
// ci-dessous sont donc posees EXPLICITEMENT plutot que de compter sur le
// defaut d'un preset : aucune conversion de couleur, le profil ICC
// d'origine (pose par sharp/Chrome plus tot dans le pipeline) traverse
// intact.
//
// Verifie en conditions reelles sur le PDF de la commande qui a echoue
// (2026-10-05) : 62,7 Mo -> 42,0 Mo (-33%, un peu moins qu'avec /printer,
// le prix de ne plus toucher aux couleurs), memes dimensions de page
// (MediaBox identique), jamais de perte de page. N'EST APPLIQUE QUE SI LE
// FICHIER DEPASSE MAX_SAFE_PDF_BYTES — la tres grande majorite des livres
// continue de partir a l'imprimeur sans la moindre recompression.
async function compressPdfIfTooLarge(localFilePath) {
  const { size } = await fsp.stat(localFilePath);
  if (size <= MAX_SAFE_PDF_BYTES) return { path: localFilePath, compressed: false };

  const compressedPath = path.join(os.tmpdir(), `print-compressed-${uuidv4()}.pdf`);
  try {
    await execFileAsync('gs', [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dPDFSETTINGS=/prepress',
      '-dColorConversionStrategy=/LeaveColorUnchanged',
      '-dColorConversionStrategyForImages=/LeaveColorUnchanged',
      '-dNOPAUSE', '-dQUIET', '-dBATCH',
      '-dAutoRotatePages=/None',
      `-sOutputFile=${compressedPath}`,
      localFilePath
    ], { timeout: 180000, maxBuffer: 10 * 1024 * 1024 });

    const { size: compressedSize } = await fsp.stat(compressedPath);
    console.warn('[compressPdfIfTooLarge] fichier trop volumineux, compresse', {
      localFilePath, sizeAvant: size, sizeApres: compressedSize
    });
    // La compression peut echouer a suffire sur un cas extreme : on renvoie
    // alors quand meme le fichier compresse (toujours mieux que l'original)
    // — l'upload lui-meme tranchera, avec un message d'erreur desormais
    // honnete sur la taille reellement atteinte.
    return { path: compressedPath, compressed: true, cleanup: () => fsp.unlink(compressedPath).catch(() => {}) };
  } catch (error) {
    console.error('[compressPdfIfTooLarge] echec de la compression, tentative avec le fichier original', error.message);
    await fsp.unlink(compressedPath).catch(() => {});
    return { path: localFilePath, compressed: false };
  }
}

// uploadPath : chemin RELATIF dans le bucket (ex. "orders/<orderId>/interior.pdf")
// — a l'appelant de garantir l'unicite (typiquement en y incluant book.id +
// un timestamp/jobId, meme convention que PDF_EXPORT_DIR cote local).
async function uploadPrintFile(localFilePath, uploadPath) {
  const ext = path.extname(localFilePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

  // Seul un PDF peut etre compresse ainsi (ghostscript) : un fichier de
  // couverture (image) suit son chemin habituel, inchange.
  const source = ext === '.pdf' ? await compressPdfIfTooLarge(localFilePath) : { path: localFilePath };
  try {
    const buffer = await fsp.readFile(source.path);

    const { error } = await supabase.storage
      .from(PRINT_FILES_BUCKET)
      .upload(uploadPath, buffer, { contentType, cacheControl: '3600', upsert: true });

    if (error) {
      throw new Error(`Upload fichier impression echoue (${uploadPath}): ${error.message}`);
    }

    const { data } = supabase.storage.from(PRINT_FILES_BUCKET).getPublicUrl(uploadPath);
    return data.publicUrl;
  } finally {
    if (source.cleanup) await source.cleanup();
  }
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
  removePrintFilesForOrder,
  compressPdfIfTooLarge,
  MAX_SAFE_PDF_BYTES
};
