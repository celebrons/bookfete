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

// TROIS essais le meme jour avant celui-ci (2026-10-05), sur la meme
// commande reelle :
//   1. /printer (defaut ColorConversionStrategy=UseDeviceIndependentColor) :
//      rejete par Gelato, "ICC profile is not valid".
//   2. /prepress + ColorConversionStrategy=LeaveColorUnchanged : MEME rejet.
//      Cause reelle trouvee en inspectant le PDF ORIGINAL (avant toute
//      compression, via qpdf --qdf) : Chrome (Page.printToPDF, moteur Skia)
//      embarque pour CHAQUE photo un profil ICC "sRGB" MAISON, tres
//      minimal (536 octets, description "Google/Skia/<hash>... Google Inc.
//      2016") — pas un profil standard. "Laisser inchange" le preservait
//      donc fidelement... invalide. Le probleme preexistait a toute
//      compression, simplement jamais revele avant (aucune commande n'avait
//      encore depasse l'etape taille chez Gelato).
//   3. CETTE version : ColorConversionStrategy(ForImages)=/RGB (pas
//      UseDeviceIndependentColor, pas LeaveColorUnchanged) convertit vers
//      du DeviceRGB simple, SANS AUCUN profil ICC embarque — confirme par
//      inspection du fichier produit (zero occurrence de "ICCBased" ou
//      "Skia"). /printer reste le preset (downsampling ~300dpi) : la ou
//      l'essai 2 perdait l'essentiel du gain de taille en renoncant a toute
//      conversion, celui-ci retrouve la compression tout en eliminant le
//      profil fautif.
//
// DEUXIEME commande reelle en echec, meme jour (2026-10-05) : l'etape
// /printer seule a tourne (gs n'a pas echoue) mais n'a quasiment rien
// gagne — 52 989 945 -> 52 922 806 octets (-0,13%). Cause : /printer laisse
// `AutoFilterColorImages=true`, qui choisit de NE PAS reencoder une image
// deja JPEG si Ghostscript la juge "assez bonne" — exactement le cas ici,
// a l'inverse du tout premier fichier (2026-09-05, 62,7 Mo) dont les
// photos, elles, avaient encore de la marge. Une seule passe ne suffit
// donc pas a GARANTIR de repasser sous la limite : on essaie maintenant
// plusieurs passes, de la moins agressive (qualite inchangee) a la plus
// agressive (reencodage JPEG force, resolution et qualite reduites),
// et on s'arrete des que l'une d'elles suffit.
const COMPRESSION_LADDER = [
  // Identique a l'unique passe d'avant : suffit pour l'ecrasante majorite
  // des livres qui depassent MAX_SAFE_PDF_BYTES (teste en conditions
  // reelles, -24% sur le tout premier cas).
  { label: 'printer', args: ['-dPDFSETTINGS=/printer'] },
  // Force un REENCODAGE JPEG explicite (AutoFilter desactive) a 200dpi/q75 :
  // la ou /printer pouvait renoncer a toucher une image deja "assez bonne",
  // ceci la reencode TOUJOURS, donc gagne reellement de la place meme sur
  // des photos deja compressees cote client.
  { label: '200dpi-q75', args: [
    '-dPDFSETTINGS=/printer',
    '-dDownsampleColorImages=true', '-dColorImageDownsampleType=/Bicubic', '-dColorImageResolution=200',
    '-dDownsampleGrayImages=true', '-dGrayImageDownsampleType=/Bicubic', '-dGrayImageResolution=200',
    '-dAutoFilterColorImages=false', '-dColorImageFilter=/DCTEncode',
    '-dAutoFilterGrayImages=false', '-dGrayImageFilter=/DCTEncode',
    '-dJPEGQ=75'
  ] },
  // Dernier recours, jamais rencontre a ce jour : 150dpi reste lisible a
  // l'impression (un format livret/standard n'a pas besoin de 300dpi pour
  // une photo pleine page), q60 degrade visiblement mais reste tres loin
  // d'un artefact JPEG grossier.
  { label: '150dpi-q60', args: [
    '-dPDFSETTINGS=/printer',
    '-dDownsampleColorImages=true', '-dColorImageDownsampleType=/Bicubic', '-dColorImageResolution=150',
    '-dDownsampleGrayImages=true', '-dGrayImageDownsampleType=/Bicubic', '-dGrayImageResolution=150',
    '-dAutoFilterColorImages=false', '-dColorImageFilter=/DCTEncode',
    '-dAutoFilterGrayImages=false', '-dGrayImageFilter=/DCTEncode',
    '-dJPEGQ=60'
  ] }
];

