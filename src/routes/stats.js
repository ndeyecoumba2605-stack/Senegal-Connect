const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { verifierJWT, garderRole } = require('../middleware/auth');

/**
 * @openapi
 * /api/stats/dashboard:
 *   get:
 *     summary: Obtenir les métriques globales du tableau de bord
 *     description: Récupère les totaux de chiffre d'affaires, le nombre d'abonnés actifs, les incidents en cours et les indicateurs clés.
 *     tags: [Statistiques & Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Données statistiques compilées avec succès
 *       403:
 *         description: Accès refusé (Réservé aux administrateurs)
 */
router.get('/dashboard', verifierJWT, garderRole('admin'), statsController.obtenirDashboardStats);

/**
 * @openapi
 * /api/stats/ventes:
 *   get:
 *     summary: Répartition des ventes par forfait et par mois
 *     tags: [Statistiques & Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rapport de ventes généré
 *       403:
 *         description: Accès refusé
 */
router.get('/ventes', verifierJWT, garderRole('admin'), statsController.obtenirStatsVentes);

module.exports = router;