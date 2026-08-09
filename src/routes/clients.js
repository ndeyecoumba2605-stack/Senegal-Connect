const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../config/db');
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
// clientsController.creer(req, res, next) gère déjà la réponse et les erreurs
// (il appelle next(err) lui-même) : on le branche directement comme middleware,
// on ne l'appelle pas avec des arguments positionnels.
router.post('/', verifierJWT, garderRole('admin'), validationClient, validerRequete, clientsController.creer);

// 🟢 MODIFICATION D'UN CLIENT
router.put('/:id', verifierJWT, garderRole('admin'), validationClient, validerRequete, clientsController.modifier);

// 🟢 CHANGEMENT DE STATUT
// Un admin peut définir n'importe quel statut sur n'importe quel client.
// Un client peut uniquement se suspendre/réactiver LUI-MÊME (désactivation
// temporaire) — jamais se résilier via cette route ni toucher à un autre
// compte : la résiliation reste une décision admin (ou passe par la
// suppression de compte self-service ci-dessous).
router.patch(
  '/:id/statut',
  verifierJWT,
  body('statut').isIn(['actif', 'suspendu', 'resilie']).withMessage('Statut invalide'),
  validerRequete,
  async (req, res, next) => {
    if (req.user.role === 'client') {
      const statutAutorise = ['actif', 'suspendu'].includes(req.body.statut);
      if (!statutAutorise) {
        return res.status(403).json({
          message: 'Vous ne pouvez que suspendre ou réactiver votre propre compte',
        });
      }

      try {
        // ⚠️ CORRIGÉ : req.user.id est un ID de la table "utilisateurs" (issu du
        // JWT), mais req.params.id désigne ici un ID de la table "clients" —
        // ce sont deux espaces d'ID différents. On résout l'un vers l'autre
        // avant de comparer, sinon la comparaison échoue systématiquement et
        // un client ne peut jamais suspendre son propre compte.
        const resultat = await db.query('SELECT id FROM clients WHERE utilisateur_id = $1', [req.user.id]);
        const monClientId = resultat.rows[0]?.id;
        if (!monClientId || String(monClientId) !== String(req.params.id)) {
          return res.status(403).json({
            message: 'Vous ne pouvez que suspendre ou réactiver votre propre compte',
          });
        }
        return next();
      } catch (err) {
        return next(err);
      }
    }
    return garderRole('admin')(req, res, next);
  },
  clientsController.changerStatut
);

// 🟢 SUPPRESSION DE SON PROPRE COMPTE (self-service, client connecté)
// IMPORTANT : déclarée AVANT "/:id" pour que "DELETE /me" ne soit pas
// interprété comme "DELETE /:id" avec id="me" (Express matche dans l'ordre
// de déclaration), ce qui l'aurait fait tomber sur la route admin-only.
router.delete('/me', verifierJWT, clientsController.supprimerMonCompte);

// 🟢 SUPPRESSION D'UN CLIENT (admin)
router.delete('/:id', verifierJWT, garderRole('admin'), clientsController.supprimer);

/**
 * @openapi
 * /api/clients/{id}/forfait:
 *   patch:
 *     summary: Change le forfait d'un client (self-service ou admin)
 *     tags: [Clients]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [forfait_id]
 *             properties:
 *               forfait_id: { type: integer, example: 2 }
 *     responses:
 *       200: { description: Forfait mis à jour }
 *       403: { description: "Un client ne peut modifier que son propre forfait" }
 */
router.patch(
  '/:id/forfait',
  verifierJWT,
  body('forfait_id').isInt().withMessage('forfait_id doit être un entier'),
  validerRequete,
  (req, res, next) => {
    // Un client ne peut changer que SON PROPRE forfait (id ou utilisateur_id).
    if (req.user.role === 'client' && String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ message: "Vous ne pouvez modifier que votre propre forfait" });
    }
    next();
  },
  clientsController.changerForfait
);

module.exports = router;