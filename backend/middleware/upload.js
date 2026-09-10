const multer = require('multer');

// Configuration de multer pour stocker en mémoire
const storage = multer.memoryStorage();

// Filtre pour n'accepter que les images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format de fichier non supporté. Utilisez JPG, PNG, GIF ou WEBP.'), false);
  }
};

// Limites de taille — 20 Mo (pas 5 Mo) : une photo de smartphone moderne
// (12 a 48 Mpx) pese couramment 5 a 15 Mo en JPEG haute qualite, et ces
// photos servent de source pour l'impression (voir
// backend/services/composition/pdfService.js) ou une resolution correcte
// compte reellement — 5 Mo rejetait une part significative des photos
// reelles des utilisateurs (retour utilisateur 2026-09-10 : message "too
// large" recurrent). `files: 5` n'est aujourd'hui exploite par aucune route
// (toutes utilisent upload.single, jamais upload.array) — laisse tel quel,
// sans effet reel.
const limits = {
  fileSize: 20 * 1024 * 1024, // 20 Mo
  files: 5
};

const upload = multer({
  storage,
  fileFilter,
  limits
});

const MAX_PHOTO_SIZE_MB = Math.round(limits.fileSize / (1024 * 1024));

// Erreurs multer (voir ci-dessus) rejetees AVANT le handler de route — donc
// jamais interceptees par son propre try/catch (next(err) saute directement
// a un middleware d'erreur, jamais au handler normal). Sans repli dedie,
// Express renvoie sa page d'erreur par defaut (HTML, message brut de multer
// en anglais, ex. "File too large") au lieu d'un JSON exploitable par le
// frontend — c'est exactement ce qui produisait le message confus signale
// par l'utilisateur. Wrapper reutilisable : meme forme qu'upload.single(),
// mais renvoie toujours une reponse JSON {error} en francais.
function uploadSinglePhoto(fieldName = 'photo') {
  const middleware = upload.single(fieldName);
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) {
        next();
        return;
      }

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: `Photo trop volumineuse (maximum ${MAX_PHOTO_SIZE_MB} Mo). Reduisez sa taille (ex. export/compression depuis votre telephone) puis reessayez.`
          });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          res.status(413).json({ error: 'Trop de photos envoyees en une seule fois.' });
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({ error: "Champ de fichier inattendu ('photo' requis)." });
          return;
        }
        res.status(400).json({ error: err.message || "Erreur lors de l'envoi de la photo." });
        return;
      }

      // fileFilter rejette via un Error simple (pas MulterError) pour un
      // format non supporte — deja un message clair en francais (voir
      // fileFilter ci-dessus), transmis tel quel.
      res.status(400).json({ error: err.message || "Erreur lors de l'envoi de la photo." });
    });
  };
}

// Export par defaut = l'instance multer brute (compatibilite avec le code
// existant qui fait `const upload = require('../middleware/upload')` puis
// `upload.single(...)`) ; uploadSinglePhoto/MAX_PHOTO_SIZE_MB attaches sur
// ce meme objet, a importer par destructuration la ou on en a besoin :
// `const { uploadSinglePhoto } = require('../middleware/upload')`.
upload.uploadSinglePhoto = uploadSinglePhoto;
upload.MAX_PHOTO_SIZE_MB = MAX_PHOTO_SIZE_MB;
module.exports = upload;
