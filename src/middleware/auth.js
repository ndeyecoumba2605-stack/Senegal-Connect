const jwt = require('jsonwebtoken');

function verifierJWT(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'Token manquant' });

  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token manquant' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.user && req.user.role) {
      req.user.role = String(req.user.role).toLowerCase();
    }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expiré — veuillez vous reconnecter' });
    }
    return res.status(401).json({ message: 'Token invalide' });
  }
}

function garderRole(...rolesAutorises) {
  return (req, res, next) => {
    if (!req.user || !rolesAutorises.includes(req.user.role)) {
      return res.status(403).json({ message: 'Rôle insuffisant pour cette action' });
    }
    next();
  };
}

module.exports = { verifierJWT, garderRole };
