const express = require('express');
const { body, param, validationResult } = require('express-validator');
const clientsController = require('../controllers/clientsController');
const { verifierJWT, garderRole } = require('../middleware/auth');

const router = express.Router();

function validerRequete(req, res, next) {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({
      erreurs: erreurs.array().map((e) => ({ champ: e.path, message: e.msg, valeur: e.value })),
    });
  }
  next();
}

const validationClient = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('msisdn').matches(/^\+221[0-9]{9}$/).withMessage('Format attendu : +221XXXXXXXXX'),
  body('forfait_id').isInt().withMessage('forfait_id doit être un entier'),
];

/**
 * @openapi
 * /api/clients:
 *   get:
 *     summary: Liste paginée des clients
 *     tags: [Clients]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: forfait_id
 *         schema: { type: integer }
 *       - in: query
 *         name: statut
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limite
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Liste paginée
 */
// 🟢 ROUTE RAJOUTÉE : Récupérer la liste de TOUS les clients (GET /api/clients)
router.get('/', verifierJWT, async (req, res, next) => {
  try {
    // Si tu as une méthode "lister" dans ton contrôleur :
    if (clientsController.lister) {
      return clientsController.lister(req, res, next);
    }
    
    // Sinon fallback SQL direct
    const pool = require('../config/db');
    const query = `
      SELECT 
        c.id, c.utilisateur_id, c.msisdn, c.statut,
        u.nom, u.prenom, u.email,
        f.nom AS forfait_nom
      FROM clients c
      JOIN utilisateurs u ON c.utilisateur_id = u.id
      LEFT JOIN forfaits f ON c.forfait_id = f.id
      ORDER BY c.id DESC;
    `;
    const { rows } = await pool.query(query);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    next(err);
  }
});

// 🟢 ROUTE DÉTAIL D'UN CLIENT (GET /api/clients/:id)
router.get('/:id', verifierJWT, param('id').isInt(), validerRequete, async (req, res, next) => {
  try {
    if (clientsController.obtenirDetail) {
      return clientsController.obtenirDetail(req, res, next);
    }

    const pool = require('../config/db');
    const clientId = req.params.id;
    
    const query = `
      SELECT 
        c.id, c.utilisateur_id, c.msisdn, c.forfait_id, c.statut,
        u.nom, u.prenom, u.email,
        f.nom AS forfait_nom, f.quota_data_go, f.quota_voix_min, f.prix_mensuel_fcfa
      FROM clients c
      JOIN utilisateurs u ON c.utilisateur_id = u.id
      LEFT JOIN forfaits f ON c.forfait_id = f.id
      WHERE c.id = $1 OR c.utilisateur_id = $1;
    `;
    
    const { rows } = await pool.query(query, [clientId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Client non trouvé" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Erreur serveur lors de la récupération du profil client :", error);
    res.status(500).json({ message: "Erreur serveur interne", error: error.message });
  }
});

// 🟢 CRÉATION D'UN CLIENT
router.post('/', verifierJWT, garderRole('admin'), validationClient, validerRequete, async (req, res, next) => {
  try {
    const client = await clientsController.creer(req.body);
    res.status(201).json(client);
  } catch (err) { next(err); }
});

// 🟢 MODIFICATION D'UN CLIENT
router.put('/:id', verifierJWT, garderRole('admin'), validationClient, validerRequete, async (req, res, next) => {
  try {
    const client = await clientsController.modifier(req.params.id, req.body);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json(client);
  } catch (err) { next(err); }
});

// 🟢 CHANGEMENT DE STATUT
router.patch(
  '/:id/statut',
  verifierJWT,
  garderRole('admin'),
  body('statut').isIn(['actif', 'suspendu', 'resilie']).withMessage('Statut invalide'),
  validerRequete,
  async (req, res, next) => {
    try {
      const client = await clientsController.changerStatut(req.params.id, req.body.statut);
      res.json(client);
    } catch (err) {
      if (err.statut409) return res.status(409).json({ message: err.message });
      next(err);
    }
  }
);

// 🟢 SUPPRESSION D'UN CLIENT
router.delete('/:id', verifierJWT, garderRole('admin'), async (req, res, next) => {
  try {
    await clientsController.supprimer(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err.statut409) return res.status(409).json({ message: err.message });
    next(err);
  }
});

module.exports = router;