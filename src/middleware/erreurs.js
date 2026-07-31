const logger = require('../config/logger');

function gestionnaireErreurs(err, req, res, next) {
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`);

  if (err.code === '23505') {
    const champ = err.detail ? err.detail.match(/\(([^)]+)\)/)?.[1] : 'champ';
    return res.status(409).json({ message: `Doublon détecté sur le champ : ${champ}` });
  }

  if (err.code === '23503') {
    return res.status(422).json({ message: "Référence invalide : la ressource liée n'existe pas" });
  }

  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }

  const details = process.env.NODE_ENV === 'production' ? undefined : err.stack;
  return res.status(500).json({ message: 'Erreur interne du serveur', details });
}

function gestionnaire404(req, res) {
  res.status(404).json({ message: `Route inconnue : ${req.method} ${req.originalUrl}` });
}

module.exports = { gestionnaireErreurs, gestionnaire404 };