// Arguments communs a CHAQUE passe, quelle que soit son agressivite :
// -dColorConversionStrategy(ForImages)=/RGB est ce qui a corrige le bug
// ICC du 2026-10-05 (voir historique ci-dessus) — jamais a retirer d'une
// seule passe, sous peine de le reintroduire silencieusement.
const GS_BASE_ARGS = [
  '-sDEVICE=pdfwrite',
  '-dCompatibilityLevel=1.4',
  '-dColorConversionStrategy=/RGB',
  '-dColorConversionStrategyForImages=/RGB',
  '-dNOPAUSE', '-dQUIET', '-dBATCH',
  '-dAutoRotatePages=/None'
];

async function runGhostscript(sourcePath, outputPath, extraArgs) {
  await execFileAsync('gs', [
    ...GS_BASE_ARGS,
    ...extraArgs,
    `-sOutputFile=${outputPath}`,
    sourcePath
  ], { timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
  return (await fsp.stat(outputPath)).size;
}

// Verifie en conditions reelles sur le PDF de la toute premiere commande
// qui a echoue : 62,7 Mo -> 47,4 Mo (-24%), memes dimensions de page
// (MediaBox identique), jamais de perte de page, aucun profil ICC dans le
// resultat. N'EST APPLIQUE QUE SI LE FICHIER DEPASSE MAX_SAFE_PDF_BYTES —
// la tres grande majorite des livres continue de partir a l'imprimeur sans
// la moindre recompression, couleurs d'origine (bogue Skia ou non) inchangees.
async function compressPdfIfTooLarge(localFilePath) {
  const { size } = await fsp.stat(localFilePath);
  if (size <= MAX_SAFE_PDF_BYTES) return { path: localFilePath, compressed: false };

  let meilleurChemin = null;
  let meilleureTaille = Infinity;
  const nettoyerIntermediaire = async (chemin) => {
    if (chemin && chemin !== meilleurChemin) await fsp.unlink(chemin).catch(() => {});
  };

  for (const etape of COMPRESSION_LADDER) {
    const essaiPath = path.join(os.tmpdir(), `print-compressed-${etape.label}-${uuidv4()}.pdf`);
    try {
      const tailleObtenue = await runGhostscript(localFilePath, essaiPath, etape.args);
      console.warn('[compressPdfIfTooLarge] passe ' + etape.label, {
        localFilePath, sizeAvant: size, sizeApres: tailleObtenue
      });
      if (tailleObtenue < meilleureTaille) {
        await nettoyerIntermediaire(meilleurChemin);
        meilleurChemin = essaiPath;
        meilleureTaille = tailleObtenue;
      } else {
        await fsp.unlink(essaiPath).catch(() => {});
      }
      if (meilleureTaille <= MAX_SAFE_PDF_BYTES) break;
    } catch (error) {
      console.error('[compressPdfIfTooLarge] passe ' + etape.label + ' en echec, tentative suivante', error.message);
      await fsp.unlink(essaiPath).catch(() => {});
    }
  }

  if (!meilleurChemin) {
    // Les TROIS passes ont echoue a s'executer (gs manquant/casse) : seul
    // cas ou l'on retombe sur l'original, comme avant.
    return { path: localFilePath, compressed: false };
  }
  // Meme la plus agressive des trois passes peut, en theorie, ne pas
  // suffire : on renvoie alors quand meme le meilleur resultat obtenu
  // (toujours mieux que l'original) — l'upload lui-meme tranchera, avec un
  // message d'erreur desormais honnete sur la taille reellement atteinte.
  return { path: meilleurChemin, compressed: true, cleanup: () => fsp.unlink(meilleurChemin).catch(() => {}) };
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
