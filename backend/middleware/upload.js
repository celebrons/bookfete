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

// Limites de taille (5MB par fichier)
const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB
  files: 5 // Maximum 5 fichiers par requête
};

const upload = multer({
  storage,
  fileFilter,
  limits
});

module.exports = upload;