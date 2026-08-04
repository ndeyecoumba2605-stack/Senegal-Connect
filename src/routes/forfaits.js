const express = require('express');
const router = express.Router();
const forfaitsController = require('../controllers/forfaitsController');
const { verifierJWT, garderRole } = require('../middleware/auth');

/**
 * @openapi
 * /api/forfaits:
 *   get:
 *     summary: Obtenir la liste de tous les forfaits Internet
 *     tags: [Forfaits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des forfaits récupérée avec succès
 *       401:
 *         description: Non authentifié
 */
router.get('/', verifierJWT, forfaitsController.lister);

/**
 * @openapi
 * /api/forfaits/{id}:
 *   get:
 *     summary: Obtenir les détails d'un forfait spécifique
 *     tags: [Forfaits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Détails du forfait retournés
 *       404:
 *         description: Forfait introuvable
 */
router.get('/:id', verifierJWT, forfaitsController.obtenirParId);

/**
 * @openapi
 * /api/forfaits:
 *   post:
 *     summary: Créer un nouveau forfait réseau
 *     tags: [Forfaits]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, debit_mbps, prix_mensuel]
 *             properties:
 *               nom:
 *                 type: string
 *                 example: Fibre Pro 100M
 *               debit_mbps:
 *                 type: integer
 *                 example: 100
 *               prix_mensuel:
 *                 type: number
 *                 example: 25000
 *               description:
 *                 type: string
 *                 example: Offre haut débit pour professionnels
 *     responses:
 *       201:
 *         description: Forfait créé avec succès
 *       403:
 *         description: Accès interdit (Réservé aux administrateurs)
 */
router.post('/', verifierJWT, garderRole('admin'), forfaitsController.creer);

/**
 * @openapi
 * /api/forfaits/{id}:
 *   put:
 *     summary: Modifier un forfait existant
 *     tags: [Forfaits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Forfait mis à jour avec succès
 *       403:
 *         description: Accès interdit
 */
router.put('/:id', verifierJWT, garderRole('admin'), forfaitsController.modifier);

/**
 * @openapi
 * /api/forfaits/{id}:
 *   delete:
 *     summary: Supprimer un forfait
 *     tags: [Forfaits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Forfait supprimé avec succès
 *       403:
 *         description: Accès interdit
 */
router.delete('/:id', verifierJWT, garderRole('admin'), forfaitsController.supprimer);

module.exports = router;