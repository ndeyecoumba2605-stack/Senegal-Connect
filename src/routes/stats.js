const express = require('express');
const { verifierJWT, garderRole } = require('../middleware/auth');
const statsController = require('../controllers/statsController');

/**
 * @openapi
 * /api/stats:
 *   get:
 *     tags:
 *       - Stats
 *     summary: Statistiques globales de l'application
 *     description: Retourne les métriques et compteurs principaux pour le tableau de bord administrateur.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistiques récupérées
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clients_actifs: { type: integer, example: 12 }
 *                 mrr_fcfa: { type: integer, example: 50000 }
 *                 factures_impayees: { type: integer, example: 3 }
 *                 tickets_ouverts: { type: integer, example: 4 }
 *       401:
 *         description: Token manquant ou invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Rôle insuffisant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
const router = express.Router();

router.get(
  '/',
  verifierJWT,
  garderRole('admin', 'agent'),
  async (req, res, next) => {
    try {
      const stats = await statsController.obtenirStats(req.user);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;