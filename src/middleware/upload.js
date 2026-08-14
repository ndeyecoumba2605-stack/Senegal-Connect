const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID: uuidv4 } = require('crypto');

const TYPES_AUTORISES = ['image/jpeg', 'image/png', 'application/pdf', 'audio/mpeg', 'audio/wav', 'audio/ogg'];


const DOSSIER_UPLOADS = path.join(__dirname, '../../uploads');
fs.mkdirSync(DOSSIER_UPLOADS, { recursive: true });

const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOSSIER_UPLOADS),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

// MAX_FILE_SIZE dans .env est déjà exprimé en octets (10485760 = 10 Mo) :
// on ne le multiplie pas une seconde fois, sinon la limite de 10 Mo est
// silencieusement désactivée (elle deviendrait ~10 To).
const TAILLE_MAX_OCTETS = parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024;

const upload = multer({
  storage: stockage,
  limits: { fileSize: TAILLE_MAX_OCTETS },
  fileFilter: (req, file, cb) => {
    if (!TYPES_AUTORISES.includes(file.mimetype)) {
      return cb(new Error('Type de fichier non autorisé'));
    }
    cb(null, true);
  },
});

function typeDepuisMime(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'fichier';
}

module.exports = { upload, typeDepuisMime };