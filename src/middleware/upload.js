const multer = require('multer');
const path = require('path');
const { randomUUID: uuidv4 } = require('crypto');

const TYPES_AUTORISES = ['image/jpeg', 'image/png', 'application/pdf', 'audio/mpeg', 'audio/wav', 'audio/ogg'];

const stockage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage: stockage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 10) * 1024 * 1024 },
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